// Internal module: CPA image / video generation support.
//
// P1 scope: classify catalog models as chat / image / video, own the
// independent `media-settings.json` preferences, and run a read-only
// diagnostic against one CPA server. Nothing here generates media or spends
// upstream quota. Keys are passed in per call and never stored or returned.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join } from "node:path";

// #region Classification

export const MEDIA_KINDS = ["chat", "image", "video"];

// Families CLIProxyAPI routes to its image / video handlers
// (sdk/api/handlers/openai/openai_{images,videos}_handlers.go), matched by
// prefix: a catalog may list variants CPA does not accept yet (BCPA lists
// `grok-imagine-video-1.5-lite`; CPA 9e79552 accepts only the base, `-1.5`
// and `-1.5-preview`). Such a model still cannot chat, so it is a media
// model, and CPA's own error explains a refused generation. Compare against
// those handlers when CPA adds a family.
const CPA_IMAGE_PREFIXES = ["grok-imagine-image", "gpt-image-"];
const CPA_VIDEO_PREFIXES = ["grok-imagine-video"];
const SORA_ALIAS_TARGET = "grok-imagine-video";

/** The model id without an account / vendor prefix, lower-cased. */
export function bareModelId(id) {
  return String(id ?? "").trim().toLowerCase().split("/").pop() ?? "";
}

function isSoraAlias(bare) {
  return bare === "sora-2" || bare.startsWith("sora-2-");
}

function lowerList(value) {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : [];
}

/**
 * Kind of a parsed catalog model, from catalog fields first and CPA's own
 * model families second. `catalogType` is the CPA registry `type`
 * (`openai-image` marks image endpoints); `outputModalities` the declared
 * output modalities.
 * @returns one of {@link MEDIA_KINDS}.
 */
export function detectMediaKind(model) {
  const type = String(model?.catalogType ?? "").trim().toLowerCase();
  if (type === "openai-image" || /(^|[-_])image($|[-_])/.test(type)) return "image";
  if (/(^|[-_])video($|[-_])/.test(type)) return "video";
  const out = lowerList(model?.outputModalities);
  if (out.includes("video")) return "video";
  if (out.includes("image") && !out.includes("text")) return "image";
  const bare = bareModelId(model?.id);
  if (CPA_VIDEO_PREFIXES.some((p) => bare.startsWith(p)) || isSoraAlias(bare)) return "video";
  if (CPA_IMAGE_PREFIXES.some((p) => bare.startsWith(p))) return "image";
  return "chat";
}

/** The model CPA really calls for an alias id (`sora-2*` → Grok video), or undefined. */
export function mediaAliasTarget(id) {
  return isSoraAlias(bareModelId(id)) ? SORA_ALIAS_TARGET : undefined;
}

/** Effective kind: a valid user override wins over detection. */
export function effectiveKind(model, overrides) {
  const forced = overrides?.[model?.id];
  if (MEDIA_KINDS.includes(forced)) return forced;
  if (MEDIA_KINDS.includes(model?.detectedKind)) return model.detectedKind;
  return detectMediaKind(model);
}

// #endregion

// #region Preferences (media-settings.json)

export const MEDIA_SETTINGS_VERSION = 1;
export const VIDEO_SECONDS = { min: 1, max: 15 };
export const VIDEO_RESOLUTIONS = ["480p", "720p"];
export const BUDGET_SECONDS = { min: 1, max: 3600 };
export const CONFIRM_MODES = ["ask", "auto"];
const MAX_OUTPUT_DIR = 260;
const MAX_LIST = 500;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class MediaError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = "MediaError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export function defaultMediaSettings() {
  return {
    version: MEDIA_SETTINGS_VERSION,
    agentTool: false,
    outputDir: "generated",
    defaultVideoSeconds: 6,
    defaultVideoResolution: "720p",
    imageConfirm: "auto",
    videoConfirm: "ask",
    videoBudget: { mode: "limited", seconds: 60 },
    lastSelection: {},
    accounts: {},
  };
}

function plain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function intIn(value, range) {
  return Number.isInteger(value) && value >= range.min && value <= range.max ? value : undefined;
}

function validOutputDir(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > MAX_OUTPUT_DIR || /[\u0000-\u001f]/.test(trimmed)) return undefined;
  return trimmed;
}

