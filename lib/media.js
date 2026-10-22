// Internal module: CPA image / video generation support.
//
// Classifies catalog models as chat / image / video, owns the independent
// `media-settings.json` preferences, `media-sessions.json` (per-session picks
// and run records) and `media-jobs.json` (video jobs that outlive a reload),
// runs a read-only diagnostic, and talks to CPA's image and video routes.
// Generation happens only when the host calls it for an explicit user action.
// Keys are passed in per call and never stored or returned.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";
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
export const VIDEO_MODES = ["text", "first-frame", "reference", "first-last", "last-frame", "edit", "extend"];
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
  const references = Number.isInteger(run.references) && run.references >= 0 && run.references <= 14 ? run.references : 0;
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
    ...(run.kind === "video" && intIn(run.seconds, VIDEO_SECONDS) !== undefined ? { seconds: run.seconds } : {}),
    ...(run.kind === "video" && VIDEO_RESOLUTIONS.includes(run.resolution) ? { resolution: run.resolution } : {}),
    ...(run.kind === "video" && VIDEO_MODES.includes(run.mode) ? { mode: run.mode } : {}),
    ...(run.kind === "video" && validCommandId(run.sourceCommandId) !== undefined ? { sourceCommandId: run.sourceCommandId } : {}),
    // Prompt words the edit / extension route cannot use, taken out of the prompt.
    ...(run.kind === "video" && Array.isArray(run.ignored) && run.ignored.length > 0
      ? { ignored: run.ignored.filter((w) => typeof w === "string" && w !== "").slice(0, 4).map((w) => w.slice(0, 20)) }
      : {}),
    // Parameters the session's chat model read from the prompt (or that it was asked and failed).
    ...(plain(run.interpreted) !== undefined && typeof run.interpreted.by === "string" && run.interpreted.by !== ""
      ? {
          interpreted: {
            by: run.interpreted.by.slice(0, 160),
            items: Array.isArray(run.interpreted.items) ? run.interpreted.items.filter((w) => typeof w === "string" && w !== "").slice(0, 8).map((w) => w.slice(0, 30)) : [],
            ...(run.interpreted.failed === true ? { failed: true } : {}),
            ...(run.interpreted.prompt === true ? { prompt: true } : {}),
          },
        }
      : {}),
    // How an edit / extension got its source: xAI's own result link, an inline upload, or a public URL.
    ...(run.kind === "video" && ["link", "upload", "url"].includes(run.sourceKind) ? { sourceKind: run.sourceKind } : {}),
    // A local file's name or a URL's host, never a path or a full address.
    ...(run.kind === "video" && typeof run.sourceName === "string" && run.sourceName.trim() !== "" ? { sourceName: run.sourceName.trim().slice(0, 200) } : {}),
    ...(run.kind === "video" && typeof run.videoId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(run.videoId) ? { videoId: run.videoId } : {}),
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
  // Agent-tool overrides for this session (absent = follow the global setting).
  if (CONFIRM_MODES.includes(raw.imageConfirm)) out.imageConfirm = raw.imageConfirm;
  if (CONFIRM_MODES.includes(raw.videoConfirm)) out.videoConfirm = raw.videoConfirm;
  const budget = validBudget(raw.videoBudget);
  if (budget !== undefined) out.videoBudget = budget;
  // Video seconds the agent submitted, against the limit named by `budgetKey`.
  if (Number.isInteger(raw.usedSeconds) && raw.usedSeconds > 0 && raw.usedSeconds <= 1_000_000) out.usedSeconds = raw.usedSeconds;
  if (typeof raw.budgetKey === "string" && /^(unlimited|limited:\d{1,4})$/.test(raw.budgetKey)) out.budgetKey = raw.budgetKey;
  if (CONFIRM_MODES.includes(raw.lastConfirm)) out.lastConfirm = raw.lastConfirm;
  out.recent = normalizeRecent(raw.recent);
  out.runs = normalizeRuns(raw.runs);
  out.updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt.slice(0, 40) : "";
  return out;
}

/** The identity of a seconds limit: a different limit starts the count again. */
export function budgetKey(budget) {
  return budget?.mode === "limited" ? `limited:${budget.seconds}` : "unlimited";
}

/**
 * The agent tool's effective rules for one (root) session: confirmation per
 * kind and the video seconds limit, each from the session's override or the
 * global setting, and the seconds already used under that limit. The count
 * starts again when the limit changed or the video confirmation went from
 * `ask` to `auto` since the last charge (design §8).
 */
export function agentPolicy(settings, entry = {}) {
  const imageConfirm = entry.imageConfirm ?? settings.imageConfirm;
  const videoConfirm = entry.videoConfirm ?? settings.videoConfirm;
  const budget = entry.videoBudget ?? settings.videoBudget;
  const key = budgetKey(budget);
  const stale = (entry.budgetKey !== undefined && entry.budgetKey !== key) || (entry.lastConfirm === "ask" && videoConfirm === "auto");
  const used = stale ? 0 : entry.usedSeconds ?? 0;
  return {
    imageConfirm,
    videoConfirm,
    budget,
    key,
    used,
    limit: budget.mode === "limited" ? budget.seconds : undefined,
    sources: {
      imageConfirm: entry.imageConfirm === undefined ? "global" : "session",
      videoConfirm: entry.videoConfirm === undefined ? "global" : "session",
      videoBudget: entry.videoBudget === undefined ? "global" : "session",
    },
  };
}

/**
 * Apply a session's agent-tool overrides from the composer button:
 * `imageConfirm` / `videoConfirm` `ask` | `auto` | `inherit`, `videoBudget`
 * `{ mode, seconds? }` | `inherit`. The seconds count starts again when the
 * limit changes or video confirmation turns from `ask` to `auto`. Mutates `entry`.
 * @throws MediaError `invalid-confirm-mode` / `invalid-video-budget` / `invalid-request`.
 */
export function applySessionPolicy(entry, input, settings) {
  const before = agentPolicy(settings, entry);
  let changed = false;
  for (const field of ["imageConfirm", "videoConfirm"]) {
    if (!(field in input)) continue;
    if (input[field] === "inherit") delete entry[field];
    else if (CONFIRM_MODES.includes(input[field])) entry[field] = input[field];
    else throw new MediaError("invalid-confirm-mode");
    changed = true;
  }
  if ("videoBudget" in input) {
    if (input.videoBudget === "inherit") delete entry.videoBudget;
    else {
      const budget = validBudget(input.videoBudget);
      if (budget === undefined) throw new MediaError("invalid-video-budget");
      entry.videoBudget = budget;
    }
    changed = true;
  }
  if (!changed) throw new MediaError("invalid-request");
  const after = agentPolicy(settings, entry);
  if (after.key !== before.key || (before.videoConfirm === "ask" && after.videoConfirm === "auto")) {
    delete entry.usedSeconds;
    delete entry.budgetKey;
    delete entry.lastConfirm;
  }
}

/**
 * Charge (`seconds` > 0) or refund (< 0) agent video seconds on a session
 * entry, under the policy's current limit. Mutates `entry`.
 */
