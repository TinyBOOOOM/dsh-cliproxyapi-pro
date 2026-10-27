// Per-session picks, run records, recent outputs and agent budget policy.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { MAX_RUNS, VIDEO_MODES, IMAGE_ASPECTS, VIDEO_SECONDS, VIDEO_RESOLUTIONS, CONFIRM_MODES } from "./constants.js";
import { validBudget, validSelectionRef } from "./settings.js";
import { MediaError, plain, intIn, clip } from "./util.js";

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


const RUN_STATUSES = ["running", "done", "error"];

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