function validBudget(value) {
  const raw = plain(value);
  if (raw?.mode === "unlimited") return { mode: "unlimited" };
  if (raw?.mode === "limited") {
    const seconds = intIn(raw.seconds, BUDGET_SECONDS);
    if (seconds !== undefined) return { mode: "limited", seconds };
  }
  return undefined;
}

function validSelectionRef(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1 || trimmed.length > 300) return undefined;
  return ACCOUNT_ID_PATTERN.test(trimmed.slice(0, slash)) ? trimmed : undefined;
}

function validModelList(value) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed !== "" && trimmed.length <= 200 && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= MAX_LIST) break;
  }
  return out;
}

function validKindOverrides(value) {
  const raw = plain(value);
  if (raw === undefined) return {};
  const out = {};
  for (const [id, kind] of Object.entries(raw)) {
    const key = id.trim();
    if (key === "" || key.length > 200 || !MEDIA_KINDS.includes(kind)) continue;
    out[key] = kind;
    if (Object.keys(out).length >= MAX_LIST) break;
  }
  return out;
}

// Per account: the media models switched off (new models start switched on)
// and the user's chat / image / video reclassifications.
function normalizeAccountMedia(value) {
  const raw = plain(value) ?? {};
  return {
    disabledModels: validModelList(raw.disabledModels) ?? [],
    kindOverrides: validKindOverrides(raw.kindOverrides),
  };
}

/**
 * Tolerant normalization: every invalid or missing field takes its default,
 * unknown fields are dropped. The result always has `version: 1`.
 */
export function normalizeMediaSettings(raw) {
  const input = plain(raw) ?? {};
  const defaults = defaultMediaSettings();
  const accounts = {};
  for (const [id, entry] of Object.entries(plain(input.accounts) ?? {})) {
    if (ACCOUNT_ID_PATTERN.test(id)) accounts[id] = normalizeAccountMedia(entry);
  }
  const selection = plain(input.lastSelection) ?? {};
  const lastSelection = {};
  for (const kind of ["image", "video"]) {
    const ref = validSelectionRef(selection[kind]);
    if (ref !== undefined) lastSelection[kind] = ref;
  }
  return {
    version: MEDIA_SETTINGS_VERSION,
    agentTool: input.agentTool === true,
    outputDir: validOutputDir(input.outputDir) ?? defaults.outputDir,
    defaultVideoSeconds: intIn(input.defaultVideoSeconds, VIDEO_SECONDS) ?? defaults.defaultVideoSeconds,
    defaultVideoResolution: VIDEO_RESOLUTIONS.includes(input.defaultVideoResolution)
      ? input.defaultVideoResolution
      : defaults.defaultVideoResolution,
    imageConfirm: CONFIRM_MODES.includes(input.imageConfirm) ? input.imageConfirm : defaults.imageConfirm,
    videoConfirm: CONFIRM_MODES.includes(input.videoConfirm) ? input.videoConfirm : defaults.videoConfirm,
    videoBudget: validBudget(input.videoBudget) ?? defaults.videoBudget,
    lastSelection,
    accounts,
  };
}

/**
 * Read preferences. A missing file yields defaults; an unreadable or
 * malformed one also yields defaults but reports `error: "invalid-file"` so
 * the caller can log it and the next save keeps a copy of the damaged file.
 */
export function loadMediaSettings(filePath) {
  if (!existsSync(filePath)) return { settings: defaultMediaSettings() };
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    if (plain(raw) === undefined) return { settings: defaultMediaSettings(), error: "invalid-file" };
    return { settings: normalizeMediaSettings(raw) };
  } catch {
    return { settings: defaultMediaSettings(), error: "invalid-file" };
  }
}