export function chargeSeconds(entry, policy, seconds) {
  entry.usedSeconds = Math.max(0, policy.used + seconds);
  entry.budgetKey = policy.key;
  entry.lastConfirm = policy.videoConfirm;
  if (entry.usedSeconds === 0) delete entry.usedSeconds;
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

// Plain-language options at the start or end of a prompt, written as their
// own words ("10 秒 480p 竖屏 …", "… 16:9 2张"): a token counts only when a
// space, comma or the end follows it, so "3 秒后爆炸" stays prompt text.
const WORD_END = "(?=[\\s,，、;；]|$)";
const NATURAL_TOKENS = [
  { key: "seconds", kinds: ["video"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  // "edit" / "extend": words xAI's edit and extension routes cannot use (the
  // output keeps the source's resolution and ratio; an edit keeps its length).
  { key: "seconds", kinds: ["edit"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  { key: "resolution", kinds: ["video", "edit", "extend"], re: new RegExp(`^(480|720|1080)\\s*p${WORD_END}`, "i"), value: (m) => `${m[1]}p` },
  { key: "count", kinds: ["image"], re: new RegExp(`^(\\d{1,2})\\s*(?:张|幅|images?|pics?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(\\d{1,2})\\s*[:：]\\s*(\\d{1,2})${WORD_END}`), value: (m) => `${m[1]}:${m[2]}` },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:竖屏|竖版|portrait)${WORD_END}`, "i"), value: () => "9:16" },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:横屏|横版|landscape)${WORD_END}`, "i"), value: () => "16:9" },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:方形|正方形|square)${WORD_END}`, "i"), value: () => "1:1" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:参考图|参考图模式|references?)${WORD_END}`, "i"), value: () => "reference" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:首尾帧|首帧尾帧|first-last)${WORD_END}`, "i"), value: () => "first-last" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:尾帧|last-frame)${WORD_END}`, "i"), value: () => "last" },
  { key: "seconds", kinds: ["extend"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
];
const SEPARATORS = /^[\s,，、;；]+/;

/**
 * Take plain-language options from the start and the end of `text`.
 * Explicit flags already in `out` win; a recognized token is removed either way.
 * @returns the remaining prompt; values land in `out` (validated by the caller).
 */
function takeNaturalOptions(text, kind, out) {
  const tokens = NATURAL_TOKENS.filter((t) => t.kinds.includes(kind));
  const take = (match, token) => {
    if (out[token.key] === undefined) out[token.key] = token.value(match);
  };
  let rest = text;
  for (let guard = 0; guard < 8; guard += 1) {
    const hit = tokens.map((token) => [token, token.re.exec(rest)]).find(([, m]) => m !== null);
    if (hit === undefined) break;
    take(hit[1], hit[0]);
    rest = rest.slice(hit[1][0].length).replace(SEPARATORS, "");
  }
  // The end: peel whole words off the tail while they are options.
  for (let guard = 0; guard < 8; guard += 1) {
    const words = rest.split(/([\s,，、;；]+)/);
    let matched = false;
    for (let n = Math.min(3, words.length); n >= 1 && !matched; n -= 1) {
      const tail = words.slice(-(2 * n - 1)).join("");
      for (const token of tokens) {
        const m = token.re.exec(tail);
        if (m !== null && m[0].length === tail.length) {
          take(m, token);
          rest = words.slice(0, words.length - (2 * n - 1)).join("").replace(/[\s,，、;；]+$/, "");
          matched = true;
          break;
        }
      }
    }
    if (!matched) break;
  }
  return rest.trim();
}

/**
 * Parse `/cpa-image` input: leading options, then the prompt verbatim.
 * Options: `-m|--model <id>`, `--aspect <ratio>`, `-n|--count <1-4>`; `--`
 * ends options.
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-aspect` / `invalid-count`.
 */
export function parseImageCommand(rawInput, { literal = false } = {}) {
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
  // `literal` (agent tool calls): the prompt is taken as written.
  const natural = {};
  if (!literal) rest = takeNaturalOptions(rest, "image", natural);
  if (out.aspect === undefined && natural.aspect !== undefined) {
    if (!IMAGE_ASPECTS.includes(natural.aspect)) throw new MediaError("invalid-aspect", natural.aspect);
    out.aspect = natural.aspect;
  }
  if (out.count === undefined && natural.count !== undefined) {
    if (intIn(natural.count, IMAGE_COUNT) === undefined) throw new MediaError("invalid-count", String(natural.count));
    out.count = natural.count;
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

// #region Video generation

export const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_REQUEST_TIMEOUT_MS = 60_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const MAX_VIDEO_JSON_BYTES = 1024 * 1024;
/** CPA keeps the request → credential binding this long (`defaultVideoAuthBindingTTL`). */
export const VIDEO_JOB_TTL_MS = 3 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/**
 * Request body limits measured on a live CPA → xAI path (Oct 2026, with
 * requests that fail validation, so nothing was generated):
 * `POST /v1/videos/generations` read 1 MiB but refused 1.2 MiB ("Failed to
 * read request body: length limit exceeded"); `/v1/videos/edits` read 20 MiB.
 */
export const VIDEO_GENERATION_BODY_MAX_BYTES = 1024 * 1024;
export const VIDEO_UPLOAD_BODY_MAX_BYTES = 20 * 1024 * 1024;
/** Largest local video sent inline as a data URI (base64 adds a third). */
export const VIDEO_UPLOAD_MAX_BYTES = 14 * 1024 * 1024;

/**
 * Raw bytes each of `count` attached images may take so that a
 * `/v1/videos/generations` body with this prompt stays within
 * {@link VIDEO_GENERATION_BODY_MAX_BYTES} once base64-encoded.
 */
export function videoImageBudget(prompt, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  const fixed = 1024 + Buffer.byteLength(JSON.stringify(String(prompt ?? "")));
  const room = VIDEO_GENERATION_BODY_MAX_BYTES - fixed - 64 * count;
  return Math.max(0, Math.floor(room / count / 4) * 3);
}

const asBuffer = (bytes) => (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));

/** Whether the bytes start like an ISO base media file (MP4 / MOV: an `ftyp` box first). */
export function isMp4(bytes) {
  return bytes instanceof Uint8Array && bytes.byteLength >= 12 && asBuffer(bytes).toString("latin1", 4, 8) === "ftyp";
}

/**
 * A video's length from its `moov/mvhd` box, in seconds (two decimals), or
 * undefined when the file does not carry one this parser understands.
 */
export function mp4Duration(bytes) {
  if (!isMp4(bytes)) return undefined;
  const buf = asBuffer(bytes);
  const find = (start, end, type) => {
    let at = start;
    while (at + 8 <= end) {
      let size = buf.readUInt32BE(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return undefined;
        const large = buf.readBigUInt64BE(at + 8);
        if (large > BigInt(end - at)) return undefined;
        size = Number(large);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) return undefined;
      if (buf.toString("latin1", at + 4, at + 8) === type) return [at + header, at + size];
      at += size;
    }
    return undefined;
  };
  const moov = find(0, buf.length, "moov");
  const mvhd = moov === undefined ? undefined : find(moov[0], moov[1], "mvhd");
  if (mvhd === undefined) return undefined;
  const [c, end] = mvhd;
  const v1 = buf[c] === 1;
  if (c + (v1 ? 32 : 20) > end) return undefined;
  const timescale = buf.readUInt32BE(c + (v1 ? 20 : 12));
  const duration = v1 ? Number(buf.readBigUInt64BE(c + 24)) : buf.readUInt32BE(c + 16);
  if (timescale === 0 || !Number.isFinite(duration) || duration <= 0) return undefined;
  return Math.round((duration / timescale) * 100) / 100;
}

/**
 * Parse `/cpa-video` input: leading options, then the prompt verbatim.
 * Options: `-m|--model <id>`, `--aspect <ratio>`, `-s|--seconds <1-15>`,
 * `-r|--resolution <480p|720p>`; `--` ends options.
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-aspect` /
 *   `invalid-video-seconds` / `invalid-video-resolution`.
 */
export function parseVideoCommand(rawInput, { literal = false } = {}) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const toggle = rest.match(/^(--ref|--first-last|--last)(?:\s+|$)/);
    if (toggle !== null) {
      out.frames = { "--ref": "reference", "--first-last": "first-last", "--last": "last" }[toggle[1]];
      rest = rest.slice(toggle[0].length).trim();
      continue;
    }
    const match = rest.match(/^(-m|--model|--aspect|-s|--seconds|-r|--resolution)(?:=|\s+)(\S+)(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, value] = match;
    if (flag === "-m" || flag === "--model") out.model = value;
    else if (flag === "--aspect") {
      if (!VIDEO_ASPECTS.includes(value)) throw new MediaError("invalid-aspect", value);
      out.aspect = value;
    } else if (flag === "-s" || flag === "--seconds") {
      const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(seconds, VIDEO_SECONDS) === undefined) throw new MediaError("invalid-video-seconds", value);
      out.seconds = seconds;
    } else {
      const resolution = value.toLowerCase();
      if (!VIDEO_RESOLUTIONS.includes(resolution)) throw new MediaError("invalid-video-resolution", value);
      out.resolution = resolution;
    }
    rest = rest.slice(whole.length).trim();
  }
  const natural = {};
  if (!literal) rest = takeNaturalOptions(rest, "video", natural);
  if (out.seconds === undefined && natural.seconds !== undefined) {
    if (intIn(natural.seconds, VIDEO_SECONDS) === undefined) throw new MediaError("invalid-video-seconds", String(natural.seconds));
    out.seconds = natural.seconds;
  }
  if (out.resolution === undefined && natural.resolution !== undefined) {
    if (!VIDEO_RESOLUTIONS.includes(natural.resolution)) throw new MediaError("invalid-video-resolution", natural.resolution);
    out.resolution = natural.resolution;
  }
  if (out.aspect === undefined && natural.aspect !== undefined) {
    if (!VIDEO_ASPECTS.includes(natural.aspect)) throw new MediaError("invalid-aspect", natural.aspect);
    out.aspect = natural.aspect;
  }
  if (out.frames === undefined && natural.frames !== undefined) out.frames = natural.frames;
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

export const EXTEND_SECONDS = { min: 2, max: 10 };
/** xAI's limits on a source video: edits take at most 8.7 s, extensions 2–15 s. */
export const EDIT_SOURCE_MAX_SECONDS = 8.7;
export const EXTEND_SOURCE_SECONDS = { min: 2, max: 15 };
/** xAI runs edits and extensions only on this model. */
export const VIDEO_EDIT_MODEL = "grok-imagine-video";

/**
 * Parse `/cpa-video-edit` and `/cpa-video-extend` input. One source at most:
 * `--from <command id>` (a video this plugin made in the session),
 * `--video <path>` (a local MP4; quote a path with spaces), `--url <http(s) URL>`
 * (a public video xAI downloads itself) — or an attached MP4, or by default the
 * session's newest video. `-m|--model <id>` picks the account for a local or
 * URL source; extensions take `-s|--seconds <2-10>` (also as a plain word).
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-extend-seconds` /
 *   `invalid-video-url` / `one-video-source`.
 */
export function parseVideoEditCommand(rawInput, mode, { literal = false } = {}) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const match = rest.match(/^(--from|--video|--url|-m|--model|-s|--seconds)(?:=|\s+)(?:"([^"]+)"|(\S+))(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, quoted, bare] = match;
    const value = quoted ?? bare;
    if (flag === "--from" || flag === "--video" || flag === "--url") {
      if (out.from !== undefined || out.video !== undefined || out.url !== undefined) throw new MediaError("one-video-source");
    }
    if (flag === "--from") {
      if (validCommandId(value) === undefined) throw new MediaError("invalid-option", `--from ${value}`);
      out.from = value;
    } else if (flag === "--video") {
      out.video = value;
    } else if (flag === "--url") {
      let url;
      try {
        url = new URL(value);
      } catch {
        throw new MediaError("invalid-video-url");
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") throw new MediaError("invalid-video-url");
      out.url = url.href;
    } else if (flag === "-m" || flag === "--model") {
      out.model = value;
    } else {
      if (mode !== "extend") throw new MediaError("invalid-option", flag);
      const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(seconds, EXTEND_SECONDS) === undefined) throw new MediaError("invalid-extend-seconds", value);
      out.seconds = seconds;
    }
    rest = rest.slice(whole.length).trim();
  }
  // A video path written straight into the prompt (with or without quotes or
  // DSH's `@` file mention) is the source, as if passed with --video.
  const named = () => out.from !== undefined || out.video !== undefined || out.url !== undefined;
  const takePath = (re) => {
    if (named()) return;
    const m = re.exec(rest);
    if (m === null) return;
    out.video = m[1] ?? m[2] ?? m[3];
    rest = (rest.slice(0, m.index) + rest.slice(m.index + m[0].length)).replace(SEPARATORS, "").replace(/[\s,，、;；]+$/, "");
  };
  const natural = {};
  const kind = mode === "extend" ? "extend" : "edit";
  if (!literal) {
    takePath(VIDEO_PATH_HEAD);
    rest = takeNaturalOptions(rest, kind, natural);
    takePath(VIDEO_PATH_HEAD);
    takePath(VIDEO_PATH_TAIL);
    rest = takeNaturalOptions(rest, kind, natural);
  }
  if (mode === "extend" && out.seconds === undefined && natural.seconds !== undefined) {
    if (intIn(natural.seconds, EXTEND_SECONDS) === undefined) throw new MediaError("invalid-extend-seconds", String(natural.seconds));
    out.seconds = natural.seconds;
  }
  // Words the edit / extension routes cannot use are taken out of the prompt and reported.
  const ignored = [
    ...(mode === "edit" && natural.seconds !== undefined ? [`${natural.seconds}s`] : []),
    ...(natural.resolution !== undefined ? [natural.resolution] : []),
    ...(natural.aspect !== undefined ? [natural.aspect] : []),
  ];
  if (ignored.length > 0) out.ignored = ignored;
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

