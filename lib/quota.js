// Host-side quota engine for dsh-cliproxyapi-pro.
//
// Reads a CLIProxyAPI (CPA) server's credentials through its management API
// (`/v0/management/auth-files`, `/auth-files/models`, `/api-call` with
// `$TOKEN$` substitution) and queries the upstream quota endpoints that the
// providers expose (Codex, Claude, Antigravity, Gemini CLI, Kimi, xAI, Devin,
// Meta), plus CPA's own normalized quota route for plugin providers. It
// produces a JSON-serializable snapshot without keys, tokens or raw upstream
// bodies, and maps DSH model ids to the credentials that serve them.
//
// Upstream protocol knowledge follows the MIT-licensed "CliProxyAPI quota"
// browser plugin, re-implemented here for the host.

export const QUOTA_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_QUOTA_TIMEOUT_MS = 15_000;
export const DEFAULT_QUOTA_CONCURRENCY = 4;
export const MAX_QUOTA_RESPONSE_BYTES = 4 * 1024 * 1024;

const MANAGEMENT_KEY_REF = "CLI_PROXY_MANAGEMENT_KEY";
const STATUS_MESSAGE_MAX = 160;

const UPSTREAM = {
  codexUsage: "https://chatgpt.com/backend-api/wham/usage",
  claudeProfile: "https://api.anthropic.com/api/oauth/profile",
  claudeUsage: "https://api.anthropic.com/api/oauth/usage",
  googleLoad: "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  googleQuota: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  // cloudcode-pa still serves the Gemini group; the daily/sandbox hosts may
  // return only "Claude and GPT models". Summary hosts first, then the
  // per-model fallbacks.
  antigravityQuota: [
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
  ],
  antigravityModels: [
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  ],
  kimiUsage: "https://api.kimi.com/coding/v1/usages",
  // Kimi International (kimi.ai) accounts use the same API on another host.
  kimiAiUsage: "https://api.kimi.ai/coding/v1/usages",
  // Meta Muse Code subscription usage (needs the credential's dca_token).
  metaUsage: "https://api.meta.ai/muse-code/key",
  xaiBillingWeekly: "https://cli-chat-proxy.grok.com/v1/billing?format=credits",
  xaiBillingMonthly: "https://cli-chat-proxy.grok.com/v1/billing",
  // Connect RPC (JSON); the same call CPA's management center makes for Devin.
  devinStatus: "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus",
};

// Client identity sent by CPA's management center; `$TOKEN$` is substituted
// by CPA's api-call with the credential's own session token.
const DEVIN_METADATA = {
  ideName: "chisel",
  ideVersion: "3000.10.21",
  apiKey: "$TOKEN$",
  locale: "en",
  os: "darwin",
  extensionVersion: "3000.10.21",
  clientName: "chisel",
};