/** Atomic write; a damaged existing file is first renamed to `*.corrupt-<time>.json`. */
export function saveMediaSettings(filePath, settings) {
  mkdirSync(dirname(filePath), { recursive: true });
  if (existsSync(filePath) && loadMediaSettings(filePath).error !== undefined) {
    renameSync(filePath, filePath.replace(/\.json$/, `.corrupt-${Date.now().toString(36)}.json`));
  }
  const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalizeMediaSettings(settings), null, 2)}\n`, "utf8");
  renameSync(tmp, filePath);
}

const PATCH_FIELDS = [
  "agentTool",
  "outputDir",
  "defaultVideoSeconds",
  "defaultVideoResolution",
  "imageConfirm",
  "videoConfirm",
  "videoBudget",
  "account",
];

/**
 * Apply a validated patch. Unlike {@link normalizeMediaSettings}, an invalid
 * value is an error (`MediaError` with a stable code), never a silent default.
 * `account.kindOverrides` merges per model; a `null` value removes an override.
 * `account.disabledModels` replaces the account's list of switched-off models.
 * @returns `{ settings, kindsChanged }` — `kindsChanged` names the account
 *   whose model kinds changed (its routes need a re-sync).
 */
export function applyMediaPatch(current, patch) {
  const input = plain(patch);
  if (input === undefined) throw new MediaError("invalid-request");
  const unknown = Object.keys(input).filter((key) => !PATCH_FIELDS.includes(key) && key !== "accountId");
  if (unknown.length > 0) throw new MediaError("invalid-request", `unknown field(s): ${unknown.join(", ")}`);
  const next = normalizeMediaSettings(current);
  if ("agentTool" in input) {
    if (typeof input.agentTool !== "boolean") throw new MediaError("invalid-agent-tool");
    next.agentTool = input.agentTool;
  }
  if ("outputDir" in input) {
    const dir = validOutputDir(input.outputDir);
    if (dir === undefined) throw new MediaError("invalid-output-dir");
    next.outputDir = dir;
  }
  if ("defaultVideoSeconds" in input) {
    const seconds = intIn(input.defaultVideoSeconds, VIDEO_SECONDS);
    if (seconds === undefined) throw new MediaError("invalid-video-seconds");
    next.defaultVideoSeconds = seconds;
  }
  if ("defaultVideoResolution" in input) {
    if (!VIDEO_RESOLUTIONS.includes(input.defaultVideoResolution)) throw new MediaError("invalid-video-resolution");
    next.defaultVideoResolution = input.defaultVideoResolution;
  }
  for (const field of ["imageConfirm", "videoConfirm"]) {
    if (!(field in input)) continue;
    if (!CONFIRM_MODES.includes(input[field])) throw new MediaError("invalid-confirm-mode");
    next[field] = input[field];
  }
  if ("videoBudget" in input) {
    const budget = validBudget(input.videoBudget);
    if (budget === undefined) throw new MediaError("invalid-video-budget");
    next.videoBudget = budget;
  }
  let kindsChanged;
  if ("account" in input) {
    const account = plain(input.account);
    const id = typeof account?.accountId === "string" ? account.accountId.trim() : "";
    if (!ACCOUNT_ID_PATTERN.test(id)) throw new MediaError("invalid-account");
    const entry = normalizeAccountMedia(next.accounts[id]);
    if ("disabledModels" in account) {
      const list = validModelList(account.disabledModels);
      if (list === undefined) throw new MediaError("invalid-model-list");
      entry.disabledModels = list;
    }
    if ("kindOverrides" in account) {
      const raw = plain(account.kindOverrides);
      if (raw === undefined) throw new MediaError("invalid-kind");
      const merged = { ...entry.kindOverrides };
      for (const [modelId, kind] of Object.entries(raw)) {
        const key = modelId.trim();
        if (key === "" || key.length > 200) throw new MediaError("invalid-kind");
        if (kind === null) delete merged[key];
        else if (MEDIA_KINDS.includes(kind)) merged[key] = kind;
        else throw new MediaError("invalid-kind");
      }
      if (JSON.stringify(merged) !== JSON.stringify(entry.kindOverrides)) kindsChanged = id;
      entry.kindOverrides = merged;
    }
    next.accounts[id] = entry;
  }
  return { settings: normalizeMediaSettings(next), kindsChanged };
}

/** Kind overrides of one account (empty when none). */
export function accountKindOverrides(settings, accountId) {
  return settings?.accounts?.[accountId]?.kindOverrides ?? {};
}

/** Whether a media model is offered for an account (on unless switched off). */
export function mediaModelEnabled(settings, accountId, modelId) {
  const list = settings?.accounts?.[accountId]?.disabledModels;
  return !Array.isArray(list) || !list.includes(modelId);
}

// #endregion

// #region Read-only diagnostic

const DIAG_MAX_BYTES = 8 * 1024 * 1024;
const DIAG_FIELDS = [
  "type",
  "object",
  "owned_by",
  "supportedOutputModalities",
  "output_modalities",
  "outputModalities",
  "input_modalities",
  "supportedInputModalities",
  "display_name",
];
const MEDIA_HINT = /(image|imagine|video|sora|veo|dall-?e)/i;
const DIAG_PROBE_ID = "dsh-diagnostic-probe";

async function readBoundedText(response, max = DIAG_MAX_BYTES) {
  const declared = Number(response.headers?.get?.("content-length"));
  const limit = `response is larger than ${Math.round(max / 1024 / 1024)} MiB`;
  if (Number.isFinite(declared) && declared > max) throw new Error(limit);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > max) throw new Error(limit);
  return text;
}

function short(value) {
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").slice(0, 12).map((v) => v.slice(0, 40));
  return undefined;
}

function catalogEntries(payload) {
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload?.data)) return payload.data;
  return undefined;
}

/** Media-looking catalog entries with a fixed set of descriptive fields (no other values). */
export function summarizeCatalogForMedia(payload) {
  const entries = catalogEntries(payload);
  if (entries === undefined) return undefined;
  const media = [];
  for (const item of entries) {
    if (plain(item) === undefined) continue;
    const id = typeof (item.slug ?? item.id) === "string" ? String(item.slug ?? item.id).trim() : "";
    if (id === "") continue;
    const kind = detectMediaKind({
      id,
      catalogType: item.type,
      outputModalities: item.supportedOutputModalities ?? item.output_modalities ?? item.outputModalities,
    });
    if (kind === "chat" && !MEDIA_HINT.test(id)) continue;
    const fields = {};
    for (const field of DIAG_FIELDS) {
      const value = short(item[field]);
      if (value !== undefined) fields[field] = value;
    }
    media.push({ id, kind, keys: Object.keys(item).sort().slice(0, 40), fields });
    if (media.length >= 50) break;
  }
  return { count: entries.length, media };
}

/**
 * Read-only CPA check for media support. Sends only GET requests:
 *  - the enriched (`?client_version=pi`) and plain `/v1/models` catalogs,
 *    with the account key, reporting media-looking entries and their fields;
 *  - two route probes **without** the key, so CPA answers 401 for a route
 *    that exists and its router's plain-text 404 for one that does not,
 *    without selecting a credential or contacting an upstream.
 * Never returns the key, response bodies or upstream URLs.
 */
export async function diagnoseMedia({ fetch: fetchImpl = fetch, rootURL, apiKey, timeoutMs = 8000, signal }) {
  const timed = () => {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  };
  const authHeaders = {
    Accept: "application/json",
    ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const catalog = async (path) => {
    try {
      const response = await fetchImpl(`${rootURL}${path}`, { method: "GET", headers: authHeaders, signal: timed() });
      if (!response.ok) return { ok: false, status: response.status };
      let payload;
      try {
        payload = JSON.parse(await readBoundedText(response));
      } catch {
        return { ok: false, status: response.status, error: "invalid-json" };
      }
      const summary = summarizeCatalogForMedia(payload);
      return summary === undefined
        ? { ok: false, status: response.status, error: "no-model-list" }
        : { ok: true, status: response.status, ...summary };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return { ok: false, error: error?.name === "TimeoutError" ? "timeout" : "network" };
    }
  };
  const probe = async (label, path) => {
    try {
      const response = await fetchImpl(`${rootURL}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: timed(),
      });
      let text = "";
      try {
        text = (await readBoundedText(response)).trim();
      } catch {}
      const verdict =
        response.status === 401 || response.status === 403
          ? "present"
          : response.status === 404 && /^404 page not found$/i.test(text)
          ? "missing"
          : "unknown";
      return { route: label, status: response.status, verdict };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return { route: label, verdict: "unreachable", error: error?.name === "TimeoutError" ? "timeout" : "network" };
    }
  };
  const [enriched, listing, nativeVideo, videoContent] = await Promise.all([
    catalog("/v1/models?client_version=pi"),
    catalog("/v1/models"),
    probe("GET /v1/videos/{id}", `/v1/videos/${DIAG_PROBE_ID}`),
    probe("GET /openai/v1/videos/{id}/content", `/openai/v1/videos/${DIAG_PROBE_ID}/content`),
  ]);
  return {
    endpoint: rootURL,
    checkedAt: new Date().toISOString(),
    catalogs: { enriched, listing },
    routes: [nativeVideo, videoContent],
  };
}

