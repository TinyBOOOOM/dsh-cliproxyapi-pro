// Converts provider quota payloads into safe windows and plan labels.
import { GROUP_CLAUDE_GPT, GROUP_GEMINI, GROUP_OTHER, PLAN_LABELS } from "./constants.js";
import { QuotaError, isObj, text, firstText, numberOrNull, flagOf, clampPct, roundPct, getPath, fractionPercent, kindFromText, kindFromSeconds, durationSeconds, kindFromReset, isoFromUnix, isoFromString, isoFromRelative, makeWindow, dedupeWindows, extractPlan } from "./helpers.js";

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

export { parseCodexWindows, parseClaudeWindows, claudeProfilePlan, antigravitySummaryWindows, antigravityModelWindows, googleBucketWindows, kimiPrefersAi, parseKimiWindows, parseXaiWindows, parseDevinStatus, parseMetaUsage, parsePluginQuota };