const AG_META = { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
const GEMINI_META = { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
const AG_SUMMARY_UA = "antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)";
const AG_MODELS_UA = "antigravity/1.11.5 windows/amd64";
const CODEX_UA = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";

const GROUP_CLAUDE_GPT = "Claude and GPT models";
const GROUP_GEMINI = "Gemini models";
const GROUP_OTHER = "Other models";

const W5H = 5 * 60 * 60;
const W1D = 24 * 60 * 60;
const W7D = 7 * W1D;
const KIND_RANK = { "5h": 0, "7d": 1, "30d": 2, "1d": 3, other: 4 };

const PLAN_LABELS = {
  free: "Free",
  "free-tier": "Free",
  "plan-free": "Free",
  basic: "Basic",
  standard: "Standard",
  team: "Team",
  "plan-team": "Team",
  pro: "Pro",
  "plan-pro": "Pro",
  "g1-pro-tier": "Pro",
  max: "Max",
  "plan-max": "Max",
  plus: "Plus",
  ultra: "Ultra",
  "g1-ultra-tier": "Ultra",
  "ultra-lite": "Ultra Lite",
  "g1-ultra-lite-tier": "Ultra Lite",
  paid: "Paid",
  enterprise: "Enterprise",
};

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

//#region Management Origin & Key Ref

/** Credential ref for an account's CPA management key. */
export function managementKeyRef(accountId) {
  const id = text(accountId);
  if (id === "" || id === "default") return MANAGEMENT_KEY_REF;
  return `${MANAGEMENT_KEY_REF}_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** Management API base of an account endpoint: trailing slashes and a trailing `/v1` removed. */
export function managementOrigin(baseURL) {
  let raw = text(baseURL);
  if (raw === "") return undefined;
  raw = raw.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\/v1$/i, "").replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

//#endregion

//#region Upstream Parsers

function parseCodexWindows(body, nowMs) {
  const windows = [];
  const addLimit = (info, idPrefix, group) => {
    if (!isObj(info)) return;
    const exhausted = flagOf(info.limit_reached ?? info.limitReached) === true || info.allowed === false;
    const slots = [
      ["primary", info.primary_window ?? info.primaryWindow, "5h"],
      ["secondary", info.secondary_window ?? info.secondaryWindow, "7d"],
    ];
    for (const [slot, raw, fallbackKind] of slots) {
      if (!isObj(raw)) continue;
      const seconds = raw.limit_window_seconds ?? raw.limitWindowSeconds;
      const kind = kindFromSeconds(seconds) || (numberOrNull(seconds) === null ? fallbackKind : "other");
      const used = numberOrNull(raw.used_percent ?? raw.usedPercent);
      const resetAt = isoFromUnix(raw.reset_at ?? raw.resetAt) ?? isoFromRelative(raw.reset_after_seconds ?? raw.resetAfterSeconds, nowMs);
      if (used === null && resetAt === null) continue;
      windows.push(makeWindow({
        id: `${idPrefix}:${slot}`,
        kind,
        label: "",
        group,
        remainingPercent: used !== null ? 100 - clampPct(used) : exhausted ? 0 : null,
        resetAt,
      }));
    }
  };
  addLimit(body.rate_limit ?? body.rateLimit, "codex", undefined);
  addLimit(body.code_review_rate_limit ?? body.codeReviewRateLimit, "codex-review", "code_review");
  const extras = body.additional_rate_limits ?? body.additionalRateLimits;
  if (Array.isArray(extras)) {
    extras.forEach((item, index) => {
      if (!isObj(item)) return;
      const name = firstText(item.limit_name, item.limitName, item.metered_feature, item.meteredFeature, `extra-${index + 1}`);
      addLimit(item.rate_limit ?? item.rateLimit, `codex-extra:${name}`, name);
    });
  }
  return windows;
}

const CLAUDE_WINDOWS = [
  ["five_hour", "5h", undefined, undefined],
  ["seven_day", "7d", undefined, undefined],
  ["seven_day_oauth_apps", "7d", "oauth_apps", undefined],
  ["seven_day_opus", "7d", "opus", ["claude-opus"]],
  ["seven_day_sonnet", "7d", "sonnet", ["claude-sonnet"]],
  ["seven_day_cowork", "7d", "cowork", undefined],
  ["iguana_necktie", "7d", "fable", undefined],
];

function parseClaudeWindows(body) {
  const rows = [];
  for (const [key, kind, group, prefixes] of CLAUDE_WINDOWS) {
    const raw = body[key];
    if (!isObj(raw)) continue;
    // Anthropic reports utilization in percent (0..100).
    const used = numberOrNull(raw.utilization);
    const resetAt = isoFromString(firstText(raw.resets_at, raw.resetsAt, raw.reset_at, raw.resetAt));
    if (used === null && resetAt === null) continue;
    rows.push(makeWindow({ id: `claude:${key}`, kind, label: key, group, remainingPercent: used === null ? null : 100 - clampPct(used), resetAt, modelPrefixes: prefixes }));
  }
  if (Array.isArray(body.limits)) {
    for (const limit of body.limits) {
      if (!isObj(limit) || text(limit.kind).toLowerCase() !== "weekly_scoped") continue;
      const model = text(getPath(limit, ["scope", "model", "display_name"]));
      if (model === "") continue;
      const used = numberOrNull(limit.percent);
      const resetAt = isoFromString(firstText(limit.resets_at, limit.resetAt));
      if (used === null && resetAt === null) continue;
      const group = model.toLowerCase().replace(/\s+\d+(?:\.\d+)*$/, "").replace(/\s+/g, "_");
      rows.push(makeWindow({ id: `claude:scoped:${group}`, kind: "7d", label: model, group, remainingPercent: used === null ? null : 100 - clampPct(used), resetAt }));
    }
  }
  const extra = body.extra_usage;
  if (isObj(extra)) {
    const limit = numberOrNull(extra.monthly_limit);
    const used = numberOrNull(extra.used_credits);
    if (limit !== null && limit > 0 && used !== null) {
      rows.push(makeWindow({ id: "claude:extra_usage", kind: "30d", label: "extra_usage", group: "extra_usage", remainingPercent: ((limit - used) / limit) * 100, resetAt: null }));
    }
  }
  // The same scoped weekly limit can arrive as a named key and as limits[].
  return dedupeWindows(rows, (row) => `${row.kind}:${row.group ?? ""}`);
}

function claudeProfilePlan(profile) {
  const hasMax = flagOf(getPath(profile, ["account", "has_claude_max"]));
  const hasPro = flagOf(getPath(profile, ["account", "has_claude_pro"]));
  const orgType = text(getPath(profile, ["organization", "organization_type"])).toLowerCase();
  const subStatus = text(getPath(profile, ["organization", "subscription_status"])).toLowerCase();
  if (hasMax === true) return "Max";
  if (hasPro === true) return "Pro";
  if (orgType === "claude_team" && subStatus === "active") return "Team";
  if (orgType === "claude_enterprise" && subStatus === "active") return "Enterprise";
  if (hasMax === false && hasPro === false) return "Free";
  return extractPlan(profile);
}

function groupPrefixes(groupText) {
  const s = groupText.toLowerCase();
  if (s.includes("claude") || s.includes("gpt")) return ["claude", "gpt"];
  if (s.includes("gemini")) return ["gemini", "gemma"];
  return undefined;
}

function groupForModel(modelId, label) {
  const s = `${text(modelId)} ${text(label)}`.toLowerCase();
  if (s.includes("claude") || s.includes("gpt")) return GROUP_CLAUDE_GPT;
  if (s.includes("gemini") || s.includes("gemma")) return GROUP_GEMINI;
  return GROUP_OTHER;
}

function antigravitySummaryWindows(body) {
  return groupedQuotaWindows(body, "ag");
}

/**
 * groups[].buckets[] with remainingFraction / resetTime: the Antigravity
 * summary shape, which CPA also uses for its normalized plugin quota
 * (pluginapi.QuotaFetchResponse).
 */
function groupedQuotaWindows(body, idPrefix) {
  const groups = Array.isArray(body.groups) ? body.groups
    : Array.isArray(body.quota?.groups) ? body.quota.groups
      : Array.isArray(body.data?.groups) ? body.data.groups : [];
  const rows = [];
  groups.forEach((group, groupIndex) => {
    if (!isObj(group)) return;
    const groupLabel = firstText(group.displayName, group.display_name, group.name, `Quota Group ${groupIndex + 1}`);
    const groupId = text(group.id) || groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `group-${groupIndex + 1}`;
    const prefixes = groupPrefixes(`${groupLabel} ${text(group.description)}`);
    const buckets = Array.isArray(group.buckets) ? group.buckets : [];
    buckets.forEach((bucket, bucketIndex) => {
      if (!isObj(bucket)) return;
      const remaining = fractionPercent(bucket.remainingFraction ?? bucket.remaining_fraction);
      const resetAt = isoFromString(firstText(bucket.resetTime, bucket.reset_time));
      if (remaining === null && resetAt === null) return;
      const label = firstText(bucket.displayName, bucket.display_name, bucket.label, bucket.description, bucket.window);
      const kind = kindFromText(bucket.window, bucket.windowType, bucket.window_type, label)
        || kindFromSeconds(bucket.windowSeconds ?? bucket.window_seconds ?? bucket.limitWindowSeconds ?? bucket.limit_window_seconds)
        || "other";
      rows.push(makeWindow({
        id: `${idPrefix}:${groupId}:${firstText(bucket.bucketId, bucket.bucket_id, `${kind}-${bucketIndex + 1}`)}`,
        kind,
        label,
        group: groupLabel,
        remainingPercent: remaining,
        resetAt,
        modelPrefixes: prefixes,
      }));
    });
  });
  return rows;
}

function antigravityModelWindows(body, nowMs) {
  const models = body.models;
  if (models === null || typeof models !== "object") return [];
  const entries = Array.isArray(models) ? models.map((raw, i) => [String(i), raw]) : Object.entries(models);
  const rows = [];
  for (const [key, raw] of entries) {
    if (!isObj(raw)) continue;
    const modelId = firstText(raw.modelId, raw.model_id, raw.id, raw.model, Array.isArray(models) ? "" : key, raw.name);
    if (modelId === "") continue;
    const quota = isObj(raw.quotaInfo) ? raw.quotaInfo : isObj(raw.quota_info) ? raw.quota_info : raw;
    let remaining = fractionPercent(quota.remainingFraction ?? quota.remaining_fraction ?? quota.remaining);
    const amount = numberOrNull(quota.remainingAmount ?? quota.remaining_amount);
    const resetAt = isoFromString(firstText(quota.resetTime, quota.reset_time, raw.resetTime, raw.reset_time));
    if (remaining === null && amount !== null && amount <= 0) remaining = 0;
    if (remaining === null && resetAt === null) continue;
    const label = firstText(raw.displayName, raw.display_name, raw.name);
    rows.push(makeWindow({
      id: `ag-model:${modelId}`,
      kind: kindFromReset(resetAt, nowMs),
      label,
      group: groupForModel(modelId, label),
      remainingPercent: remaining,
      resetAt,
      modelIds: [modelId],
    }));
  }
  return rows;
}

/** Google per-model quota buckets; identical buckets are merged into one window with all their model ids. */
function googleBucketWindows(body, nowMs, idPrefix) {
  const buckets = Array.isArray(body.buckets) ? body.buckets : [];
  const merged = new Map();
  for (const bucket of buckets) {
    if (!isObj(bucket)) continue;
    const modelId = firstText(bucket.modelId, bucket.model_id).replace(/_vertex$/, "");
    if (!/^(?:gemini|gemma)/i.test(modelId)) continue;
    const remaining = fractionPercent(bucket.remainingFraction ?? bucket.remaining_fraction ?? bucket.remaining);
    const resetAt = isoFromString(firstText(bucket.resetTime, bucket.reset_time));
    if (remaining === null && resetAt === null) continue;
    const label = firstText(bucket.displayName, bucket.display_name, bucket.label);
    const kind = kindFromText(bucket.window, bucket.windowType, label) || kindFromReset(resetAt, nowMs);
    const pct = roundPct(remaining);
    const key = `${kind}|${pct}|${resetAt ?? ""}|${label}`;
    const prev = merged.get(key);
    if (prev !== undefined) {
      if (!prev.modelIds.includes(modelId)) prev.modelIds.push(modelId);
      continue;
    }
    merged.set(key, { kind, pct, resetAt, label, modelIds: [modelId] });
  }
  return [...merged.values()].map((w, i) => makeWindow({
    id: `${idPrefix}:${w.kind}:${i + 1}`,
    kind: w.kind,
    label: w.label,
    group: GROUP_GEMINI,
    remainingPercent: w.pct,
    resetAt: w.resetAt,
    modelIds: w.modelIds,
  }));
}

/** Hints in the auth-file listing that the credential is a kimi.ai account. */
function kimiPrefersAi(entry) {
  const hint = (v) => {
    const s = text(v).toLowerCase();
    if (s === "") return null;
    if (["ai", "kimi-ai", "kimi_ai", "kimi.ai"].includes(s) || /(?:^|[./])kimi\.ai(?:[/:]|$)/.test(s)) return true;
    if (["com", "kimi", "kimi.com"].includes(s) || /(?:^|[./])kimi\.com(?:[/:]|$)/.test(s)) return false;
    return null;
  };
  for (const v of [
    entry.domain, getPath(entry, ["metadata", "domain"]), getPath(entry, ["attributes", "domain"]),
    entry.base_url, getPath(entry, ["metadata", "base_url"]), getPath(entry, ["attributes", "base_url"]),
    entry.provider, entry.type,
  ]) {
    const h = hint(v);
    if (h !== null) return h;
  }
  return /kimi[-_.]ai/i.test(`${text(entry.id)} ${text(entry.name)}`);
}

function parseKimiWindows(body, nowMs) {
  const rows = [];
  const add = (data, index, duration, unit) => {
    if (!isObj(data)) return;
    const limit = numberOrNull(data.limit);
    const used = numberOrNull(data.used);
    const remainingAmount = numberOrNull(data.remaining);
    let remaining = null;
    if (limit !== null && limit > 0) {
      if (remainingAmount !== null) remaining = (remainingAmount / limit) * 100;
      else if (used !== null) remaining = 100 - (used / limit) * 100;
    }
    const resetAt = isoFromString(firstText(data.reset_at, data.resetAt, data.reset_time, data.resetTime))
      ?? isoFromRelative(data.reset_in ?? data.resetIn ?? data.ttl, nowMs);
    if (remaining === null && resetAt === null) return;
    const label = firstText(data.name, data.title, data.scope);
    const kind = kindFromText(label) || kindFromSeconds(durationSeconds(duration, unit)) || (index === "usage" ? "7d" : "other");
    rows.push(makeWindow({ id: `kimi:${index}`, kind, label, remainingPercent: remaining, resetAt }));
  };
  (Array.isArray(body.limits) ? body.limits : []).forEach((item, index) => {
    if (!isObj(item)) return;
    const detail = isObj(item.detail) ? item.detail : item;
    const window = isObj(item.window) ? item.window : {};
    add(detail, String(index), window.duration ?? item.duration ?? detail.duration, window.timeUnit ?? item.timeUnit ?? detail.timeUnit);
  });
  if (isObj(body.usage)) add(body.usage, "usage", null, null);
  return rows;
}

function parseXaiWindows(body, period) {
  const config = isObj(body.config) ? body.config : body;
  const rows = [];
  const current = isObj(config.currentPeriod) ? config.currentPeriod : isObj(config.current_period) ? config.current_period : {};
  const periodEnd = isoFromString(firstText(current.end, config.billingPeriodEnd, config.billing_period_end));
  const creditUsage = numberOrNull(config.creditUsagePercent ?? config.credit_usage_percent);
  if (creditUsage !== null && period !== "monthly") {
    rows.push(makeWindow({ id: "xai:weekly", kind: "7d", label: "credits", remainingPercent: 100 - clampPct(creditUsage), resetAt: periodEnd }));
  }
  const valueOf = (v) => (isObj(v) ? numberOrNull(v.val) : numberOrNull(v));
  const monthlyLimit = valueOf(config.monthlyLimit ?? config.monthly_limit);
  const used = valueOf(config.used);
  if (monthlyLimit !== null && monthlyLimit > 0 && used !== null) {
    rows.push(makeWindow({ id: "xai:monthly", kind: "30d", label: "monthly credits", remainingPercent: ((monthlyLimit - used) / monthlyLimit) * 100, resetAt: period === "monthly" ? periodEnd : null }));
  }
  const products = config.productUsage ?? config.product_usage;
  if (Array.isArray(products)) {
    products.forEach((item, index) => {
      if (!isObj(item)) return;
      const usage = numberOrNull(item.usagePercent ?? item.usage_percent);
      if (usage === null) return;
      rows.push(makeWindow({ id: `xai:product:${index}`, kind: "7d", label: firstText(item.product), group: firstText(item.product), remainingPercent: 100 - clampPct(usage), resetAt: periodEnd }));
    });
  }
  return rows;
}

/**
 * Devin GetUserStatus: one account-wide daily and weekly quota shared by
 * every Devin model (windows carry no model filter). Percentages are
 * remaining 0–100; resets are Unix seconds. Mirrors CPA's management center.
 */
function parseDevinStatus(body) {
  const status = isObj(body.userStatus) && isObj(body.userStatus.planStatus) ? body.userStatus.planStatus : {};
  const planInfo = isObj(status.planInfo) ? status.planInfo : isObj(body.planInfo) ? body.planInfo : {};
  const percent = (v) => {
    const n = numberOrNull(v);
    return n !== null && n >= 0 && n <= 100 ? n : null;
  };
  const windows = [];
  for (const [id, kind] of [["daily", "1d"], ["weekly", "7d"]]) {
    const remainingPercent = percent(status[`${id}QuotaRemainingPercent`]);
    const resetAt = isoFromUnix(status[`${id}QuotaResetAtUnix`]);
    if (remainingPercent === null && resetAt === null) continue;
    windows.push(makeWindow({ id: `devin:${id}`, kind, label: id, remainingPercent, resetAt }));
  }
  if (windows.length === 0) throw new QuotaError("invalid-response");
  const name = text(planInfo.planName);
  return { windows, plan: name === "" ? "" : PLAN_LABELS[name.toLowerCase()] ?? name };
}

/**
 * Meta Muse Code `subs_usage`: a rolling window (window_duration_mins) and a
 * weekly window, each with used_percent and resets_at (Unix seconds). Only
 * these fields are read: the endpoint can echo api_key and PII. A valid body
 * without subs_usage is a reachable account with no quota observed yet.
 */
function parseMetaUsage(body) {
  const usage = isObj(body.subs_usage) ? body.subs_usage : {};
  const windows = [];
  for (const [id, raw] of [["window", usage.window], ["weekly", usage.weekly]]) {
    if (!isObj(raw)) continue;
    const used = numberOrNull(raw.used_percent);
    const resetAt = isoFromUnix(raw.resets_at);
    if (used === null && resetAt === null) continue;
    const minutes = numberOrNull(raw.window_duration_mins);
    const kind = id === "weekly" ? "7d" : (minutes !== null && minutes > 0 ? kindFromSeconds(minutes * 60) : "") || "other";
    windows.push(makeWindow({ id: `meta:${id}`, kind, label: id, remainingPercent: used === null ? null : 100 - clampPct(used), resetAt }));
  }
  return { windows, plan: firstText(body.subs_tier_name, usage.tier) };
}

/** CPA's normalized plugin quota (`/v0/management/quota/fetch`). */
function parsePluginQuota(body) {
  const sub = isObj(body.subscription) ? body.subscription : {};
  return { windows: groupedQuotaWindows(body, "plugin"), plan: firstText(sub.tierName, sub.plan, sub.tierId) };
}

//#endregion

//#region Model Matching

function modelFamily(modelId) {
  const s = text(modelId).toLowerCase();
  if (s === "") return "";
  if (/grok|xai/.test(s)) return "xai";
  if (/kimi|moonshot/.test(s)) return "kimi";
  if (/qwen|qwq/.test(s)) return "qwen";
  if (/iflow/.test(s)) return "iflow";
  if (/glm|chatglm|zhipu/.test(s)) return "glm";
  if (/deepseek/.test(s)) return "deepseek";
  if (/gemini|gemma/.test(s)) return "gemini";
  if (/claude|sonnet|opus|haiku/.test(s)) return "claude";
  if (/gpt|openai|codex/.test(s) || /(?:^|[-_:/.])o[1-9](?:$|[-_:/.])/.test(s)) return "gpt";
  return "";
}

/** CPA `owned_by` → family (or a provider type for families without a model-name pattern). */
function ownedByFamily(ownedBy) {
  const o = text(ownedBy).toLowerCase();
  if (o === "") return "";
  if (/anthropic|claude/.test(o)) return "claude";
  if (/openai|codex/.test(o)) return "gpt";
  if (/google|gemini|antigravity/.test(o)) return "gemini";
  if (/xai|grok/.test(o)) return "xai";
  if (/moonshot|kimi/.test(o)) return "kimi";
  return `provider:${normalizeProvider(o)}`;
}

function windowsMention(credential, word) {
  const rows = Array.isArray(credential.windows) ? credential.windows : [];
  return rows.some((w) =>
    (Array.isArray(w.modelPrefixes) && w.modelPrefixes.some((p) => text(p).toLowerCase().startsWith(word)))
    || (Array.isArray(w.modelIds) && w.modelIds.some((id) => text(id).toLowerCase().includes(word)))
    || text(w.group).toLowerCase().includes(word));
}

function servesFamily(credential, family) {
  if (family === "") return false;
  const provider = text(credential.provider).toLowerCase();
  if (family.startsWith("provider:")) return provider === family.slice("provider:".length);
  switch (provider) {
    case "claude": return family === "claude";
    case "codex":
    case "openai": return family === "gpt";
    case "gemini":
    case "gemini-cli":
    case "gemini-api":
    case "aistudio": return family === "gemini";
    case "vertex": return family === "gemini" || family === "claude";
    // Antigravity serves Gemini, and Claude/GPT only when its quota groups say so.
    case "antigravity": return family === "gemini" || ((family === "claude" || family === "gpt") && windowsMention(credential, family));
    case "kimi":
    case "xai":
    case "qwen":
    case "iflow":
    case "glm":
    case "deepseek": return family === provider;
    default: return false;
  }
}

const listHas = (credential, idLower) => Array.isArray(credential.models) && credential.models.some((m) => text(m).toLowerCase() === idLower);

function finishMatch(list, matchedBy) {
  const seen = new Set();
  const unique = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  const rank = (c) => (c.status === "active" ? 0 : 1);
  const credentialIds = unique
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map(({ c }) => c.id);
  return { credentialIds, matchedBy: credentialIds.length === 0 ? "none" : matchedBy };
}

/** Credentials of one snapshot account entry that serve `modelId`. */
export function matchCredentials(accountEntry, modelId) {
  const credentials = (Array.isArray(accountEntry?.credentials) ? accountEntry.credentials : [])
    .filter((c) => isObj(c) && typeof c.id === "string" && c.id !== "");
  const id = text(modelId).toLowerCase();
  if (id === "" || credentials.length === 0) return { credentialIds: [], matchedBy: "none" };

  // Rule 1: "p/rest" routes only to credentials with prefix p.
  const slash = id.indexOf("/");
  if (slash > 0) {
    const prefix = id.slice(0, slash);
    const prefixed = credentials.filter((c) => prefixOf(c) === prefix);
    if (prefixed.length > 0) {
      const confirmed = prefixed.filter((c) => listHas(c, id));
      const unknown = prefixed.filter((c) => !Array.isArray(c.models));
      if (confirmed.length > 0) return finishMatch([...confirmed, ...unknown], "model-list");
      return finishMatch(unknown.length > 0 ? unknown : prefixed, "prefix");
    }
  }

  // Rule 2: exact model-list hits, un-prefixed credentials first.
  const unprefixed = credentials.filter((c) => prefixOf(c) === "");
  const prefixed = credentials.filter((c) => prefixOf(c) !== "");
  const plainHits = unprefixed.filter((c) => listHas(c, id));
  const prefixedHits = plainHits.length > 0 ? [] : prefixed.filter((c) => listHas(c, `${prefixOf(c)}/${id}`) || listHas(c, id));

  // Rule 3: family heuristics for un-prefixed credentials whose model list is unknown.
  let family = modelFamily(id);
  if (family === "") {
    const picker = Array.isArray(accountEntry?.pickerModels) ? accountEntry.pickerModels : [];
    const hint = picker.find((m) => isObj(m) && text(m.id).toLowerCase() === id && text(m.ownedBy) !== "");
    if (hint !== undefined) family = ownedByFamily(hint.ownedBy);
  }
  const familyHits = family === "" ? [] : unprefixed.filter((c) => !Array.isArray(c.models) && servesFamily(c, family));

  const listHits = [...plainHits, ...prefixedHits];
  if (listHits.length > 0) return finishMatch([...listHits, ...familyHits], "model-list");
  if (familyHits.length > 0) return finishMatch(familyHits, "family");
  return { credentialIds: [], matchedBy: "none" };
}

function buildModelIndex(entry) {
  const ids = new Set();
  for (const c of entry.credentials) {
    if (!Array.isArray(c.models)) continue;
    const prefix = prefixOf(c);
    for (const m of c.models) {
      ids.add(m);
      if (prefix !== "" && m.toLowerCase().startsWith(`${prefix}/`)) ids.add(m.slice(prefix.length + 1));
    }
  }
  for (const m of entry.pickerModels ?? []) if (text(m?.id) !== "") ids.add(text(m.id));
  const modelIndex = {};
  const modelMatch = {};
  for (const id of ids) {
    const match = matchCredentials(entry, id);
    modelIndex[id] = match.credentialIds;
    modelMatch[id] = match.matchedBy;
  }
  return { modelIndex, modelMatch };
}

//#endregion

//#region HTTP

async function readBounded(response, limit) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new QuotaError("invalid-response");
  const body = response.body;
  if (body !== null && body !== undefined && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        reader.cancel().catch(() => {});
        throw new QuotaError("invalid-response");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(all);
  }
  const raw = typeof response.text === "function" ? await response.text() : "";
  if (Buffer.byteLength(raw, "utf8") > limit) throw new QuotaError("invalid-response");
  return raw;
}

function parseJsonLoose(raw) {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Unwraps the occasional `{body|data|result}` wrapper or JSON-string nesting around an upstream payload. */
function unwrapNested(value) {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "string") {
      const parsed = parseJsonLoose(current);
      if (parsed === undefined || parsed === null) return current;
      current = parsed;
    }
    if (!isObj(current)) return current;
    if (["groups", "models", "currentTier", "paidTier", "cloudaicompanionProject", "config", "limits", "usage", "rate_limit", "rateLimit", "five_hour", "seven_day", "buckets", "account", "organization", "plan_type"].some((k) => Object.hasOwn(current, k))) return current;
    const nested = current.body ?? current.data ?? current.result;
    if (nested === undefined || nested === null || nested === current) return current;
    current = nested;
  }
  return current;
}

function upstreamErrorCode(status) {
  if (status === 401) return "upstream-unauthorized";
  if (status === 403) return "upstream-forbidden";
  if (status === 404) return "upstream-not-found";
  if (status === 429) return "upstream-rate-limited";
  return "upstream-http";
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < limit && queue.length > 0) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          next();
        });
    }
  };
  return (fn, signal) => new Promise((resolve, reject) => {
    const job = {
      fn: () => {
        if (signal?.aborted) throw new QuotaError("aborted");
        return fn();
      },
      resolve,
      reject,
    };
    queue.push(job);
    next();
  });
}

//#endregion

//#region Quota Controller

/**
 * Owns the quota state of every plugin account: key lookups, management API
 * reads, upstream quota probes, TTL/lockout policy and the public snapshot.
 */
export function createQuotaController(deps) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const ttlMs = Number.isFinite(deps.ttlMs) && deps.ttlMs >= 0 ? deps.ttlMs : QUOTA_TTL_MS;
  const timeoutMs = Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0 ? deps.timeoutMs : DEFAULT_QUOTA_TIMEOUT_MS;
  const concurrency = Number.isInteger(deps.concurrency) && deps.concurrency > 0 ? deps.concurrency : DEFAULT_QUOTA_CONCURRENCY;
  const logger = deps.logger;
  const root = new AbortController();
  const pool = createLimiter(concurrency);
  const states = new Map();
  /** management origin → Antigravity endpoint that last returned usable rows. */
  const agPreferred = new Map();
  let disposed = false;

  const stateFor = (id) => {
    let st = states.get(id);
    if (st === undefined) {
      st = { gen: 0, inflight: null, result: null, data: null, lockedOut: false, lastAttemptAt: undefined };
      states.set(id, st);
    }
    return st;
  };

  const log = (level, message) => {
    try {
      logger?.[level]?.(message);
    } catch {
      /* logging must never break a refresh */
    }
  };

  const listAccounts = () => {
    try {
      const list = deps.listAccounts();
      return Array.isArray(list) ? list.filter((a) => isObj(a) && text(a.id) !== "") : [];
    } catch {
      return [];
    }
  };

  const findAccount = (accountId) => {
    const account = listAccounts().find((a) => a.id === accountId);
    if (account === undefined) throw new Error(`dsh-cliproxyapi: unknown account ${JSON.stringify(String(accountId))}`);
    return account;
  };

  const keyConfigured = async (ref) => {
    try {
      return (await deps.describeKey(ref))?.configured === true;
    } catch {
      return false;
    }
  };

  // --- HTTP with per-request timeout, linked to the cycle signal ---
  async function request(url, init, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
    // Settles even if the fetch implementation ignores the signal.
    const aborted = new Promise((_, reject) => {
      const fail = () => reject(new QuotaError(timedOut ? "timeout" : "aborted"));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener("abort", fail, { once: true });
    });
    aborted.catch(() => {});
    try {
      const response = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" }), aborted]);
      const body = await Promise.race([readBounded(response, MAX_QUOTA_RESPONSE_BYTES), aborted]);
      return { status: response.status, ok: response.ok, body };
    } catch (error) {
      if (timedOut) throw new QuotaError("timeout");
      if (signal.aborted) throw new QuotaError("aborted");
      if (error instanceof QuotaError) throw error;
      throw new QuotaError("network");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  async function management(ctx, path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json", Authorization: `Bearer ${ctx.key}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await request(`${ctx.origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, ctx.signal);
    if (response.status === 401) throw new QuotaError("unauthorized", 401);
    if (response.status === 403) throw new QuotaError("forbidden", 403);
    if (!response.ok) throw new QuotaError("http", response.status);
    const json = parseJsonLoose(response.body);
    if (json === undefined) throw new QuotaError("invalid-response");
    return json;
  }

  /** POST /v0/management/api-call; returns the upstream JSON object or throws an upstream code. */
  async function apiCall(ctx, payload) {
    const response = await management(ctx, "/v0/management/api-call", { method: "POST", body: payload });
    if (!isObj(response)) throw new QuotaError("invalid-response");
    const status = numberOrNull(response.status_code ?? response.statusCode ?? response.status);
    if (status === null) throw new QuotaError("invalid-response");
    if (status < 200 || status >= 300) throw new QuotaError(upstreamErrorCode(status), status);
    const body = unwrapNested(response.body ?? response.data);
    if (!isObj(body)) throw new QuotaError("invalid-response");
    return body;
  }

  async function loadModels(ctx, name, prefix, status) {
    try {
      const payload = await management(ctx, `/v0/management/auth-files/models?name=${encodeURIComponent(name)}`);
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.models) ? payload.models : null;
      if (rows === null) return null;
      const ids = [];
      for (const row of rows) {
        const id = typeof row === "string" ? text(row) : firstText(row?.id, row?.name);
        if (id === "") continue;
        const full = prefix !== "" && !id.toLowerCase().startsWith(`${prefix}/`) ? `${prefix}/${id}` : id;
        if (!ids.includes(full)) ids.push(full);
      }
      // CPA drops inactive credentials from its model registry; an empty list then means "unknown".
      if (ids.length === 0 && status !== "active") return null;
      return ids;
    } catch (error) {
      if (error?.code === "aborted") throw error;
      return null;
    }
  }

  async function loadCodeAssist(ctx, authIndex, metadata) {
    const headers = metadata.ideType === "ANTIGRAVITY"
      ? { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": AG_SUMMARY_UA }
      : googleHeaders(metadata);
    const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url: UPSTREAM.googleLoad, header: headers, data: JSON.stringify({ metadata }) });
    const project = body.cloudaicompanionProject ?? body.cloudaicompanion_project;
    return { body, projectID: isObj(project) ? firstText(project.id) : firstText(project) };
  }

  function googleHeaders(metadata) {
    return {
      Authorization: "Bearer $TOKEN$",
      "Content-Type": "application/json",
      "User-Agent": "google-api-nodejs-client/9.15.1",
      "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
      "Client-Metadata": JSON.stringify(metadata),
    };
  }

  // --- Provider quota probes: each returns { windows, plan? } or throws QuotaError ---
  const PROBES = {
    async codex(ctx, entry, authIndex) {
      const header = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": CODEX_UA };
      const accountId = codexAccountId(entry);
      if (accountId !== "") header["Chatgpt-Account-Id"] = accountId;
      const body = await apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.codexUsage, header });
      return { windows: parseCodexWindows(body, now()), plan: extractPlan(body) };
    },

    async claude(ctx, entry, authIndex) {
      const header = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "anthropic-beta": "oauth-2025-04-20" };
      const [usage, profile] = await Promise.allSettled([
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.claudeUsage, header }),
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.claudeProfile, header }),
      ]);
      if (usage.status === "rejected") throw usage.reason;
      return { windows: parseClaudeWindows(usage.value), plan: profile.status === "fulfilled" ? claudeProfilePlan(profile.value) : "" };
    },

    async antigravity(ctx, entry, authIndex, currentPlan) {
      let projectID = projectIdOf(entry);
      let plan = "";
      let tier = null;
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, AG_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      } else if (currentPlan === "") {
        tier = loadCodeAssist(ctx, authIndex, AG_META).then((l) => extractPlan(l.body), () => "");
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const header = (url) => ({
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "User-Agent": url.includes("retrieveUserQuotaSummary") ? AG_SUMMARY_UA : AG_MODELS_UA,
      });
      const urls = [...UPSTREAM.antigravityQuota, ...UPSTREAM.antigravityModels];
      const preferred = agPreferred.get(ctx.origin);
      const ordered = preferred === undefined ? urls : [preferred, ...urls.filter((u) => u !== preferred)];
      let lastError = null;
      let partial = null;
      let windows = null;
      for (const url of ordered) {
        const summary = url.includes("retrieveUserQuotaSummary");
        if (partial !== null && !summary) continue;
        try {
          const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url, header: header(url), data: JSON.stringify({ project: projectID }) });
          plan = plan || extractPlan(body);
          const rows = summary ? antigravitySummaryWindows(body) : [];
          if (rows.length > 0) {
            if (rows.some((r) => r.modelPrefixes?.includes("gemini"))) {
              windows = rows;
              agPreferred.set(ctx.origin, url);
              break;
            }
            // A host without the Gemini group: keep looking at the other summary hosts.
            if (partial === null) partial = { rows, url };
            continue;
          }
          const modelRows = antigravityModelWindows(body, now());
          if (modelRows.length > 0) {
            windows = modelRows;
            agPreferred.set(ctx.origin, url);
            break;
          }
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
        }
      }
      if (windows === null && partial !== null) {
        windows = partial.rows;
        agPreferred.set(ctx.origin, partial.url);
        try {
          const body = await apiCall(ctx, {
            auth_index: authIndex,
            method: "POST",
            url: UPSTREAM.googleQuota,
            header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": AG_SUMMARY_UA },
            data: JSON.stringify({ project: projectID }),
          });
          windows = [...windows, ...googleBucketWindows(body, now(), "ag-gemini")];
        } catch (error) {
          if (error?.code === "aborted") throw error;
          /* the supplementary Gemini read is best-effort */
        }
      }
      if (tier !== null) plan = plan || (await tier);
      if (windows === null) throw lastError ?? new QuotaError("invalid-response");
      return { windows, plan };
    },

    async "gemini-cli"(ctx, entry, authIndex) {
      let projectID = projectIdOf(entry);
      let plan = "";
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, GEMINI_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.googleQuota,
        header: googleHeaders({ ...GEMINI_META, duetProject: projectID }),
        data: JSON.stringify({ project: projectID }),
      });
      return { windows: googleBucketWindows(body, now(), "gemini"), plan };
    },

    async kimi(ctx, entry, authIndex) {
      // kimi.com and Kimi International (kimi.ai) share the API on two hosts.
      // Prefer the host the credential hints at; on a rejected token try the
      // other one (both are Moonshot's own endpoints, never arbitrary hosts).
      const hosts = kimiPrefersAi(entry) ? [UPSTREAM.kimiAiUsage, UPSTREAM.kimiUsage] : [UPSTREAM.kimiUsage, UPSTREAM.kimiAiUsage];
      let lastError = null;
      for (const url of hosts) {
        try {
          const body = await apiCall(ctx, { auth_index: authIndex, method: "GET", url, header: { Authorization: "Bearer $TOKEN$" } });
          return { windows: parseKimiWindows(body, now()), plan: extractPlan(body) };
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
          if (error?.code !== "upstream-unauthorized" && error?.code !== "upstream-forbidden") break;
        }
      }
      throw lastError;
    },

    async meta(ctx, entry, authIndex) {
      // Meta's usage endpoint takes the credential's dca_token, not the LLM key
      // CPA would substitute for $TOKEN$. Read only that field from the auth
      // file for this one request; it is never stored, logged or returned.
      const name = firstText(entry.name, entry.id);
      if (name === "" || flagOf(entry.runtime_only ?? entry.runtimeOnly) === true) throw new QuotaError("missing-token");
      const file = await management(ctx, `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`);
      const token = isObj(file) ? text(file.dca_token) : "";
      if (!/^dca:\S+$/.test(token)) throw new QuotaError("missing-token");
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.metaUsage,
        header: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-api-version": "1.0.0" },
        data: "{}",
      });
      return parseMetaUsage(body);
    },

    async xai(ctx, entry, authIndex) {
      const header = {
        Authorization: "Bearer $TOKEN$",
        "x-xai-token-auth": "xai-grok-cli",
        "x-grok-client-version": "0.2.91",
        accept: "*/*",
        "user-agent": "grok-pager/0.2.91 grok-shell/0.2.91 (windows; amd64)",
      };
      const userId = firstText(entry.sub, entry.subject, entry.user_id, entry.userId, getPath(entry, ["metadata", "sub"]), getPath(entry, ["metadata", "user_id"]), getPath(entry, ["attributes", "sub"]));
      if (userId !== "") header["x-userid"] = userId;
      const results = await Promise.allSettled([
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.xaiBillingWeekly, header }),
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.xaiBillingMonthly, header }),
      ]);
      if (results.every((r) => r.status === "rejected")) throw results[0].reason;
      const rows = new Map();
      if (results[0].status === "fulfilled") for (const row of parseXaiWindows(results[0].value, "weekly")) rows.set(row.id, row);
      if (results[1].status === "fulfilled") for (const row of parseXaiWindows(results[1].value, "monthly")) rows.set(row.id, row);
      // Paid accounts expose no billing counters: reachable but window-less.
      return { windows: [...rows.values()], plan: rows.size === 0 ? "Paid" : "" };
    },

    async devin(ctx, entry, authIndex) {
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.devinStatus,
        header: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
        data: JSON.stringify({ metadata: DEVIN_METADATA }),
      });
      return parseDevinStatus(body);
    },
  };
  PROBES.gemini = PROBES["gemini-cli"];

  /** CPA plugin / declarative quota: POST /v0/management/quota/fetch. */
  async function pluginProbe(ctx, entry, authIndex) {
    const provider = text(firstText(entry.quota_provider, entry.quotaProvider, entry.provider, entry.type));
    const body = await management(ctx, "/v0/management/quota/fetch", {
      method: "POST",
      body: { auth_index: authIndex, ...(provider === "" ? {} : { provider }) },
    });
    if (!isObj(body)) throw new QuotaError("invalid-response");
    return parsePluginQuota(body);
  }

  async function loadCredential(ctx, entry, previous) {
    const id = firstText(entry.name, entry.id);
    const provider = normalizeProvider(firstText(entry.provider, entry.type)) || "unknown";
    const prefix = text(firstText(entry.prefix, getPath(entry, ["attributes", "prefix"]), getPath(entry, ["metadata", "prefix"]))).replace(/^\/+|\/+$/g, "").toLowerCase();
    const status = credentialStatus(entry);
    const credential = {
      id,
      label: firstText(entry.label, entry.email, entry.account_email, typeof entry.account === "string" ? entry.account : ""),
      provider,
    };
    const plan = extractPlan(entry) || extractPlan(...entryClaims(entry)) || previous?.plan || "";
    credential.status = status;
    const statusMessage = shortMessage(firstText(entry.status_message, entry.statusMessage));
    if (statusMessage !== "") credential.statusMessage = statusMessage;
    if (prefix !== "") credential.prefix = prefix;
    const recent = parseRecent(entry);

    const authIndex = firstText(entry.auth_index, entry.authIndex);
    // Built-in probes win; any other credential CPA marks `supports_quota`
    // (a CPA quota plugin or a declarative quota_probe) goes through CPA's
    // own normalized route.
    const probe = PROBES[provider] ?? (flagOf(entry.supports_quota ?? entry.supportsQuota) === true ? pluginProbe : undefined);
    const [models, quota] = await Promise.all([
      loadModels(ctx, id, prefix, status),
      (async () => {
        if (probe === undefined) return { quotaState: "unsupported", windows: [] };
        if (authIndex === "") return { quotaState: "error", quotaErrorCode: "missing-auth-index", windows: [] };
        try {
          const result = await probe(ctx, entry, authIndex, plan);
          return { quotaState: "ok", windows: sortWindows(result.windows), plan: result.plan };
        } catch (error) {
          if (error?.code === "aborted") throw error;
          return { quotaState: "error", quotaErrorCode: error instanceof QuotaError ? error.code : "invalid-response", windows: [] };
        }
      })(),
    ]);
    const finalPlan = quota.plan || plan;
    return {
      ...credential,
      ...(finalPlan === "" ? {} : { plan: finalPlan }),
      models,
      quotaState: quota.quotaState,
      ...(quota.quotaErrorCode === undefined ? {} : { quotaErrorCode: quota.quotaErrorCode }),
      windows: quota.windows,
      ...(recent === undefined ? {} : { recent }),
    };
  }

  async function runCycle(account, signal) {
    let key;
    try {
      key = await deps.resolveKey(managementKeyRef(account.id));
    } catch {
      key = undefined;
    }
    if (typeof key !== "string" || key.trim() === "") return { kind: "nokey" };
    const origin = managementOrigin(account.endpoint) ?? managementOrigin(account.baseURL);
    if (origin === undefined) throw new QuotaError("no-endpoint");
    const ctx = { origin, key: key.trim(), signal };
    const files = await management(ctx, "/v0/management/auth-files");
    const entries = Array.isArray(files) ? files : Array.isArray(files?.files) ? files.files : null;
    if (entries === null) throw new QuotaError("invalid-response");
    const previous = new Map((stateFor(account.id).data?.credentials ?? []).map((c) => [c.id, c]));
    const seen = new Set();
    const unique = entries.filter((e) => {
      if (!isObj(e)) return false;
      const name = firstText(e.name, e.id);
      if (name === "" || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    const credentials = await Promise.all(unique.map((entry) => pool(() => loadCredential(ctx, entry, previous.get(firstText(entry.name, entry.id))), signal)));
    return { kind: "ok", credentials };
  }

  function startRefresh(account) {
    const st = stateFor(account.id);
    if (st.inflight !== null) return st.inflight.promise;
    const controller = new AbortController();
    const onRootAbort = () => controller.abort();
    root.signal.addEventListener("abort", onRootAbort, { once: true });
    const gen = ++st.gen;
    const current = () => !disposed && st.gen === gen;
    const promise = (async () => {
      try {
        const result = await runCycle(account, controller.signal);
        if (!current()) return;
        if (result.kind === "nokey") {
          st.result = { state: "nokey" };
        } else {
          const fetchedAt = new Date(now()).toISOString();
          st.data = { credentials: result.credentials, fetchedAt };
          st.result = { state: "ok" };
          st.lockedOut = false;
        }
      } catch (error) {
        if (!current()) return;
        const code = error instanceof QuotaError && error.code !== "aborted" ? error.code : error?.code === "aborted" ? null : "network";
        if (code === null) return;
        st.result = { state: "error", errorCode: code, ...(error?.status === undefined ? {} : { errorStatus: error.status }) };
        if (code === "unauthorized" || code === "forbidden") st.lockedOut = true;
        log("warn", `dsh-cliproxyapi: quota refresh failed for account ${account.id}: ${code}${error?.status === undefined ? "" : ` (${error.status})`}`);
      } finally {
        root.signal.removeEventListener("abort", onRootAbort);
        if (st.gen === gen) {
          st.inflight = null;
          if (!disposed) st.lastAttemptAt = now();
        }
      }
    })();
    st.inflight = { gen, controller, promise };
    return promise;
  }

  function cancelInflight(st) {
    if (st.inflight === null) return;
    st.inflight.controller.abort();
    st.inflight = null;
    st.gen += 1;
  }

  async function buildSnapshot(prepared) {
    const accounts = prepared ?? (await prepare());
    const out = [];
    for (const { account, keyRef, keyConfigured: configured } of accounts) {
      const st = stateFor(account.id);
      const refreshing = st.inflight !== null;
      let state;
      if (!configured) state = "nokey";
      else if (st.result === null || (st.result.state === "nokey")) state = refreshing ? "loading" : "idle";
      else state = st.result.state;
      const pickerModels = (Array.isArray(account.pickerModels) ? account.pickerModels : [])
        .filter((m) => isObj(m) && text(m.id) !== "")
        .map((m) => ({ id: text(m.id), route: text(m.route), ...(text(m.ownedBy) === "" ? {} : { ownedBy: text(m.ownedBy) }) }));
      const entry = {
        accountId: account.id,
        displayName: text(account.displayName) || account.id,
        provider: text(account.provider),
        routes: Array.isArray(account.routes) ? account.routes.filter((r) => typeof r === "string") : [],
        enabled: account.enabled === true,
        keyRef,
        keyConfigured: configured,
        state,
        ...(state === "error" ? { errorCode: st.result.errorCode, ...(st.result.errorStatus === undefined ? {} : { errorStatus: st.result.errorStatus }) } : {}),
        ...(configured && st.data !== null ? { fetchedAt: st.data.fetchedAt } : {}),
        refreshing,
        credentials: configured && st.data !== null ? structuredClone(st.data.credentials) : [],
        pickerModels,
      };
      Object.assign(entry, buildModelIndex(entry));
      out.push(entry);
    }
    return {
      generatedAt: new Date(now()).toISOString(),
      refreshing: out.some((a) => a.refreshing),
      accounts: out,
    };
  }

  async function prepare() {
    const accounts = listAccounts();
    const known = new Set(accounts.map((a) => a.id));
    for (const [id, st] of states) {
      if (!known.has(id)) {
        cancelInflight(st);
        states.delete(id);
      }
    }
    return Promise.all(accounts.map(async (account) => {
      const keyRef = managementKeyRef(account.id);
      return { account, keyRef, keyConfigured: await keyConfigured(keyRef) };
    }));
  }

  return {
    async snapshot() {
      const prepared = await prepare();
      if (!disposed) {
        const at = now();
        for (const { account, keyConfigured: configured } of prepared) {
          if (account.enabled !== true || !configured) continue;
          const st = stateFor(account.id);
          if (st.inflight !== null || st.lockedOut) continue;
          if (st.lastAttemptAt !== undefined && at - st.lastAttemptAt < ttlMs) continue;
          startRefresh(account);
        }
      }
      return buildSnapshot(prepared);
    },

    /** `options.wait === false` starts the refresh and returns at once (snapshot shows `refreshing`). */
    async refresh(accountId, options = {}) {
      const wait = options?.wait !== false;
      if (accountId !== undefined && accountId !== null && accountId !== "") {
        const account = findAccount(accountId);
        if (!disposed) {
          const st = stateFor(account.id);
          st.lockedOut = false;
          if (await keyConfigured(managementKeyRef(account.id))) {
            const running = startRefresh(account);
            if (wait) await running;
          }
        }
        return buildSnapshot();
      }
      const prepared = await prepare();
      if (!disposed) {
        // Refresh-all never retries a locked-out account; only refresh(id) or saveKey clears a lockout.
        await Promise.all(prepared
          .filter(({ account, keyConfigured: configured }) => account.enabled === true && configured && !stateFor(account.id).lockedOut)
          .map(({ account }) => (wait ? startRefresh(account) : (startRefresh(account), undefined))));
      }
      return buildSnapshot(prepared);
    },

    async saveKey(accountId, input = {}, options = {}) {
      const wait = options?.wait !== false;
      const account = findAccount(accountId);
      const ref = managementKeyRef(account.id);
      const st = stateFor(account.id);
      if (input?.clear === true) {
        cancelInflight(st);
        await deps.unsetKey(ref);
        st.data = null;
        st.result = null;
        st.lockedOut = false;
        st.lastAttemptAt = undefined;
        return buildSnapshot();
      }
      const value = typeof input?.managementKey === "string" ? input.managementKey.trim() : "";
      if (value !== "") {
        if (/\s/.test(value)) throw new Error("dsh-cliproxyapi: management key must not contain whitespace");
        cancelInflight(st);
        await deps.setKey(ref, value);
        st.result = null;
        st.lockedOut = false;
      }
      if (!disposed && (await keyConfigured(ref))) {
        st.lockedOut = false;
        const running = startRefresh(account);
        if (wait) await running;
      }
      return buildSnapshot();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      root.abort();
      for (const st of states.values()) {
        st.inflight?.controller.abort();
        st.inflight = null;
      }
    },
  };
}

//#endregion