// #endregion

// #region Model choice

/**
 * Generation models a user may pick: enabled models of the given kind on
 * enabled accounts. `ref` is `<accountId>/<modelId>` (an account id never
 * contains a slash; a model id may).
 * @param accounts - `controller.mediaAccounts()` entries.
 */
export function mediaOptions(accounts, settings, kind) {
  const out = [];
  for (const account of accounts ?? []) {
    if (account.enabled !== true) continue;
    for (const model of account.models ?? []) {
      if (model.kind !== kind || !mediaModelEnabled(settings, account.id, model.id)) continue;
      out.push({
        ref: `${account.id}/${model.id}`,
        accountId: account.id,
        accountName: account.displayName || account.id,
        modelId: model.id,
        ...(model.name === undefined ? {} : { name: model.name }),
        ...(model.aliasOf === undefined ? {} : { aliasOf: model.aliasOf }),
      });
    }
  }
  return out;
}

/** Split a selection ref at its first slash. */
export function splitMediaRef(ref) {
  const value = typeof ref === "string" ? ref.trim() : "";
  const slash = value.indexOf("/");
  return slash > 0 && slash < value.length - 1
    ? { accountId: value.slice(0, slash), modelId: value.slice(slash + 1) }
    : undefined;
}

/**
 * Match what a user typed (`-m`): a full ref, then an exact model id, then a
 * unique case-insensitive substring of the model id. Never guesses between
 * several candidates.
 * @throws MediaError `model-not-found` / `model-ambiguous` (detail lists refs).
 */