const VIDEO_EXT = "(?:mp4|m4v|mov)";
// Quoted path; unquoted absolute path (may hold spaces, up to the first `.mp4`
// followed by a space); or one unquoted word ending in a video extension.
const VIDEO_PATH_HEAD = new RegExp(
  `^@?(?:"([^"]+\\.${VIDEO_EXT})"|((?:[A-Za-z]:[\\\\/]|\\\\\\\\|/)[^\\n]*?\\.${VIDEO_EXT})|([^\\s"]+\\.${VIDEO_EXT}))(?=[\\s,，、;；]|$)`,
  "i"
);
const VIDEO_PATH_TAIL = new RegExp(
  `(?:^|[\\s,，、;；])@?(?:"([^"]+\\.${VIDEO_EXT})"|((?:[A-Za-z]:[\\\\/]|\\\\\\\\)[^\\n"]*?\\.${VIDEO_EXT})|([^\\s"]+\\.${VIDEO_EXT}))$`,
  "i"
);

// #region Parameter interpretation by the session's chat model
//
// The rule parsers read flags and a few whole words; anything else written in
// plain language ("十秒钟", "竖版的", "第二张当结尾") is handed to the session's
// own chat model, which returns the parameters as JSON. Explicit flags always
// win, every value is validated here, and the prompt may only lose words
// (never be rewritten): `interpretedPrompt()` keeps the original otherwise.

const INTERPRET_FIELDS = {
  image: ["aspect", "count"],
  video: ["seconds", "resolution", "aspect", "frames"],
  edit: [],
  extend: ["seconds"],
};

/**
 * The system and user text asking a chat model to read parameters out of a
 * generation request.
 * @param command - `image` / `video` / `edit` / `extend`.
 * @param text - the prompt as the rule parser left it.
 * @param images - attached image count.
 * @param fixed - field names already set by explicit options (not to be read again).
 */
export function interpretationRequest({ command, text, images = 0, fixed = [] }) {
  const fields = INTERPRET_FIELDS[command] ?? [];
  const lines = {
    seconds: command === "extend" ? "seconds: integer 2-10, how many seconds to ADD to the video" : "seconds: integer 1-15, video length",
    resolution: 'resolution: "480p" or "720p" (high definition / 高清 = "720p")',
    aspect: `aspect: one of ${(command === "image" ? IMAGE_ASPECTS : VIDEO_ASPECTS).join(", ")} (portrait / 竖屏 = "9:16", landscape / 横屏 = "16:9", square = "1:1")`,
    count: "count: integer 1-4, number of images",
    frames:
      'frames: how the attached images are used — "first-frame" (one image starts the video), "reference" (images show people / objects to include, no fixed frame), "first-last" (image 1 starts, image 2 ends the video), "last-frame" (the video ends on the image)',
  };
  const wanted = fields.filter((f) => !fixed.includes(f) && (f !== "frames" || images > 0));
  const system = [
    "You read generation parameters out of a user's request to an image / video generator.",
    "Reply with exactly one JSON object and nothing else.",
    wanted.length > 0 ? `Fields (omit a field the request does not state):\n- ${wanted.map((f) => lines[f]).join("\n- ")}` : "There are no parameter fields to read.",
    '- prompt: the request text with ONLY the words that state these parameters removed. Copy every other character exactly as written: do not translate, rephrase, fix, shorten or add anything. If no such words exist, return the text unchanged.',
  ].join("\n");
  const user = `${images > 0 ? `Attached images: ${images}.\n` : ""}Request:\n${text}`;
  return { system, user, fields: wanted };
}

