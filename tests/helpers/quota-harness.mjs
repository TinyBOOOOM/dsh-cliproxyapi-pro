// Offline quota fixtures, injected controller dependencies, and upstream responses.
import { createQuotaController } from "../../lib/quota/index.js";

const FAKE_KEY = "mgmt-SECRET-key-123";
const UPSTREAM_TOKEN = "upstream-tok-XYZ-987";
const START = Date.parse("2026-10-21T06:00:00.000Z");

const json = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

const apiOk = (body) => json(200, { status_code: 200, header: {}, body: typeof body === "string" ? body : JSON.stringify(body) });

function harness(options = {}) {
  const keys = new Map(Object.entries(options.keys ?? { CLI_PROXY_MANAGEMENT_KEY: FAKE_KEY }));
  const accounts = options.accounts ?? [{
    id: "default",
    displayName: "CPA",
    provider: "cli-proxy",
    enabled: true,
    baseURL: "http://127.0.0.1:8317/v1/",
    endpoint: "http://127.0.0.1:8317/v1",
    routes: ["cli-proxy", "cli-proxy-responses", "cli-proxy-messages"],
    pickerModels: options.pickerModels ?? [],
  }];
  const calls = [];
  const logs = [];
  const clock = { now: START };
  let handler = options.handler ?? (() => json(404, {}));
  const fetch = async (url, init = {}) => {
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body, signal: init.signal });
    return handler(url, body, init);
  };
  const controller = createQuotaController({
    listAccounts: () => accounts,
    resolveKey: async (ref) => keys.get(ref),
    describeKey: async (ref) => ({ configured: keys.has(ref) }),
    setKey: async (ref, value) => { keys.set(ref, value); },
    unsetKey: async (ref) => { keys.delete(ref); },
    fetch,
    now: () => clock.now,
    logger: { warn: (m) => logs.push(m), info: (m) => logs.push(m), debug: (m) => logs.push(m) },
    timeoutMs: options.timeoutMs ?? 2000,
    concurrency: options.concurrency,
  });
  return {
    controller,
    calls,
    logs,
    clock,
    keys,
    accounts,
    setHandler: (fn) => { handler = fn; },
  };
}

const AUTH_FILES = {
  files: [
    { name: "claude.json", type: "claude", email: "c@example.com", auth_index: "1", status: "active", access_token: UPSTREAM_TOKEN },
    {
      name: "codex.json",
      type: "codex",
      email: "x@example.com",
      auth_index: "2",
      id_token: { chatgpt_account_id: "acct-42", "https://api.openai.com/auth": { chatgpt_plan_type: "plus" } },
      refresh_token: UPSTREAM_TOKEN,
    },
    { name: "devin.json", type: "devin", label: "Devin team", prefix: "devin", auth_index: "3", recent_requests: [{ success: 3, failed: 1 }, { success: 2, failed: 0 }] },
    { name: "ag.json", type: "antigravity", email: "g@example.com", auth_index: "4", project_id: "proj-1" },
  ],
};

const MODELS = {
  "claude.json": [{ id: "claude-opus-5-5" }, { id: "claude-sonnet-5-5" }],
  "codex.json": [{ id: "gpt-6.1-sol" }],
  "devin.json": [{ id: "devin/claude-opus-5-5" }, { id: "devin/swe-2" }],
  "ag.json": [{ id: "gemini-4-pro" }],
};

function scenarioHandler(overrides = {}) {
  return (url, body) => {
    const u = new URL(url);
    if (u.pathname === "/v0/management/auth-files") return overrides.authFiles?.() ?? json(200, AUTH_FILES);
    if (u.pathname === "/v0/management/auth-files/models") {
      const name = u.searchParams.get("name");
      if (overrides.models !== undefined) return overrides.models(name);
      return json(200, { models: MODELS[name] ?? [] });
    }
    if (u.pathname === "/v0/management/api-call") {
      if (overrides.apiCall !== undefined) {
        const result = overrides.apiCall(body);
        if (result !== undefined) return result;
      }
      return upstream(body);
    }
    return json(404, {});
  };
}

function upstream(body) {
  if (body.url === "https://chatgpt.com/backend-api/wham/usage") {
    return apiOk({
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 30, limit_window_seconds: 18000, reset_after_seconds: 3600 },
        secondary_window: { used_percent: 60, limit_window_seconds: 604800, reset_at: 1_800_000_000 },
      },
    });
  }
  if (body.url === "https://api.anthropic.com/api/oauth/usage") {
    return json(200, {
      status_code: 200,
      body: {
        five_hour: { utilization: 25, resets_at: "2026-10-21T08:00:00Z" },
        seven_day: { utilization: 50, resets_at: "2026-10-25T00:00:00Z" },
        seven_day_opus: { utilization: 80, resets_at: "2026-10-25T00:00:00Z" },
        seven_day_sonnet: null,
      },
    });
  }
  if (body.url === "https://api.anthropic.com/api/oauth/profile") {
    return apiOk({ account: { has_claude_max: true, email: "c@example.com" }, session: UPSTREAM_TOKEN });
  }
  if (body.url.endsWith(":loadCodeAssist")) return apiOk({ paidTier: { id: "g1-ultra-tier" }, currentTier: { id: "free-tier" } });
  if (body.url === "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary") {
    return apiOk(JSON.stringify({
      groups: [
        { displayName: "Claude and GPT models", buckets: [{ displayName: "Weekly Limit", remainingFraction: 0.9, resetTime: "2026-10-27T00:00:00Z" }, { displayName: "Five Hour Limit", remainingFraction: 0.4, resetTime: "2026-10-21T09:00:00Z" }] },
        { displayName: "Gemini models", buckets: [{ displayName: "Five Hour Limit", remainingFraction: 1, resetTime: "2026-10-21T10:00:00Z" }] },
      ],
    }));
  }
  if (body.url === "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus") {
    // Connect RPC JSON as CPA's management center reads it (sanitized shape).
    return apiOk({
      userStatus: {
        teamsTier: "TEAMS_TIER_DEVIN_MAX",
        planStatus: {
          planInfo: { planName: "Max", teamsTier: "TEAMS_TIER_DEVIN_MAX", isDevin: true },
          dailyQuotaRemainingPercent: 100,
          weeklyQuotaRemainingPercent: 76,
          dailyQuotaResetAtUnix: "1792569600",
          weeklyQuotaResetAtUnix: "1792915200",
          planEnd: "2026-10-23T03:49:00Z",
        },
      },
    });
  }
  return json(200, { status_code: 404, body: "not found" });
}

const credentialById = (account, id) => account.credentials.find((c) => c.id === id);

export { FAKE_KEY, UPSTREAM_TOKEN, START, json, apiOk, harness, AUTH_FILES, MODELS, scenarioHandler, upstream, credentialById };