export function matchMediaModel(options, requested) {
  const wanted = String(requested ?? "").trim();
  const lower = wanted.toLowerCase();
  const byRef = options.find((o) => o.ref === wanted);
  if (byRef !== undefined) return byRef;
  const pick = (list) => {
    if (list.length === 1) return list[0];
    if (list.length > 1) throw new MediaError("model-ambiguous", list.map((o) => o.ref).join(", "));
    return undefined;
  };
  const exact = pick(options.filter((o) => o.modelId.toLowerCase() === lower));
  if (exact !== undefined) return exact;
  const partial = pick(lower === "" ? [] : options.filter((o) => o.modelId.toLowerCase().includes(lower)));
  if (partial !== undefined) return partial;
  throw new MediaError("model-not-found", options.map((o) => o.ref).join(", "));
}

/**
 * The model a generation uses: an explicit request, else the session's pick,
 * else the last pick anywhere, else the only option.
 * @returns `{ option, source }` with source `request | session | last | only`.
 * @throws MediaError `no-media-model` or `choose-model` (several, none picked).
 */
export function chooseMediaModel({ options, requested, sessionRef, lastRef }) {
  if (typeof requested === "string" && requested.trim() !== "") {
    return { option: matchMediaModel(options, requested), source: "request" };
  }
  const session = options.find((o) => o.ref === sessionRef);
  if (session !== undefined) return { option: session, source: "session" };
  const last = options.find((o) => o.ref === lastRef);
  if (last !== undefined) return { option: last, source: "last" };
  if (options.length === 1) return { option: options[0], source: "only" };
  if (options.length === 0) throw new MediaError("no-media-model");
  throw new MediaError("choose-model", options.map((o) => o.ref).join(", "));
}

// #endregion

// #region Session store (media-sessions.json)

export const MEDIA_SESSIONS_VERSION = 1;
const MAX_SESSIONS = 500;
// Enough to keep the images of a session's recent commands visible in chat.
export const MAX_RECENT = 48;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export function validSessionId(value) {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value) ? value : undefined;
}

/** A DSH command run id (`cmd-<token>-<seq>`), or undefined. */
export function validCommandId(value) {
  return typeof value === "string" && COMMAND_ID_PATTERN.test(value) ? value : undefined;
}

