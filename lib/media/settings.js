// Independent media preferences, normalization and validated patches.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MEDIA_SETTINGS_VERSION, VIDEO_SECONDS, VIDEO_RESOLUTIONS, BUDGET_SECONDS, CONFIRM_MODES, MAX_LIST, MAX_OUTPUT_DIR, ACCOUNT_ID_PATTERN } from "./constants.js";
import { MEDIA_KINDS } from "./classify.js";
import { MediaError, plain, intIn } from "./util.js";

// #region Preferences (media-settings.json)

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

export { validBudget, validSelectionRef };
