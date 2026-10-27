// Shared quota value normalization, window construction, and safe credential metadata.
import { STATUS_MESSAGE_MAX, W5H, W1D, W7D, KIND_RANK, PLAN_LABELS } from "./constants.js";

//#region Helpers

class QuotaError extends Error {
  constructor(code, status) {
    super(`quota: ${code}${status === undefined ? "" : ` (${status})`}`);
    this.name = "QuotaError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");
const firstText = (...values) => {
  for (const v of values) {
    const t = typeof v === "number" && Number.isFinite(v) ? String(v) : text(v);
    if (t !== "") return t;
  }
  return "";
};
const numberOrNull = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const flagOf = (v) => {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off"].includes(s)) return false;
  }
  return undefined;
};
const clampPct = (v) => Math.max(0, Math.min(100, v));
const roundPct = (v) => (v === null ? null : Math.round(clampPct(v) * 100) / 100);
const getPath = (obj, path) => {
  let cur = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
};

function fractionPercent(value) {
  const raw = text(value);
  if (raw.endsWith("%")) {
    const n = Number(raw.slice(0, -1));
    return Number.isFinite(n) ? clampPct(n) : null;
  }
  const n = numberOrNull(value);
  if (n === null) return null;
  return n > 1 && n <= 100 ? clampPct(n) : clampPct(n * 100);
}

function kindFromText(...values) {
  const s = values.map((v) => text(v).toLowerCase()).filter(Boolean).join(" ");
  if (s === "") return "";
  if (/(?:^|[^0-9])5\s*[-_ ]?(?:h|hr|hour|hours)\b|five\s*[-_ ]?hour/.test(s)) return "5h";
  if (/(?:^|[^0-9])7\s*[-_ ]?(?:d|day|days)\b|weekly|week/.test(s)) return "7d";
  if (/(?:28|29|30|31)\s*[-_ ]?(?:d|day|days)\b|monthly|month/.test(s)) return "30d";
  if (/daily|(?:^|[^0-9])1\s*[-_ ]?(?:d|day)\b|\bday\b/.test(s)) return "1d";
  return "";
}

function kindFromSeconds(value) {
  const seconds = numberOrNull(value);
  if (seconds === null || seconds <= 0) return "";
  if (seconds === W5H) return "5h";
  if (seconds === W7D) return "7d";
  if (seconds >= 28 * W1D && seconds <= 31 * W1D) return "30d";
  if (seconds === W1D) return "1d";
  return "";
}

function durationSeconds(value, unit) {
  const n = numberOrNull(value);
  if (n === null || n <= 0) return null;
  const u = text(unit).toLowerCase().replace(/^time_unit_/, "");
  if (u.startsWith("second")) return n;
  if (u.startsWith("hour")) return n * 3600;
  if (u.startsWith("day")) return n * W1D;
  if (u.startsWith("week")) return n * W7D;
  return n * 60;
}

/** Infers a window kind from the reset distance (Google per-model buckets carry no window metadata). */
function kindFromReset(resetAt, nowMs) {
  if (resetAt === null) return "other";
  const delta = Date.parse(resetAt) - nowMs;
  if (!Number.isFinite(delta)) return "other";
  return delta <= 8 * 3600 * 1000 ? "5h" : delta <= 8 * W1D * 1000 ? "7d" : "other";
}