function normalizeRecent(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const entry = plain(item);
    if (entry === undefined) continue;
    const { id, kind, file, model, createdAt, commandId } = entry;
    if (typeof id !== "string" || !/^[a-f0-9]{8,32}$/.test(id)) continue;
    if (!["image", "video"].includes(kind) || typeof file !== "string" || !isAbsolute(file)) continue;
    out.push({
      id,
      kind,
      file,
      model: typeof model === "string" ? model.slice(0, 300) : "",
      createdAt: typeof createdAt === "string" ? createdAt.slice(0, 40) : "",
      ...(validCommandId(commandId) === undefined ? {} : { commandId }),
    });
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

export const MAX_RUNS = 48;
const RUN_STATUSES = ["running", "done", "error"];
const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * One generation run as its chat row shows it: what was asked, by which model,
 * and how it ended. Never paths, keys or upstream bodies; `folder` is a display
 * label (relative to the working directory, or the folder's own name).
 */
export function normalizeRun(value) {
  const run = plain(value);
  if (run === undefined || validCommandId(run.commandId) === undefined) return undefined;
  if (!["image", "video"].includes(run.kind) || !RUN_STATUSES.includes(run.status)) return undefined;
  const count = Number.isInteger(run.count) && run.count >= 1 && run.count <= 4 ? run.count : 1;
  const references = Number.isInteger(run.references) && run.references >= 0 && run.references <= 4 ? run.references : 0;
  const files = Number.isInteger(run.files) && run.files >= 0 && run.files <= 4 ? run.files : 0;
  return {
    commandId: run.commandId,
    kind: run.kind,
    status: run.status,
    model: clip(run.model, 300),
    modelName: clip(run.modelName, 300),
    accountName: clip(run.accountName, 120),
    prompt: clip(run.prompt, 4000),
    ...(typeof run.aspect === "string" && IMAGE_ASPECTS.includes(run.aspect) ? { aspect: run.aspect } : {}),
    count,
    references,
    files,
    startedAt: clip(run.startedAt, 40),
    ...(typeof run.finishedAt === "string" ? { finishedAt: run.finishedAt.slice(0, 40) } : {}),
    ...(typeof run.folder === "string" && run.folder !== "" ? { folder: run.folder.slice(0, 300) } : {}),
    ...(typeof run.revisedPrompt === "string" && run.revisedPrompt !== "" ? { revisedPrompt: run.revisedPrompt.slice(0, 4000) } : {}),
    ...(typeof run.errorCode === "string" && /^[a-z][a-z-]{0,59}$/.test(run.errorCode) ? { errorCode: run.errorCode } : {}),
    ...(typeof run.error === "string" && run.error !== "" ? { error: run.error.slice(0, 500) } : {}),
  };
}

function normalizeRuns(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const run = normalizeRun(item);
    if (run === undefined || seen.has(run.commandId)) continue;
    seen.add(run.commandId);
    out.push(run);
    if (out.length >= MAX_RUNS) break;
  }
  return out;
}

function normalizeSessionEntry(value) {
  const raw = plain(value) ?? {};
  const out = {};
  for (const kind of ["image", "video"]) {
    const ref = validSelectionRef(raw[kind]);
    if (ref !== undefined) out[kind] = ref;
  }
  out.recent = normalizeRecent(raw.recent);
  out.runs = normalizeRuns(raw.runs);
  out.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt.slice(0, 40) : "";
  return out;
}

/** Tolerant normalization; keeps the {@link MAX_SESSIONS} most recently updated sessions. */
export function normalizeMediaSessions(raw) {
  const sessions = Object.entries(plain(plain(raw)?.sessions) ?? {})
    .filter(([id]) => validSessionId(id) !== undefined)
    .map(([id, entry]) => [id, normalizeSessionEntry(entry)])
    .sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))
    .slice(0, MAX_SESSIONS);
  return { version: MEDIA_SESSIONS_VERSION, sessions: Object.fromEntries(sessions) };
}

/**
 * Per-session generation state (model picks, recent outputs) in its own file,
 * re-read on every access. Writes are atomic; a damaged file loads as empty
 * and is kept as `*.corrupt-*.json` by the next write.
 */
export function createMediaSessionStore(filePath, { now = () => new Date() } = {}) {
  const read = () => {
    if (!existsSync(filePath)) return { data: normalizeMediaSessions({}) };
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      if (plain(raw) === undefined) return { data: normalizeMediaSessions({}), damaged: true };
      return { data: normalizeMediaSessions(raw) };
    } catch {
      return { data: normalizeMediaSessions({}), damaged: true };
    }
  };
  return {
    get(sessionId) {
      const id = validSessionId(sessionId);
      return id === undefined ? normalizeSessionEntry({}) : read().data.sessions[id] ?? normalizeSessionEntry({});
    },
    /** Apply `mutate(entry)` to one session's entry and persist it. */
    update(sessionId, mutate) {
      const id = validSessionId(sessionId);
      if (id === undefined) throw new MediaError("invalid-session");
      const { data, damaged } = read();
      const entry = normalizeSessionEntry(data.sessions[id]);
      mutate(entry);
      entry.updatedAt = now().toISOString();
      data.sessions[id] = normalizeSessionEntry(entry);
      const next = normalizeMediaSessions(data);
      mkdirSync(dirname(filePath), { recursive: true });
      if (damaged && existsSync(filePath)) {
        renameSync(filePath, filePath.replace(/\.json$/, `.corrupt-${Date.now().toString(36)}.json`));
      }
      const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      renameSync(tmp, filePath);
      return next.sessions[id];
    },
  };
}