/** Whether `short` can be made from `long` by deleting characters (order kept). */
function isSubsequence(short, long) {
  let at = 0;
  for (const ch of long) if (at < short.length && ch === short[at]) at += 1;
  return at === short.length;
}

/**
 * The model's prompt when it only removed characters and kept a fair part of
 * the text (at least 30 %, unless it removed 12 characters or fewer),
 * otherwise the original.
 */
export function interpretedPrompt(candidate, original) {
  if (typeof candidate !== "string") return original;
  const prompt = candidate.replace(/\s+/g, " ").trim();
  const base = original.replace(/\s+/g, " ").trim();
  if (prompt === "" || !isSubsequence(prompt, base)) return original;
  if (prompt.length < base.length * 0.3 && base.length - prompt.length > 12) return original;
  return prompt;
}

/**
 * Validate a chat model's JSON answer against the command's fields.
 * @returns `{ values, prompt }`: only valid, wanted fields; the prompt checked by
 *   {@link interpretedPrompt}. Undefined when the answer holds no JSON object.
 */
export function parseInterpretation(answer, { command, text, fields, images = 0 }) {
  const raw = String(answer ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return undefined;
  const values = {};
  const allowed = new Set(fields ?? INTERPRET_FIELDS[command] ?? []);
  const int = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
  if (allowed.has("seconds")) {
    const range = command === "extend" ? EXTEND_SECONDS : VIDEO_SECONDS;
    const seconds = intIn(int(data.seconds), range);
    if (seconds !== undefined) values.seconds = seconds;
  }
  if (allowed.has("resolution") && typeof data.resolution === "string") {
    const resolution = data.resolution.trim().toLowerCase();
    if (VIDEO_RESOLUTIONS.includes(resolution)) values.resolution = resolution;
  }
  if (allowed.has("aspect") && typeof data.aspect === "string") {
    const aspect = data.aspect.replace(/[：\s]/g, (c) => (c === "：" ? ":" : ""));
    if ((command === "image" ? IMAGE_ASPECTS : VIDEO_ASPECTS).includes(aspect)) values.aspect = aspect;
  }
  if (allowed.has("count")) {
    const count = intIn(int(data.count), IMAGE_COUNT);
    if (count !== undefined) values.count = count;
  }
  if (allowed.has("frames") && images > 0) {
    // The parser's words: undefined = default (first frame for one image, references for more).
    const frames = { "first-frame": images === 1 ? "first" : undefined, reference: "reference", "first-last": "first-last", "last-frame": "last" }[data.frames];
    if (frames !== undefined) values.frames = frames;
  }
  return { values, prompt: interpretedPrompt(data.prompt, text) };
}

/** Short labels of interpreted values for the chat row ("10s", "720p", "9:16", "2 images", "reference"). */
export function interpretationLabels(values) {
  return [
    ...(values.seconds !== undefined ? [`${values.seconds}s`] : []),
    ...(values.resolution !== undefined ? [values.resolution] : []),
    ...(values.aspect !== undefined ? [values.aspect] : []),
    ...(values.count !== undefined ? [`×${values.count}`] : []),
    ...(values.frames !== undefined ? [values.frames] : []),
  ];
}

// #endregion

/** The model id CPA's native video route accepts: `sora-2*` is an alias of Grok's video model there. */
export function videoRequestModel(modelId) {
  return mediaAliasTarget(modelId) ?? modelId;
}

function authHeaders(apiKey, accept = "application/json") {
  return {
    Accept: accept,
    ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function videoJson(fetchImpl, url, init, signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  let text;
  try {
    response = await fetchImpl(url, { ...init, signal: combined });
    text = await readBoundedText(response, MAX_VIDEO_JSON_BYTES);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return { response, text, payload };
}

/**
 * Submit one video through CPA's native xAI route `POST /v1/videos/generations`
 * (fields `model`, `prompt`, `duration`, `aspect_ratio`, `resolution`,
 * `image.url`; CPA passes them to xAI). An omitted ratio lets xAI choose
 * (16:9, or the first frame's ratio). A submitted video cannot be cancelled.
 * @param image - optional first frame `{ mediaType, data }`.
 * @returns `{ requestId }`.
 * @throws MediaError `upstream-error` (CPA refused; nothing was submitted), `invalid-response`, `network`, `timeout`.
 */
const dataUrl = (image) => `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;

export async function submitVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, model, prompt, seconds, aspect, resolution, image, lastFrame, references, signal }) {
  const body = { model: videoRequestModel(model), prompt, duration: seconds };
  if (aspect !== undefined) body.aspect_ratio = aspect;
  if (resolution !== undefined) body.resolution = resolution;
  if (image !== undefined) body.image = { url: dataUrl(image) };
  if (lastFrame !== undefined) body.last_frame = { url: dataUrl(lastFrame) };
  if (Array.isArray(references) && references.length > 0) body.reference_images = references.map((ref) => ({ url: dataUrl(ref) }));
  return postVideoJob(fetchImpl, `${rootURL}/v1/videos/generations`, apiKey, body, signal, VIDEO_GENERATION_BODY_MAX_BYTES);
}

/**
 * Edit (`POST /v1/videos/edits`) or extend (`POST /v1/videos/extensions`) any
 * MP4: by URL (`sourceUrl` — xAI's own short-lived result link or a public
 * http(s) address; xAI downloads it) or inline (`sourceData`, the file's bytes
 * as a base64 data URI). Extensions take `duration` (2–10 s, the added part
 * only); edits keep the source's length.
 * @returns `{ requestId }`.
 * @throws MediaError `request-too-large`, `route-unsupported`, `upstream-error`, …
 */
export async function submitVideoEdit({ fetch: fetchImpl = fetch, rootURL, apiKey, mode, sourceUrl, sourceData, prompt, seconds, signal }) {
  const url = sourceData !== undefined ? dataUrl({ mediaType: "video/mp4", data: sourceData }) : sourceUrl;
  const body = { model: VIDEO_EDIT_MODEL, prompt, video: { url } };
  if (mode === "extend" && seconds !== undefined) body.duration = seconds;
  return postVideoJob(
    fetchImpl,
    `${rootURL}/v1/videos/${mode === "extend" ? "extensions" : "edits"}`,
    apiKey,
    body,
    signal,
    VIDEO_UPLOAD_BODY_MAX_BYTES,
    sourceData !== undefined ? VIDEO_UPLOAD_TIMEOUT_MS : VIDEO_REQUEST_TIMEOUT_MS
  );
}

const VIDEO_UPLOAD_TIMEOUT_MS = 5 * 60_000;

async function postVideoJob(fetchImpl, url, apiKey, body, signal, maxBodyBytes, timeoutMs = VIDEO_REQUEST_TIMEOUT_MS) {
  const json = JSON.stringify(body);
  const bytes = Buffer.byteLength(json);
  // Refused here rather than upstream: CPA cools the credential down after some upstream errors.
  if (maxBodyBytes !== undefined && bytes > maxBodyBytes) throw new MediaError("request-too-large", String(bytes));
  const { response, text, payload } = await videoJson(
    fetchImpl,
    url,
    { method: "POST", headers: { ...authHeaders(apiKey), "Content-Type": "application/json" }, body: json },
    signal,
    timeoutMs
  );
  // The upstream has no such route (seen for /v1/videos/extensions behind some CPA servers).
  if (response.status === 405) throw new MediaError("route-unsupported", url.slice(url.lastIndexOf("/") + 1));
  if ((response.status === 400 || response.status === 413) && /length limit exceeded|request body too large/i.test(text)) {
    throw new MediaError("request-too-large", String(bytes));
  }
  if (!response.ok) throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  const requestId = String(payload?.request_id ?? payload?.id ?? "").trim();
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new MediaError("invalid-response");
  return { requestId };
}

/** xAI / OpenAI video status words → `queued` / `running` / `done` / `failed`, or undefined. */
export function videoState(status) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "in_progress":
    case "processing":
    case "running":
      return "running";
    case "completed":
    case "done":
    case "succeeded":
    case "success":
      return "done";
    case "failed":
    case "error":
    case "expired":
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      return undefined;
  }
}

function videoFailure(payload) {
  const error = payload?.error;
  const message = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : typeof payload?.code === "string" ? payload.code : "";
  return String(message).replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Ask CPA once about a submitted video (`GET /v1/videos/{request_id}`, the
 * native xAI shape; CPA routes it to the credential that accepted it while
 * its 3-hour binding lasts). A transient HTTP failure is reported as such so
 * the caller can retry. A finished video's own short-lived HTTPS URL comes
 * back as `sourceUrl` for edits / extensions only: the host keeps it in
 * memory and never stores, logs or returns it.
 * @returns `{ state, progress?, error?, seconds?, sourceUrl? }`; `state` is `queued` / `running` / `done` / `failed`.
 * @throws MediaError `upstream-error` (with `status`), `invalid-response`, `network`, `timeout`.
 */
export async function retrieveVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, requestId, signal }) {
  const { response, text, payload } = await videoJson(
    fetchImpl,
    `${rootURL}/v1/videos/${encodeURIComponent(requestId)}`,
    { method: "GET", headers: authHeaders(apiKey) },
    signal,
    VIDEO_REQUEST_TIMEOUT_MS
  );
  if (!response.ok) {
    const error = new MediaError("upstream-error", upstreamMessage(text, response.status));
    error.status = response.status;
    throw error;
  }
  if (payload === undefined || payload === null || typeof payload !== "object") throw new MediaError("invalid-response");
  const failure = videoFailure(payload);
  let state = videoState(payload.status);
  if (state === undefined && typeof payload.video?.url === "string") state = "done";
  if (failure !== "" && state !== "done") state = "failed";
  if (state === undefined) state = "queued";
  const progress = Number(payload.progress);
  const seconds = Number(payload.video?.duration ?? payload.seconds);
  let sourceUrl;
  if (state === "done" && typeof payload.video?.url === "string") {
    try {
      const parsed = new URL(payload.video.url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) sourceUrl = parsed.toString();
    } catch {}
  }
  return {
    state,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(Number.isFinite(progress) && progress >= 0 && progress <= 100 ? { progress: Math.round(progress) } : {}),
    ...(state === "failed" ? { error: failure || "the video could not be generated" } : {}),
    ...(Number.isFinite(seconds) && seconds > 0 ? { seconds: Math.round(seconds * 10) / 10 } : {}),
  };
}

/** Container from magic bytes: MP4 / MOV (`ftyp`) or WebM / Matroska (EBML), or undefined. */
export function sniffVideoType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp") {
    return String.fromCharCode(...b.subarray(8, 10)) === "qt" ? { mediaType: "video/quicktime", ext: "mov" } : { mediaType: "video/mp4", ext: "mp4" };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mediaType: "video/webm", ext: "webm" };
  return undefined;
}

/**
 * Download a finished video through CPA (`GET /openai/v1/videos/{id}/content`,
 * which fetches xAI's file with the credential's own proxy; the plugin never
 * contacts the upstream host) and stream it into `dir` without replacing a
 * file. At most `maxBytes`; a partial file is removed.
 * @returns the absolute path.
 * @throws MediaError `upstream-error`, `video-too-large`, `invalid-video`, `write-failed`, `network`, `timeout`.
 */
export async function downloadVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, requestId, dir, stem, signal, maxBytes = MAX_VIDEO_BYTES, timeoutMs = VIDEO_DOWNLOAD_TIMEOUT_MS }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  try {
    response = await fetchImpl(`${rootURL}/openai/v1/videos/${encodeURIComponent(requestId)}/content`, {
      method: "GET",
      headers: authHeaders(apiKey, "video/*, application/octet-stream"),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  if (!response.ok) {
    let text = "";
    try {
      text = await readBoundedText(response, 64 * 1024);
    } catch {}
    throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MediaError("video-too-large");
  mkdirSync(dir, { recursive: true });
  const reader = typeof response.body?.getReader === "function" ? response.body.getReader() : undefined;
  let first;
  let pending = [];
  try {
    if (reader === undefined) {
      first = new Uint8Array(await response.arrayBuffer());
    } else {
      // Read until the container header can be recognized.
      let size = 0;
      while (size < 16) {
        const { done, value } = await reader.read();
        if (done) break;
        pending.push(value);
        size += value.byteLength;
      }
      first = new Uint8Array(Buffer.concat(pending));
      pending = [];
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  const type = sniffVideoType(first);
  if (type === undefined) {
    await reader?.cancel().catch(() => {});
    throw new MediaError("invalid-video");
  }
  let fd;
  let path;
  for (let attempt = 0; attempt < 100 && fd === undefined; attempt += 1) {
    path = join(dir, attempt === 0 ? `${stem}.${type.ext}` : `${stem}-${attempt + 1}.${type.ext}`);
    try {
      fd = openSync(path, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") {
        await reader?.cancel().catch(() => {});
        throw new MediaError("write-failed", error?.code ?? undefined);
      }
    }
  }
  if (fd === undefined) {
    await reader?.cancel().catch(() => {});
    throw new MediaError("write-failed", "EEXIST");
  }
  let size = 0;
  const write = (chunk) => {
    size += chunk.byteLength;
    if (size > maxBytes) throw new MediaError("video-too-large");
    writeSync(fd, chunk);
  };
  try {
    write(first);
    if (reader !== undefined) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        write(value);
      }
    }
    closeSync(fd);
    fd = undefined;
    return path;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(path);
    } catch {}
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    if (typeof error?.code === "string") throw new MediaError("write-failed", error.code);
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
}

// #endregion

// #region Video job store (media-jobs.json)

export const MEDIA_JOBS_VERSION = 1;
const JOB_STATES = ["submitted", "done", "failed", "expired"];
const MAX_JOBS = 200;
const FINISHED_JOB_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One submitted video, enough to resume polling and saving after a reload or
 * restart: CPA's request id, the account and model, where to save, and the
 * chat row it belongs to. Never keys or upstream URLs.
 */
export function normalizeJob(value) {
  const job = plain(value);
  if (job === undefined || typeof job.id !== "string" || !REQUEST_ID_PATTERN.test(job.id)) return undefined;
  if (!JOB_STATES.includes(job.state) || typeof job.accountId !== "string" || !ACCOUNT_ID_PATTERN.test(job.accountId)) return undefined;
  if (typeof job.modelId !== "string" || job.modelId === "" || typeof job.cwd !== "string" || !isAbsolute(job.cwd)) return undefined;
  if (typeof job.submittedAt !== "string" || !Number.isFinite(Date.parse(job.submittedAt))) return undefined;
  return {
    id: job.id,
    state: job.state,
    accountId: job.accountId,
    modelId: job.modelId.slice(0, 300),
    ref: clip(job.ref, 400),
    ...(validSessionId(job.sessionId) === undefined ? {} : { sessionId: job.sessionId }),
    ...(validCommandId(job.commandId) === undefined ? {} : { commandId: job.commandId }),
    cwd: job.cwd,
    outputDir: typeof job.outputDir === "string" && job.outputDir !== "" ? job.outputDir.slice(0, MAX_OUTPUT_DIR) : "generated",
    prompt: clip(job.prompt, 4000),
    seconds: intIn(job.seconds, VIDEO_SECONDS) ?? 6,
    submittedAt: job.submittedAt.slice(0, 40),
    ...(typeof job.finishedAt === "string" ? { finishedAt: job.finishedAt.slice(0, 40) } : {}),
  };
}

export function normalizeMediaJobs(raw, now = Date.now()) {
  const jobs = [];
  const seen = new Set();
  for (const item of Array.isArray(plain(raw)?.jobs) ? raw.jobs : []) {
    const job = normalizeJob(item);
    if (job === undefined || seen.has(job.id)) continue;
    if (job.state !== "submitted" && now - Date.parse(job.finishedAt ?? job.submittedAt) > FINISHED_JOB_KEEP_MS) continue;
    seen.add(job.id);
    jobs.push(job);
    if (jobs.length >= MAX_JOBS) break;
  }
  return { version: MEDIA_JOBS_VERSION, jobs };
}

/**
 * Video jobs in their own file, re-read on every access; atomic writes; a
 * damaged file loads as empty and is kept as `*.corrupt-*.json` by the next write.
 */
export function createMediaJobStore(filePath, { now = () => Date.now() } = {}) {
  const read = () => {
    if (!existsSync(filePath)) return { data: normalizeMediaJobs({}, now()) };
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      if (plain(raw) === undefined) return { data: normalizeMediaJobs({}, now()), damaged: true };
      return { data: normalizeMediaJobs(raw, now()) };
    } catch {
      return { data: normalizeMediaJobs({}, now()), damaged: true };
    }
  };
  const write = (data, damaged) => {
    const next = normalizeMediaJobs(data, now());
    mkdirSync(dirname(filePath), { recursive: true });
    if (damaged && existsSync(filePath)) renameSync(filePath, filePath.replace(/\.json$/, `.corrupt-${Date.now().toString(36)}.json`));
    const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tmp, filePath);
    return next;
  };
  return {
    list() {
      return read().data.jobs;
    },
    get(id) {
      return read().data.jobs.find((job) => job.id === id);
    },
    /** Insert or merge one job (newest first). */
    put(job) {
      const { data, damaged } = read();
      const index = data.jobs.findIndex((j) => j.id === job.id);
      if (index >= 0) data.jobs[index] = { ...data.jobs[index], ...job };
      else data.jobs.unshift(job);
      return write(data, damaged).jobs.find((j) => j.id === job.id);
    },
  };
}

// #endregion
// #region Reference images (size fitting without dependencies)
//
// Upstreams cap the request body (xAI answers "Failed to read request body:
// length limit exceeded" near 2 MiB), and references travel base64-encoded
// inside the JSON. A reference over the byte budget is shrunk here: PNG is
// decoded with node:zlib, flattened onto white, scaled to fit, and encoded as
// baseline JPEG. Other formats over the budget are left to the caller (DSH's
// attachment store can derive a smaller version).

export const REFERENCE_MAX_EDGE = 1280;

/** Decode a non-interlaced PNG (any color type, 1–16-bit) to RGBA8, or undefined when unsupported. */
export function decodePng(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 33 || sniffImageType(b) !== "image/png") return undefined;
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette;
  let trns;
  const idat = [];
  while (offset + 8 <= b.length) {
    const length = b.readUInt32BE(offset);
    const name = b.toString("latin1", offset + 4, offset + 8);
    const data = b.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (name === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
  }
  if (width === 0 || height === 0 || interlace !== 0 || width * height > 40_000_000) return undefined;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (channels === undefined || ![1, 2, 4, 8, 16].includes(depth) || (type === 3 && palette === undefined)) return undefined;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((width * channels * depth) / 8);
  if (raw.length < height * (stride + 1)) return undefined;
  const lines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? lines[dst + x - bpp] : 0;
      const up = y > 0 ? lines[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? lines[dst - stride + x - bpp] : 0;
      let value = raw[src + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else if (filter !== 0) return undefined;
      lines[dst + x] = value & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  const sample = (row, index) => {
    if (depth === 8) return lines[row + index];
    if (depth === 16) return lines[row + index * 2];
    const perByte = 8 / depth;
    const byte = lines[row + Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && type !== 3 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const i = sample(row, x);
        rgba[o] = palette[i * 3] ?? 0;
        rgba[o + 1] = palette[i * 3 + 1] ?? 0;
        rgba[o + 2] = palette[i * 3 + 2] ?? 0;
        rgba[o + 3] = trns !== undefined && i < trns.length ? trns[i] : 255;
      } else if (type === 0 || type === 4) {
        const g = Math.round(sample(row, x * channels) * scale);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = type === 4 ? sample(row, x * channels + 1) : 255;
      } else {
        rgba[o] = sample(row, x * channels);
        rgba[o + 1] = sample(row, x * channels + 1);
        rgba[o + 2] = sample(row, x * channels + 2);
        rgba[o + 3] = type === 6 ? sample(row, x * channels + 3) : 255;
      }
    }
  }
  return { width, height, rgba };
}

/** Flatten onto white and scale down (area average) so the long edge is at most `maxEdge`; returns RGB8. */
export function fitRgb({ width, height, rgba }, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const rgb = new Uint8Array(w * h * 3);
  const fx = width / w;
  const fy = height / h;
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * fy)));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * fx)));
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const o = (yy * width + xx) * 4;
          const a = rgba[o + 3] / 255;
          r += rgba[o] * a + 255 * (1 - a);
          g += rgba[o + 1] * a + 255 * (1 - a);
          bl += rgba[o + 2] * a + 255 * (1 - a);
          n += 1;
        }
      }
      const d = (y * w + x) * 3;
      rgb[d] = Math.round(r / n);
      rgb[d + 1] = Math.round(g / n);
      rgb[d + 2] = Math.round(bl / n);
    }
  }
  return { width: w, height: h, rgb };
}

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const STD_LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
// Annex K standard Huffman tables: code counts per length 1..16, then symbols.
const HUFF = {
  dcL: [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  dcC: [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  acL: [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ]],
  acC: [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
    0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
    0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
    0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ]],
};

function huffmanCodes([counts, symbols]) {
  const codes = new Array(256);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < counts[length - 1]; i += 1) codes[symbols[k++]] = [code++, length];
    code <<= 1;
  }
  return codes;
}

const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C0 = 1 / Math.SQRT2;

/** Baseline JPEG (4:4:4, standard tables) from RGB8. */
export function encodeJpeg({ width, height, rgb }, quality = 85) {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const factor = q < 50 ? 5000 / q : 200 - q * 2;
  const table = (base) => base.map((v) => Math.min(255, Math.max(1, Math.floor((v * factor + 50) / 100))));
  const qL = table(STD_LUMA_Q);
  const qC = table(STD_CHROMA_Q);
  const codes = { dcL: huffmanCodes(HUFF.dcL), dcC: huffmanCodes(HUFF.dcC), acL: huffmanCodes(HUFF.acL), acC: huffmanCodes(HUFF.acC) };
  const out = [];
  const bytes = (...values) => out.push(...values);
  const marker = (code, payload) => {
    bytes(0xff, code, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff);
    for (const v of payload) out.push(v);
  };
  bytes(0xff, 0xd8);
  marker(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  marker(0xdb, [0, ...ZIGZAG.map((i) => qL[i]), 1, ...ZIGZAG.map((i) => qC[i])]);
  marker(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = [];
  for (const [id, key] of [[0x00, "dcL"], [0x10, "acL"], [0x01, "dcC"], [0x11, "acC"]]) dht.push(id, ...HUFF[key][0], ...HUFF[key][1]);
  marker(0xc4, dht);
  marker(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  let buffer = 0;
  let bits = 0;
  const writeBits = (value, length) => {
    buffer = (buffer << length) | (value & ((1 << length) - 1));
    bits += length;
    while (bits >= 8) {
      const byte = (buffer >> (bits - 8)) & 0xff;
      out.push(byte);
      if (byte === 0xff) out.push(0);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  };
  const category = (v) => {
    let a = Math.abs(v);
    let n = 0;
    while (a > 0) {
      n += 1;
      a >>= 1;
    }
    return n;
  };
  const encodeValue = (v, n) => writeBits(v < 0 ? v + (1 << n) - 1 : v, n);
  const block = new Float64Array(64);
  const tmp = new Float64Array(64);
  const coef = new Int32Array(64);
  const prev = [0, 0, 0];
  const encodeBlock = (component, quant, dcCodes, acCodes) => {
    // Separable 2-D DCT-II.
    for (let y = 0; y < 8; y += 1) {
      for (let u = 0; u < 8; u += 1) {
        let sum = 0;
        for (let x = 0; x < 8; x += 1) sum += block[y * 8 + x] * COS[x][u];
        tmp[y * 8 + u] = sum * (u === 0 ? C0 : 1) / 2;
      }
    }
    for (let u = 0; u < 8; u += 1) {
      for (let v = 0; v < 8; v += 1) {
        let sum = 0;
        for (let y = 0; y < 8; y += 1) sum += tmp[y * 8 + u] * COS[y][v];
        coef[v * 8 + u] = Math.round((sum * (v === 0 ? C0 : 1)) / 2 / quant[v * 8 + u]);
      }
    }
    const dc = coef[0] - prev[component];
    prev[component] = coef[0];
    const dn = category(dc);
    writeBits(dcCodes[dn][0], dcCodes[dn][1]);
    if (dn > 0) encodeValue(dc, dn);
    let run = 0;
    for (let k = 1; k < 64; k += 1) {
      const value = coef[ZIGZAG[k]];
      if (value === 0) {
        run += 1;
        continue;
      }
      while (run > 15) {
        writeBits(acCodes[0xf0][0], acCodes[0xf0][1]);
        run -= 16;
      }
      const n = category(value);
      const symbol = (run << 4) | n;
      writeBits(acCodes[symbol][0], acCodes[symbol][1]);
      encodeValue(value, n);
      run = 0;
    }
    if (run > 0) writeBits(acCodes[0][0], acCodes[0][1]);
  };
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let component = 0; component < 3; component += 1) {
        for (let y = 0; y < 8; y += 1) {
          const sy = Math.min(height - 1, by + y);
          for (let x = 0; x < 8; x += 1) {
            const o = (sy * width + Math.min(width - 1, bx + x)) * 3;
            const r = rgb[o];
            const g = rgb[o + 1];
            const b = rgb[o + 2];
            const value =
              component === 0 ? 0.299 * r + 0.587 * g + 0.114 * b
              : component === 1 ? -0.168736 * r - 0.331264 * g + 0.5 * b + 128
              : 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
            block[y * 8 + x] = value - 128;
          }
        }
        if (component === 0) encodeBlock(0, qL, codes.dcL, codes.acL);
        else encodeBlock(component, qC, codes.dcC, codes.acC);
      }
    }
  }
  if (bits > 0) writeBits(0x7f, 8 - bits);
  bytes(0xff, 0xd9);
  return new Uint8Array(out);
}

/**
 * A reference image within `maxBytes`: unchanged when it already fits; a PNG
 * over the budget is re-encoded as JPEG (flattened onto white, long edge at
 * most `maxEdge`, lower quality / size until it fits). Returns undefined for
 * other formats over the budget (the caller may ask DSH for a smaller version).
 * @param image - `{ mediaType, data }`.
 * @returns `{ mediaType, data, resized }` or undefined.
 */
export function fitReferenceImage(image, maxBytes, maxEdge = REFERENCE_MAX_EDGE) {
  const data = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data);
  if (data.byteLength <= maxBytes) return { mediaType: image.mediaType ?? sniffImageType(data) ?? "image/png", data, resized: false };
  const decoded = sniffImageType(data) === "image/png" ? decodePng(data) : undefined;
  if (decoded === undefined) return undefined;
  for (const edge of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.5), Math.round(maxEdge * 0.375)]) {
    const fitted = fitRgb(decoded, edge);
    for (const quality of [88, 78, 65]) {
      const jpeg = encodeJpeg(fitted, quality);
      if (jpeg.byteLength <= maxBytes) return { mediaType: "image/jpeg", data: jpeg, resized: true };
    }
  }
  return undefined;
}

// #endregion
// #region Agent tool (generate_media)
//
// Pure parts of the optional agent tool: its static definition (no model
// lists), argument checks, the command line it runs through the slash-command
// handlers, the run id derived from the tool call id, and the approval text.

export const GENERATE_MEDIA = "generate_media";

const MEDIA_ASPECTS_ALL = [...new Set([...IMAGE_ASPECTS, ...VIDEO_ASPECTS])];

// Responses strict schemas may require every property: null keeps optional and
// inapplicable arguments expressible without inventing a model, source or mode.
const optionalMediaArg = (schema, description) => ({
  oneOf: [schema, { type: "null" }],
  ...(description === undefined ? {} : { description }),
});

/** The tool's model-facing description and parameter schema (raw JSON Schema subset). */
export const GENERATE_MEDIA_TOOL = {
  name: GENERATE_MEDIA,
  description:
    "Generate an image or video with the user's CLIProxyAPI media models, or edit / extend a video; saves the files under the working directory and returns their paths. Pass the user's prompt in their own words and level of detail: never expand it into a longer scene description or add camera, lighting, style, character or environment details they did not ask for. Videos are billed, cannot be cancelled and may need the user's approval; never retry one that was declined or over budget.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "video"] },
      prompt: { type: "string", description: "The user's prompt, verbatim: their own words and level of detail. Do not rewrite, expand, translate or add style/camera/scene details." },
      mode: optionalMediaArg({ type: "string", enum: ["generate", "edit", "extend"] }, "Video only; null = generate."),
      model: optionalMediaArg({ type: "string" }, "Model id or unique part; null = user's pick."),
      images: optionalMediaArg({ type: "array", items: { type: "string" } }, "Image paths, or null. Image: up to 4 to edit/combine. Video: 1 = first frame, 2+ = references."),
      frames: optionalMediaArg({ type: "string", enum: ["first-frame", "reference", "first-last", "last-frame"] }, "Video images only; otherwise null. Pinned first-last/last-frame need grok-imagine-video-1.5."),
      video: optionalMediaArg({ type: "string" }, "Edit/extend source: MP4 path or public URL; null = session's newest video. Other modes: null."),
      aspect: optionalMediaArg({ type: "string", enum: MEDIA_ASPECTS_ALL }, "Image/video generation ratio, or null for default; edit/extend: null."),
      seconds: optionalMediaArg({ type: "integer" }, "Video length 1–15, extend adds 2–10; null = default. Image/edit: null."),
      resolution: optionalMediaArg({ type: "string", enum: ["480p", "720p"] }, "Video generation only; null = default or unused."),
      count: optionalMediaArg({ type: "integer" }, "Images 1–4; null = 1. Video: null."),
    },
    required: ["kind", "prompt"],
  },
};

/** The tool's result value schema (validated by DSH's tool registry). */
export const GENERATE_MEDIA_OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["done", "running"] },
    kind: { type: "string" },
    mode: { type: "string" },
    model: { type: "string" },
    account: { type: "string" },
    run: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    folder: { type: "string" },
    seconds: { type: "integer" },
    resolution: { type: "string" },
    aspect: { type: "string" },
    revisedPrompt: { type: "string" },
    note: { type: "string" },
    previews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          attachmentId: { type: "string" },
          mediaType: { type: "string" },
          bytes: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          name: { type: "string" },
          originalDimensions: {
            type: "object",
            additionalProperties: false,
            properties: { width: { type: "integer" }, height: { type: "integer" } },
            required: ["width", "height"],
          },
        },
        required: ["attachmentId", "mediaType", "bytes", "width", "height"],
      },
    },
  },
  required: ["status", "kind", "model", "run", "files"],
};

/**
 * Check one `generate_media` call's arguments.
 * @returns the normalized arguments.
 * @throws Error with a model-facing message.
 */
export function parseToolArgs(args) {
  const input = plain(args);
  if (input === undefined) throw new Error("arguments must be an object");
  const known = new Set(Object.keys(GENERATE_MEDIA_TOOL.parameters.properties));
  for (const key of Object.keys(input)) if (!known.has(key)) throw new Error(`unknown argument "${key}"`);
  // Canonical strict-schema calls use null for absent optional fields. Also
  // accept empty strings from older all-fields calls, without changing prompt.
  const a = Object.fromEntries(Object.entries(input).filter(([key, value]) =>
    key === "kind" || key === "prompt" || (value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""))
  ));
  if (a.kind !== "image" && a.kind !== "video") throw new Error('kind must be "image" or "video"');
  if (typeof a.prompt !== "string" || a.prompt.trim() === "") throw new Error("prompt must be a non-empty string");
  if (a.prompt.length > 4000) throw new Error("prompt is longer than 4000 characters");
  const str = (key) => {
    if (a[key] === undefined) return undefined;
    if (typeof a[key] !== "string" || a[key].trim() === "") throw new Error(`${key} must be a non-empty string`);
    return a[key].trim();
  };
  const int = (key) => {
    if (a[key] === undefined) return undefined;
    if (!Number.isInteger(a[key])) throw new Error(`${key} must be an integer`);
    return a[key];
  };
  const out = { kind: a.kind, prompt: a.prompt.trim() };
  const model = str("model");
  if (model !== undefined) {
    if (/\s/.test(model)) throw new Error("model must not contain spaces");
    out.model = model;
  }
  if (a.images !== undefined) {
    if (!Array.isArray(a.images) || a.images.some((p) => typeof p !== "string" || p.trim() === "")) throw new Error("images must be an array of paths");
    if (a.images.length > 14) throw new Error("at most 14 images");
    if (a.images.length > 0) out.images = a.images.map((p) => p.trim());
  }
  const aspect = str("aspect");
  if (aspect !== undefined) out.aspect = aspect;
  if (a.kind === "image") {
    // Older strict calls supplied these neutral defaults even for images.
    if (a.mode === "generate") delete a.mode;
    if (a.frames === "first-frame") delete a.frames;
    for (const key of ["mode", "frames", "video", "seconds", "resolution"]) if (a[key] !== undefined) throw new Error(`${key} is for videos only`);
    const count = int("count");
    if (count !== undefined && (count < 1 || count > 4)) throw new Error("count must be 1–4 for images");
    if (count !== undefined) out.count = count;
    if (aspect !== undefined && !IMAGE_ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${IMAGE_ASPECTS.join(", ")} for images`);
    if ((out.images?.length ?? 0) > MAX_REFERENCE_IMAGES) throw new Error(`at most ${MAX_REFERENCE_IMAGES} images for an image`);
    return out;
  }
  // One video is already the only supported behavior: legacy count: 1 is a
  // harmless default, but an actual request for multiple videos is rejected.
  if (a.count !== undefined && a.count !== 1) throw new Error("count is for images only; use null for a video (one video per call)");
  const mode = str("mode") ?? "generate";
  if (!["generate", "edit", "extend"].includes(mode)) throw new Error('mode must be "generate", "edit" or "extend"');
  out.mode = mode;
  const seconds = int("seconds");
  if (seconds !== undefined) out.seconds = seconds;
  if (mode === "generate") {
    if (a.video !== undefined) throw new Error("video is for mode edit / extend");
    if (seconds !== undefined && (seconds < 1 || seconds > 15)) throw new Error("seconds must be 1–15 for video generation");
    if (aspect !== undefined && !VIDEO_ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${VIDEO_ASPECTS.join(", ")} for videos`);
    const resolution = str("resolution");
    if (resolution !== undefined && !["480p", "720p"].includes(resolution)) throw new Error("resolution must be 480p or 720p");
    if (resolution !== undefined) out.resolution = resolution;
    const frames = str("frames");
    if (frames !== undefined) {
      if (!["first-frame", "reference", "first-last", "last-frame"].includes(frames)) throw new Error("frames must be first-frame, reference, first-last or last-frame");
      const count = out.images?.length ?? 0;
      // A legacy all-fields text-video call supplied first-frame with no images.
      // It is still text-to-video, not an implicit image or a guessed reference.
      if (count === 0 && frames !== "first-frame") throw new Error("frames needs images; use null without images");
      if (count > 0) {
        if ((frames === "first-frame" || frames === "last-frame") && count !== 1) throw new Error(`${frames} needs exactly one image`);
        if (frames === "first-last" && count !== 2) throw new Error("first-last needs exactly two images");
        out.frames = frames;
      }
    }
    return out;
  }
  if (a.images?.length === 0) delete a.images;
  if (a.frames === "first-frame") delete a.frames;
  for (const key of ["images", "frames", "aspect", "resolution"]) if (a[key] !== undefined) throw new Error(`${key} is not used by mode ${mode} (the output keeps the source's format)`);
  if (mode === "edit" && seconds !== undefined) throw new Error("an edit keeps the source's length; seconds is for extend");
  if (mode === "extend" && seconds !== undefined && (seconds < 2 || seconds > 10)) throw new Error("seconds must be 2–10 for extend");
  const video = str("video");
  if (video !== undefined) out.video = video;
  return out;
}

/** The slash-command line (after the command name) that runs these arguments, taken literally. */
export function toolCommandLine(t) {
  const parts = [];
  if (t.model !== undefined) parts.push(`-m ${t.model}`);
  if (t.kind === "image") {
    if (t.aspect !== undefined) parts.push(`--aspect ${t.aspect}`);
    if (t.count !== undefined) parts.push(`-n ${t.count}`);
  } else if (t.mode === "generate") {
    if (t.aspect !== undefined) parts.push(`--aspect ${t.aspect}`);
    if (t.seconds !== undefined) parts.push(`-s ${t.seconds}`);
    if (t.resolution !== undefined) parts.push(`-r ${t.resolution}`);
    const flag = { reference: "--ref", "first-last": "--first-last", "last-frame": "--last" }[t.frames];
    if (flag !== undefined) parts.push(flag);
  } else {
    if (t.video !== undefined) {
      if (/^https?:\/\//i.test(t.video)) parts.push(`--url ${t.video.replace(/\s/g, "%20")}`);
      else {
        if (t.video.includes('"')) throw new Error("video path must not contain a double quote");
        parts.push(`--video "${t.video}"`);
      }
    }
    if (t.mode === "extend" && t.seconds !== undefined) parts.push(`-s ${t.seconds}`);
  }
  parts.push("--", t.prompt);
  return parts.join(" ");
}

/** The run id (a chat-row key) for one tool call: the call id with other characters replaced. */
export function toolRunId(callId) {
  const raw = String(callId ?? "").replace(/[^A-Za-z0-9._:-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 119);
  return validCommandId(raw);
}

/**
 * What the approval prompt says about one generation (both languages).
 * @param plan - from the command's gate: kind, mode, option, prompt, seconds, resolution, aspect, references, count, sourceName.
 * @param policy - `agentPolicy()` of the root session (videos show the budget).
 */
export function approvalText(plan, policy) {
  const prompt = plan.prompt.length > 80 ? `${plan.prompt.slice(0, 80)}…` : plan.prompt;
  const model = `${plan.option.modelId} (${plan.option.accountName})`;
  const modelZh = `${plan.option.modelId}（${plan.option.accountName}）`;
  if (plan.kind === "image") {
    const n = plan.count ?? 1;
    return {
      reason: `generate ${n} image(s) with ${plan.option.ref}`,
      en: `${plan.references > 0 ? `Edit ${plan.references} image(s) into` : "Generate"} ${n} image(s) with ${model}: "${prompt}".`,
      zh: `用 ${modelZh}${plan.references > 0 ? `改 ${plan.references} 张图，` : ""}生成 ${n} 张图片：「${prompt}」。`,
    };
  }
  const used = policy.limit === undefined ? `${policy.used} s (no limit)` : `${policy.used} of ${policy.limit} s`;
  const usedZh = policy.limit === undefined ? `${policy.used} 秒（不限）` : `${policy.used} / ${policy.limit} 秒`;
  const shape = [plan.resolution, plan.aspect].filter(Boolean).join(", ");
  const what =
    plan.mode === "edit" ? `Edit the video${plan.sourceName ? ` ${plan.sourceName}` : ""}`
    : plan.mode === "extend" ? `Extend the video${plan.sourceName ? ` ${plan.sourceName}` : ""} by ${plan.seconds} s`
    : `Generate a ${plan.seconds} s video${shape ? ` (${shape})` : ""}`;
  const whatZh =
    plan.mode === "edit" ? `编辑视频${plan.sourceName ? ` ${plan.sourceName}` : ""}`
    : plan.mode === "extend" ? `把视频${plan.sourceName ? ` ${plan.sourceName}` : ""}延长 ${plan.seconds} 秒`
    : `生成 ${plan.seconds} 秒视频${shape ? `（${shape}）` : ""}`;
  const refs = plan.references > 0 ? ` with ${plan.references} attached image(s)` : "";
  const refsZh = plan.references > 0 ? `，附 ${plan.references} 张图` : "";
  return {
    reason: `${plan.mode ?? "generate"} a ${plan.seconds} s video with ${plan.option.ref}`,
    en: `${what} with ${model}${refs}: "${prompt}". It is billed and cannot be cancelled once submitted. Agent videos in this session so far: ${used}.`,
    zh: `用 ${modelZh}${whatZh}${refsZh}：「${prompt}」。提交后无法取消，会照常计费。本会话 agent 已用视频 ${usedZh}。`,
  };
}

// #endregion