function isoFromUnix(value) {
  const n = numberOrNull(value);
  if (n === null || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoFromString(value) {
  const raw = text(value);
  if (raw === "") return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return isoFromUnix(raw);
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function isoFromRelative(seconds, nowMs) {
  const n = numberOrNull(seconds);
  if (n === null || n < 0) return null;
  return new Date(nowMs + n * 1000).toISOString();
}

function makeWindow({ id, kind, label, group, remainingPercent, resetAt, modelIds, modelPrefixes }) {
  const row = {
    id,
    kind: KIND_RANK[kind] === undefined ? "other" : kind,
    label: text(label),
    remainingPercent: roundPct(remainingPercent ?? null),
    resetAt: resetAt ?? null,
  };
  if (text(group) !== "") row.group = text(group);
  if (Array.isArray(modelIds) && modelIds.length > 0) row.modelIds = [...new Set(modelIds)];
  if (Array.isArray(modelPrefixes) && modelPrefixes.length > 0) row.modelPrefixes = [...modelPrefixes];
  return row;
}

function sortWindows(rows) {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => KIND_RANK[a.row.kind] - KIND_RANK[b.row.kind] || a.index - b.index)
    .map(({ row }) => row);
}

/** Keeps the most conservative row for duplicate keys. */
function dedupeWindows(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const prev = map.get(key);
    if (prev === undefined) {
      map.set(key, row);
    } else if (row.remainingPercent !== null && (prev.remainingPercent === null || row.remainingPercent < prev.remainingPercent)) {
      map.set(key, { ...prev, remainingPercent: row.remainingPercent, resetAt: prev.resetAt ?? row.resetAt });
    }
  }
  return [...map.values()];
}

function normalizeProvider(value) {
  const p = text(value).toLowerCase();
  if (p === "anthropic" || p === "claude-code") return "claude";
  if (p === "grok" || p === "x-ai" || p === "x.ai") return "xai";
  if (p === "zai" || p === "zhipu" || p === "chatglm") return "glm";
  if (p === "moonshot" || p === "kimi-ai" || p === "kimi_ai") return "kimi";
  return p;
}

function normalizePlanToken(value) {
  const raw = text(value);
  if (raw === "") return "";
  const key = raw.toLowerCase().replace(/[\s_]+/g, "-");
  if (PLAN_LABELS[key] !== undefined) return key;
  if (/ultra-?lite/.test(key)) return "ultra-lite";
  if (/ultra/.test(key)) return "ultra";
  if (/(^|-)pro($|-)/.test(key)) return "pro";
  if (/(^|-)free($|-)/.test(key)) return "free";
  if (/plus/.test(key)) return "plus";
  if (/(^|-)max($|-)/.test(key)) return "max";
  if (/team/.test(key)) return "team";
  if (/enterprise/.test(key)) return "enterprise";
  return "";
}

const PLAN_FIELD = /plan|tier|subscription|membership/i;

function planValue(value, field) {
  if (typeof value === "string") {
    const raw = text(value);
    if (raw === "") return "";
    const token = normalizePlanToken(raw);
    if (token !== "") return PLAN_LABELS[token];
    return PLAN_FIELD.test(field) && raw.length <= 40 && !raw.includes("@") ? raw : "";
  }
  if (!isObj(value)) return "";
  for (const key of ["plan", "plan_type", "planType", "tier_name", "tierName", "tier_id", "tierId"]) {
    const resolved = planValue(value[key], key);
    if (resolved !== "") return resolved;
  }
  if (PLAN_FIELD.test(field)) {
    for (const key of ["name", "id"]) {
      const resolved = planValue(value[key], `${field}.${key}`);
      if (resolved !== "") return resolved;
    }
  }
  return "";
}

const PLAN_PATHS = [
  ["paidTier"], ["paid_tier"], ["subscription"], ["plan"], ["plan_type"], ["planType"],
  ["chatgpt_plan_type"], ["https://api.openai.com/auth", "chatgpt_plan_type"],
  ["tier"], ["tier_name"], ["tierName"], ["tier_id"], ["tierId"], ["currentTier"], ["current_tier"],
  ["account", "subscription"], ["account", "plan"], ["account", "plan_type"], ["account", "tier"],
  ["organization", "subscription"], ["organization", "plan"],
  ["metadata", "subscription"], ["metadata", "plan"], ["metadata", "plan_type"], ["metadata", "tier"],
  ["attributes", "subscription"], ["attributes", "plan"], ["attributes", "plan_type"], ["attributes", "tier"],
  ["account_type"],
];

/** Plan label from auth-file / upstream payloads; paid tiers are checked before current/default tiers. */
function extractPlan(...sources) {
  for (const source of sources) {
    if (!isObj(source)) continue;
    for (const path of PLAN_PATHS) {
      const resolved = planValue(getPath(source, path), path.join("."));
      if (resolved !== "") return resolved;
    }
  }
  return "";
}

function claimsOf(value) {
  if (isObj(value)) return value;
  const raw = text(value);
  if (raw === "") return null;
  try {
    if (raw.startsWith("{")) return JSON.parse(raw);
    const parts = raw.split(".");
    if (parts.length < 2) return null;
    const parsed = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function entryClaims(entry) {
  return [entry.id_token, getPath(entry, ["tokens", "id_token"]), getPath(entry, ["metadata", "id_token"]), getPath(entry, ["attributes", "id_token"])]
    .map(claimsOf)
    .filter((c) => c !== null);
}

function codexAccountId(entry) {
  const direct = firstText(
    entry.chatgpt_account_id,
    entry.account_id,
    getPath(entry, ["tokens", "account_id"]),
    getPath(entry, ["tokens", "chatgpt_account_id"]),
    getPath(entry, ["metadata", "account_id"]),
    getPath(entry, ["attributes", "account_id"]),
  );
  if (direct !== "") return direct;
  for (const claims of entryClaims(entry)) {
    const id = firstText(claims.chatgpt_account_id, getPath(claims, ["https://api.openai.com/auth", "chatgpt_account_id"]));
    if (id !== "") return id;
  }
  return "";
}

function projectIdOf(entry) {
  return firstText(
    entry.project_id,
    entry.projectId,
    getPath(entry, ["metadata", "project_id"]),
    getPath(entry, ["metadata", "projectId"]),
    getPath(entry, ["attributes", "project_id"]),
    getPath(entry, ["attributes", "projectId"]),
    getPath(entry, ["attributes", "gemini_virtual_project"]),
  );
}

function shortMessage(value) {
  const raw = typeof value === "string" ? value : "";
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, "$1 [redacted]")
    .replace(/\b(?:sk|rk|pk|xai|ya29)[-_.][A-Za-z0-9_\-.]{8,}/g, "[redacted]")
    .trim();
  return cleaned.length > STATUS_MESSAGE_MAX ? `${cleaned.slice(0, STATUS_MESSAGE_MAX - 1)}…` : cleaned;
}

function parseRecent(entry) {
  let success = 0;
  let failed = 0;
  let seen = false;
  const add = (item) => {
    if (!isObj(item)) return;
    const s = numberOrNull(item.success ?? item.success_count ?? item.successCount);
    const f = numberOrNull(item.failed ?? item.failure ?? item.failed_count ?? item.failure_count ?? item.failedCount);
    if (s === null && f === null) return;
    seen = true;
    success += Math.max(0, s ?? 0);
    failed += Math.max(0, f ?? 0);
  };
  const raw = entry.recent_requests ?? entry.recentRequests;
  if (Array.isArray(raw)) raw.forEach(add);
  else add(raw);
  if (!seen) add(entry);
  return seen ? { success, failed } : undefined;
}

function credentialStatus(entry) {
  if (flagOf(entry.disabled) === true) return "disabled";
  const status = text(entry.status).toLowerCase();
  if (status === "disabled") return "disabled";
  if (flagOf(entry.unavailable) === true || status === "unavailable") return "unavailable";
  if (status === "error" || status === "invalid" || status === "expired") return "error";
  return "active";
}

function prefixOf(credential) {
  return text(credential?.prefix).toLowerCase();
}

//#endregion

export { QuotaError, isObj, text, firstText, numberOrNull, flagOf, clampPct, roundPct, getPath, fractionPercent, kindFromText, kindFromSeconds, durationSeconds, kindFromReset, isoFromUnix, isoFromString, isoFromRelative, makeWindow, sortWindows, dedupeWindows, normalizeProvider, extractPlan, entryClaims, codexAccountId, projectIdOf, shortMessage, parseRecent, credentialStatus, prefixOf };