/**
 * A recent-output record for a file this plugin just wrote; `commandId` ties
 * it to the slash-command run that produced it (its chat row shows it).
 */
export function recentEntry(kind, file, model, createdAt = new Date(), commandId) {
  return {
    id: randomBytes(8).toString("hex"),
    kind,
    file,
    model,
    createdAt: createdAt.toISOString(),
    ...(validCommandId(commandId) === undefined ? {} : { commandId }),
  };
}

// #endregion

// #region Image generation

export const IMAGE_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "9:20", "20:9"];
export const IMAGE_COUNT = { min: 1, max: 4 };
export const MAX_REFERENCE_IMAGES = 4;
const IMAGE_TIMEOUT_MS = 180_000;
const MAX_IMAGE_RESPONSE_BYTES = 96 * 1024 * 1024;
const MAX_IMAGE_DOWNLOAD_BYTES = 32 * 1024 * 1024;
// gpt-image accepts only these sizes; xAI reads `aspect_ratio` instead.
const GPT_IMAGE_SIZES = { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536" };
const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/**
 * Parse `/cpa-image` input: leading options, then the prompt verbatim.
 * Options: `-m|--model <id>`, `--aspect <ratio>`, `-n|--count <1-4>`; `--`
 * ends options.
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-aspect` / `invalid-count`.
 */
export function parseImageCommand(rawInput) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const match = rest.match(/^(-m|--model|--aspect|-n|--count)(?:=|\s+)(\S+)(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, value] = match;
    if (flag === "-m" || flag === "--model") out.model = value;
    else if (flag === "--aspect") {
      if (!IMAGE_ASPECTS.includes(value)) throw new MediaError("invalid-aspect", value);
      out.aspect = value;
    } else {
      const count = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(count, IMAGE_COUNT) === undefined) throw new MediaError("invalid-count", value);
      out.count = count;
    }
    rest = rest.slice(whole.length).trim();
  }
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

/** Media type from magic bytes (PNG, JPEG, WebP, GIF), or undefined. */
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 6 && String.fromCharCode(...b.subarray(0, 4)) === "GIF8") return "image/gif";
  return undefined;
}

/** A short, URL-free upstream error message (never a body dump). */
export function upstreamMessage(text, status) {
  let message = "";
  try {
    const payload = JSON.parse(text);
    message = payload?.error?.message ?? payload?.message ?? (typeof payload?.error === "string" ? payload.error : "");
  } catch {
    message = text;
  }
  message = String(message ?? "").replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
  return message === "" ? `HTTP ${status}` : `HTTP ${status}: ${message}`;
}

async function readBoundedBytes(response, max) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new MediaError("image-too-large");
  if (typeof response.body?.getReader !== "function") {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > max) throw new MediaError("image-too-large");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new MediaError("image-too-large");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Bytes behind a result `url`: a data URL, or an HTTPS download without credentials. */
async function imageFromUrl(fetchImpl, url, signal) {
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (dataMatch !== null) {
    if (dataMatch[2] === undefined) throw new MediaError("invalid-image");
    const bytes = new Uint8Array(Buffer.from(dataMatch[3], "base64"));
    if (bytes.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) throw new MediaError("image-too-large");
    return bytes;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new MediaError("invalid-image");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new MediaError("invalid-image");
  const response = await fetchImpl(parsed.toString(), { method: "GET", headers: { Accept: "image/*" }, signal });
  if (!response.ok) throw new MediaError("download-failed", `HTTP ${response.status}`);
  return readBoundedBytes(response, MAX_IMAGE_DOWNLOAD_BYTES);
}

/**
 * Generate (no references) or edit (with references) images through CPA's
 * OpenAI-compatible endpoints. Asks for `b64_json`; a result that carries a
 * URL instead is fetched (data URL or HTTPS only, size-bounded, no key).
 * @param references - `[{ mediaType, data: Uint8Array }]`, at most 4.
 * @returns `[{ bytes, mediaType, ext, revisedPrompt? }]`.
 * @throws MediaError `upstream-error` (detail: short message), `invalid-response`,
 *   `no-image`, `invalid-image`, `image-too-large`, `download-failed`, `timeout`.
 */
export async function generateImages({
  fetch: fetchImpl = fetch,
  rootURL,
  apiKey,
  model,
  prompt,
  aspect,
  count = 1,
  references = [],
  signal,
  timeoutMs = IMAGE_TIMEOUT_MS,
}) {
  if (references.length > MAX_REFERENCE_IMAGES) throw new MediaError("too-many-references");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const edit = references.length > 0;
  const body = { model, prompt, n: count, response_format: "b64_json" };
  if (aspect !== undefined) {
    body.aspect_ratio = aspect;
    if (GPT_IMAGE_SIZES[aspect] !== undefined) body.size = GPT_IMAGE_SIZES[aspect];
  }
  if (edit) {
    body.images = references.map((ref) => ({
      image_url: `data:${ref.mediaType};base64,${Buffer.from(ref.data).toString("base64")}`,
    }));
  }
  let response;
  let text;
  try {
    response = await fetchImpl(`${rootURL}${edit ? "/v1/images/edits" : "/v1/images/generations"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: combined,
    });
    text = await readBoundedText(response, MAX_IMAGE_RESPONSE_BYTES);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  if (!response.ok) throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new MediaError("invalid-response");
  }
  const items = Array.isArray(payload?.data) ? payload.data : [];
  const out = [];
  for (const item of items) {
    let bytes;
    if (typeof item?.b64_json === "string" && item.b64_json !== "") {
      bytes = new Uint8Array(Buffer.from(item.b64_json, "base64"));
      if (bytes.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) throw new MediaError("image-too-large");
    } else if (typeof item?.url === "string" && item.url !== "") {
      try {
        bytes = await imageFromUrl(fetchImpl, item.url, combined);
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (timeout.aborted) throw new MediaError("timeout");
        if (error instanceof MediaError) throw error;
        throw new MediaError("download-failed");
      }
    } else {
      continue;
    }
    const mediaType = sniffImageType(bytes);
    if (mediaType === undefined) throw new MediaError("invalid-image");
    out.push({
      bytes,
      mediaType,
      ext: IMAGE_EXTENSIONS[mediaType],
      ...(typeof item.revised_prompt === "string" && item.revised_prompt.trim() !== ""
        ? { revisedPrompt: item.revised_prompt.trim().slice(0, 500) }
        : {}),
    });
  }
  if (out.length === 0) throw new MediaError("no-image");
  return out;
}

// #endregion

// #region Output files

/** The output directory for a session: absolute settings are used as is, relative ones under `cwd`. */
export function outputDirectory(cwd, outputDir) {
  return isAbsolute(outputDir) ? outputDir : join(cwd, outputDir);
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** File stem `YYYYMMDD-HHmmss-<model>-<prompt slug>`; safe on Windows, macOS and Linux. */
export function outputStem(model, prompt, date = new Date()) {
  const modelPart = bareModelId(model).replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  const slug =
    String(prompt ?? "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "media";
  return `${stamp(date)}-${modelPart}-${slug}`;
}

/**
 * Write each file next to the others without ever replacing an existing
 * file (`wx`); a taken name gets the next free `-N` suffix.
 * @param files - `[{ bytes, ext }]`.
 * @returns absolute paths, in order.
 */
export function writeOutputFiles(dir, stem, files) {
  mkdirSync(dir, { recursive: true });
  const paths = [];
  files.forEach((file, index) => {
    const base = files.length > 1 ? `${stem}-${index + 1}` : stem;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const name = attempt === 0 ? `${base}.${file.ext}` : `${base}-${attempt + 1}.${file.ext}`;
      const path = join(dir, name);
      try {
        writeFileSync(path, file.bytes, { flag: "wx" });
        paths.push(path);
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw new MediaError("write-failed", error?.code ?? undefined);
      }
    }
    throw new MediaError("write-failed", "EEXIST");
  });
  return paths;
}

// #endregion
