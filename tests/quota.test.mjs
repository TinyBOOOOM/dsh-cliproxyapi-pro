import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  QUOTA_TTL_MS,
  createQuotaController,
  managementKeyRef,
  managementOrigin,
  matchCredentials,
} from "../lib/quota.js";

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

describe("quota helpers", () => {
  it("derives management key refs", () => {
    assert.equal(managementKeyRef("default"), "CLI_PROXY_MANAGEMENT_KEY");
    assert.equal(managementKeyRef("account-2"), "CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2");
    assert.equal(managementKeyRef("Team.cpa"), "CLI_PROXY_MANAGEMENT_KEY_TEAM_CPA");
  });

  it("derives the management origin", () => {
    assert.equal(managementOrigin("http://127.0.0.1:8317/v1"), "http://127.0.0.1:8317");
    assert.equal(managementOrigin("http://127.0.0.1:8317/v1/"), "http://127.0.0.1:8317");
    assert.equal(managementOrigin("https://cpa.example.com/"), "https://cpa.example.com");
    assert.equal(managementOrigin("https://example.com/cpa/V1"), "https://example.com/cpa");
    assert.equal(managementOrigin(""), undefined);
    assert.equal(managementOrigin(undefined), undefined);
    assert.equal(managementOrigin("ftp://example.com"), undefined);
    assert.equal(managementOrigin("not a url"), undefined);
    assert.equal(managementOrigin("http://user:pw@example.com/v1"), undefined);
  });
});

describe("quota controller", () => {
  it("reports nokey without any fetch", async () => {
    const h = harness({ keys: {} });
    const snap = await h.controller.snapshot();
    assert.equal(snap.accounts.length, 1);
    const account = snap.accounts[0];
    assert.equal(account.state, "nokey");
    assert.equal(account.keyConfigured, false);
    assert.equal(account.keyRef, "CLI_PROXY_MANAGEMENT_KEY");
    assert.deepEqual(account.credentials, []);
    await h.controller.refresh("default");
    await h.controller.refresh();
    assert.equal(h.calls.length, 0);
  });

  it("lists credentials, parses quota windows and maps models", async () => {
    const h = harness({
      handler: scenarioHandler(),
      pickerModels: [{ id: "claude-opus-5-5", route: "cli-proxy-messages", ownedBy: "anthropic" }, { id: "brand-new-x", route: "cli-proxy" }],
    });
    const snap = await h.controller.refresh("default");
    const account = snap.accounts[0];
    assert.equal(account.state, "ok");
    assert.equal(account.fetchedAt, new Date(START).toISOString());
    assert.deepEqual(account.routes, ["cli-proxy", "cli-proxy-responses", "cli-proxy-messages"]);
    assert.equal(account.credentials.length, 4);

    // Every management request carries the management key and hits the origin without /v1.
    for (const call of h.calls) {
      assert.ok(call.url.startsWith("http://127.0.0.1:8317/v0/management/"), call.url);
      assert.equal(call.headers.Authorization, `Bearer ${FAKE_KEY}`);
    }

    const codex = credentialById(account, "codex.json");
    assert.equal(codex.provider, "codex");
    assert.equal(codex.plan, "Plus");
    assert.equal(codex.quotaState, "ok");
    assert.deepEqual(codex.models, ["gpt-6.1-sol"]);
    assert.deepEqual(codex.windows, [
      { id: "codex:primary", kind: "5h", label: "", remainingPercent: 70, resetAt: new Date(START + 3600_000).toISOString() },
      { id: "codex:secondary", kind: "7d", label: "", remainingPercent: 40, resetAt: new Date(1_800_000_000_000).toISOString() },
    ]);
    const codexCall = h.calls.find((c) => c.body?.url === "https://chatgpt.com/backend-api/wham/usage");
    assert.equal(codexCall.body.auth_index, "2");
    assert.equal(codexCall.body.header.Authorization, "Bearer $TOKEN$");
    assert.equal(codexCall.body.header["Chatgpt-Account-Id"], "acct-42");

    const claude = credentialById(account, "claude.json");
    assert.equal(claude.label, "c@example.com");
    assert.equal(claude.plan, "Max");
    assert.equal(claude.status, "active");
    assert.deepEqual(claude.windows.map((w) => [w.kind, w.label, w.remainingPercent]), [
      ["5h", "five_hour", 75],
      ["7d", "seven_day", 50],
      ["7d", "seven_day_opus", 20],
    ]);
    assert.deepEqual(claude.windows[2].modelPrefixes, ["claude-opus"]);
    assert.equal(claude.windows[0].resetAt, "2026-10-21T08:00:00.000Z");

    const ag = credentialById(account, "ag.json");
    assert.equal(ag.quotaState, "ok");
    assert.equal(ag.plan, "Ultra");
    assert.deepEqual(ag.windows.map((w) => [w.kind, w.group, w.remainingPercent]), [
      ["5h", "Claude and GPT models", 40],
      ["5h", "Gemini models", 100],
      ["7d", "Claude and GPT models", 90],
    ]);
    assert.deepEqual(ag.windows[0].modelPrefixes, ["claude", "gpt"]);
    assert.deepEqual(ag.windows[1].modelPrefixes, ["gemini", "gemma"]);

    const devin = credentialById(account, "devin.json");
    // Devin: one account-wide daily + weekly quota shared by all Devin models.
    assert.equal(devin.quotaState, "ok");
    assert.equal(devin.plan, "Max");
    assert.equal(devin.prefix, "devin");
    assert.deepEqual(devin.windows, [
      { id: "devin:weekly", kind: "7d", label: "weekly", remainingPercent: 76, resetAt: new Date(1792915200_000).toISOString() },
      { id: "devin:daily", kind: "1d", label: "daily", remainingPercent: 100, resetAt: new Date(1792569600_000).toISOString() },
    ]);
    assert.ok(devin.windows.every((w) => w.modelIds === undefined && w.modelPrefixes === undefined), "applies to every Devin model");
    assert.deepEqual(devin.recent, { success: 5, failed: 1 });
    assert.deepEqual(devin.models, ["devin/claude-opus-5-5", "devin/swe-2"]);
    const devinCall = h.calls.find((c) => c.body?.auth_index === "3");
    assert.equal(devinCall.body.method, "POST");
    assert.equal(devinCall.body.url, "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus");
    assert.equal(devinCall.body.header["Connect-Protocol-Version"], "1");
    assert.equal(JSON.parse(devinCall.body.data).metadata.apiKey, "$TOKEN$", "CPA substitutes the session token");

    assert.deepEqual(matchCredentials(account, "claude-opus-5-5"), { credentialIds: ["claude.json"], matchedBy: "model-list" });
    assert.deepEqual(matchCredentials(account, "devin/claude-opus-5-5"), { credentialIds: ["devin.json"], matchedBy: "model-list" });
    assert.deepEqual(matchCredentials(account, "gpt-6.1-sol"), { credentialIds: ["codex.json"], matchedBy: "model-list" });
    assert.deepEqual(matchCredentials(account, "swe-2"), { credentialIds: ["devin.json"], matchedBy: "model-list" });
    assert.deepEqual(matchCredentials(account, "devin/unknown"), { credentialIds: ["devin.json"], matchedBy: "prefix" });
    assert.deepEqual(matchCredentials(account, "nothing-here"), { credentialIds: [], matchedBy: "none" });

    assert.deepEqual(account.modelIndex["claude-opus-5-5"], ["claude.json"]);
    assert.deepEqual(account.modelIndex["devin/claude-opus-5-5"], ["devin.json"]);
    assert.deepEqual(account.modelIndex["swe-2"], ["devin.json"]);
    assert.deepEqual(account.modelIndex["gemini-4-pro"], ["ag.json"]);
    assert.deepEqual(account.modelIndex["brand-new-x"], []);
    assert.equal(account.modelMatch["brand-new-x"], "none");
    assert.equal(account.modelMatch["gpt-6.1-sol"], "model-list");
    assert.deepEqual(account.pickerModels, [{ id: "claude-opus-5-5", route: "cli-proxy-messages", ownedBy: "anthropic" }, { id: "brand-new-x", route: "cli-proxy" }]);

    const serialized = JSON.stringify(snap);
    assert.equal(serialized.includes(FAKE_KEY), false);
    assert.equal(serialized.includes(UPSTREAM_TOKEN), false);
    assert.equal(serialized.includes("acct-42"), false);
    assert.equal(JSON.stringify(h.logs).includes(FAKE_KEY), false);
  });

  it("reports a Devin status without quota fields as an error, not as data", async () => {
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => (body.url.includes("GetUserStatus") ? apiOk({ userStatus: { planStatus: { planInfo: { planName: "Max" } } } }) : undefined),
      }),
    });
    const snap = await h.controller.refresh("default");
    const devin = credentialById(snap.accounts[0], "devin.json");
    assert.equal(devin.quotaState, "error");
    assert.equal(devin.quotaErrorCode, "invalid-response");
    assert.deepEqual(devin.windows, []);
  });

  it("prefers un-prefixed credentials and sorts disabled ones last", () => {
    const account = {
      credentials: [
        { id: "off.json", provider: "claude", status: "disabled", models: ["claude-opus-5-5"], windows: [] },
        { id: "on.json", provider: "claude", status: "active", models: ["claude-opus-5-5"], windows: [] },
        { id: "p.json", provider: "devin", prefix: "devin", status: "active", models: ["devin/claude-opus-5-5"], windows: [] },
      ],
    };
    assert.deepEqual(matchCredentials(account, "claude-opus-5-5"), { credentialIds: ["on.json", "off.json"], matchedBy: "model-list" });
    assert.deepEqual(matchCredentials({ credentials: [] }, "x"), { credentialIds: [], matchedBy: "none" });
  });

  it("uses family heuristics when model lists are unavailable", async () => {
    const h = harness({ handler: scenarioHandler({ models: () => json(500, { error: "boom" }) }) });
    const snap = await h.controller.refresh("default");
    const account = snap.accounts[0];
    assert.equal(account.state, "ok");
    for (const c of account.credentials) assert.equal(c.models, null);
    assert.deepEqual(matchCredentials(account, "claude-opus-5-5"), { credentialIds: ["claude.json", "ag.json"], matchedBy: "family" });
    assert.deepEqual(matchCredentials(account, "gpt-6.1-sol"), { credentialIds: ["codex.json", "ag.json"], matchedBy: "family" });
    assert.deepEqual(matchCredentials(account, "gemini-4-pro"), { credentialIds: ["ag.json"], matchedBy: "family" });
    // Prefixed credentials never serve bare ids by family; their prefix still routes.
    assert.deepEqual(matchCredentials(account, "devin/claude-opus-5-5"), { credentialIds: ["devin.json"], matchedBy: "prefix" });
  });

  it("uses ownedBy only as a family hint", () => {
    const account = {
      credentials: [
        { id: "devin.json", provider: "devin", status: "active", models: null, windows: [] },
        { id: "claude.json", provider: "claude", status: "active", models: ["claude-opus-5-5"], windows: [] },
      ],
      pickerModels: [{ id: "swe-2", route: "cli-proxy", ownedBy: "devin" }, { id: "claude-opus-5-5", route: "cli-proxy", ownedBy: "devin" }],
    };
    assert.deepEqual(matchCredentials(account, "swe-2"), { credentialIds: ["devin.json"], matchedBy: "family" });
    assert.deepEqual(matchCredentials(account, "claude-opus-5-5"), { credentialIds: ["claude.json"], matchedBy: "model-list" });
  });

  it("locks an account out after 401 until an explicit refresh", async () => {
    const h = harness({ handler: () => json(401, { error: "invalid management key" }) });
    let snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].state, "error");
    assert.equal(snap.accounts[0].errorCode, "unauthorized");
    assert.equal(snap.accounts[0].errorStatus, 401);
    assert.equal(h.calls.length, 1);

    h.clock.now += QUOTA_TTL_MS * 3;
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].refreshing, false);
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.length, 1);
    await h.controller.refresh();
    assert.equal(h.calls.length, 1, "refresh-all skips locked-out accounts");

    h.setHandler(scenarioHandler());
    snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].state, "ok");
    assert.ok(h.calls.length > 1);
    assert.equal(JSON.stringify(h.logs).includes(FAKE_KEY), false);
  });

  it("maps 403 to forbidden", async () => {
    const h = harness({ handler: () => json(403, {}) });
    const snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "forbidden");
  });

  it("keeps stale data on network errors", async () => {
    const h = harness({ handler: scenarioHandler() });
    let snap = await h.controller.refresh("default");
    const fetchedAt = snap.accounts[0].fetchedAt;
    h.clock.now += 60_000;
    h.setHandler(() => { throw new TypeError("fetch failed"); });
    snap = await h.controller.refresh("default");
    const account = snap.accounts[0];
    assert.equal(account.state, "error");
    assert.equal(account.errorCode, "network");
    assert.equal(account.fetchedAt, fetchedAt);
    assert.equal(account.credentials.length, 4);
    assert.deepEqual(account.modelIndex["claude-opus-5-5"], ["claude.json"]);
  });

  it("times out a hung management request and a hung upstream call", async () => {
    const hung = harness({ timeoutMs: 40, handler: () => new Promise(() => {}) });
    const started = Date.now();
    let snap = await hung.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "timeout");
    assert.ok(Date.now() - started < 2000);

    const partial = harness({
      timeoutMs: 60,
      handler: scenarioHandler({ apiCall: (body) => (body.auth_index === "2" ? new Promise(() => {}) : undefined) }),
    });
    snap = await partial.controller.refresh("default");
    const account = snap.accounts[0];
    assert.equal(account.state, "ok");
    const codex = credentialById(account, "codex.json");
    assert.equal(codex.quotaState, "error");
    assert.equal(codex.quotaErrorCode, "timeout");
    assert.deepEqual(codex.models, ["gpt-6.1-sol"]);
    assert.equal(credentialById(account, "claude.json").quotaState, "ok");
  });

  it("reports upstream failures per credential", async () => {
    const h = harness({
      handler: scenarioHandler({ apiCall: (body) => (body.auth_index === "1" ? json(200, { status_code: 401, body: `{"error":"token ${UPSTREAM_TOKEN} expired"}` }) : undefined) }),
    });
    const snap = await h.controller.refresh("default");
    const claude = credentialById(snap.accounts[0], "claude.json");
    assert.equal(claude.quotaState, "error");
    assert.equal(claude.quotaErrorCode, "upstream-unauthorized");
    assert.equal(JSON.stringify(snap).includes(UPSTREAM_TOKEN), false);
  });

  it("uses a conservative thirty-minute automatic interval", () => {
    assert.equal(QUOTA_TTL_MS, 30 * 60 * 1000);
  });

  for (const [label, handler, code] of [
    ["network", () => { throw new TypeError("offline"); }, "network"],
    ["server", () => json(503, {}), "http"],
    ["rate-limit", () => json(429, {}), "http"],
    ["invalid response", () => json(200, {}), "invalid-response"],
    ["timeout", () => new Promise(() => {}), "timeout"],
  ]) {
    it(`pauses automatic account refresh after ${label} failure until explicit recovery`, async () => {
      const h = harness({ handler, timeoutMs: 30 });
      let snap = await h.controller.refresh("default");
      assert.equal(snap.accounts[0].errorCode, code);
      assert.equal(snap.accounts[0].autoRefreshPaused, true);
      const count = h.calls.length;
      h.setHandler(scenarioHandler());
      for (let n = 0; n < 3; n++) {
        h.clock.now += QUOTA_TTL_MS * 2;
        snap = await h.controller.snapshot();
        assert.equal(snap.refreshing, false);
      }
      await h.controller.refresh();
      assert.equal(h.calls.length, count, "neither polling nor refresh-all retries paused accounts");
      snap = await h.controller.refresh("default");
      assert.equal(snap.accounts[0].state, "ok");
      assert.equal(snap.accounts[0].autoRefreshPaused, false);
      h.clock.now += QUOTA_TTL_MS;
      snap = await h.controller.snapshot();
      assert.equal(snap.refreshing, true, "successful manual recovery restores automatic refresh");
      await h.controller.refresh("default");
      h.controller.dispose();
    });
  }

  it("keeps failed credentials paused while refreshing healthy ones, until manual recovery", async () => {
    let failed = true;
    const h = harness({ handler: scenarioHandler({
      apiCall: (body) => failed && body.auth_index === "2" ? json(200, { status_code: 429, body: {} }) : undefined,
    }) });
    let snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].autoRefreshPaused, false, "one credential does not pause the whole account");
    assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, true);
    const codexCalls = () => h.calls.filter((c) => c.body?.auth_index === "2" || c.url.includes("name=codex.json")).length;
    const healthyCalls = () => h.calls.filter((c) => c.body?.auth_index === "3").length;
    const count = codexCalls();
    const healthy = healthyCalls();
    failed = false;
    for (let n = 0; n < 3; n++) {
      h.clock.now += QUOTA_TTL_MS;
      await h.controller.snapshot();
      await new Promise((r) => setImmediate(r));
      snap = await h.controller.snapshot();
      assert.equal(snap.refreshing, false);
      assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, true);
    }
    await h.controller.refresh();
    assert.equal(codexCalls(), count, "no per-credential management reads or upstream probes while paused");
    assert.ok(healthyCalls() > healthy, "healthy credentials still update");
    snap = await h.controller.refresh("default");
    assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, false);
    assert.equal(credentialById(snap.accounts[0], "codex.json").quotaState, "ok");
    assert.ok(codexCalls() > count);
    h.controller.dispose();
  });

  it("re-pauses credentials after a failed manual retry and recovers on saving a key", async () => {
    const h = harness({ handler: scenarioHandler({
      apiCall: (body) => body.auth_index === "2" ? json(200, { status_code: 401, body: {} }) : undefined,
    }) });
    await h.controller.refresh("default");
    let snap = await h.controller.refresh("default");
    assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, true);
    const count = h.calls.filter((c) => c.body?.auth_index === "2").length;
    h.clock.now += QUOTA_TTL_MS;
    await h.controller.snapshot();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.filter((c) => c.body?.auth_index === "2").length, count);
    h.setHandler(scenarioHandler());
    snap = await h.controller.saveKey("default", { managementKey: "replacement-key" });
    assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, false);
    assert.equal(credentialById(snap.accounts[0], "codex.json").quotaState, "ok");
    h.controller.dispose();
  });

  it("does not forget a credential pause when its file temporarily disappears", async () => {
    let includeCodex = true;
    let fail = true;
    const h = harness({ handler: scenarioHandler({
      authFiles: () => json(200, { files: AUTH_FILES.files.filter((f) => includeCodex || f.name !== "codex.json") }),
      apiCall: (body) => fail && body.auth_index === "2" ? json(500, {}) : undefined,
    }) });
    await h.controller.refresh("default");
    const count = h.calls.filter((c) => c.body?.auth_index === "2").length;
    includeCodex = false;
    await h.controller.refresh();
    includeCodex = true;
    fail = false;
    const snap = await h.controller.refresh();
    assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, true);
    assert.equal(h.calls.filter((c) => c.body?.auth_index === "2").length, count);
    await h.controller.saveKey("default", { clear: true });
    const recovered = await h.controller.saveKey("default", { managementKey: FAKE_KEY });
    assert.equal(credentialById(recovered.accounts[0], "codex.json").autoRefreshPaused, false);
    h.controller.dispose();
  });

  for (const mode of ["background", "bulk"]) {
    it(`queues one manual recovery behind a ${mode} refresh without dropping it`, async () => {
      const h = harness({ handler: scenarioHandler({
        apiCall: (body) => body.auth_index === "2" ? json(200, { status_code: 401, body: {} }) : undefined,
      }) });
      await h.controller.refresh("default");
      let release;
      let listingCalls = 0;
      h.setHandler(scenarioHandler({ authFiles: () => {
        listingCalls++;
        return listingCalls === 1 ? new Promise((resolve) => { release = resolve; }) : json(200, AUTH_FILES);
      } }));
      h.clock.now += QUOTA_TTL_MS;
      if (mode === "background") await h.controller.snapshot();
      else await h.controller.refresh(undefined, { wait: false });
      await new Promise((r) => setImmediate(r));
      const first = h.controller.refresh("default");
      const second = h.controller.refresh("default");
      await new Promise((r) => setImmediate(r));
      assert.equal(listingCalls, 1, "recovery must not overlap the current cycle");
      release(json(200, AUTH_FILES));
      const snapshots = await Promise.all([first, second]);
      assert.equal(listingCalls, 2, "only one queued manual recovery cycle");
      assert.equal(h.calls.filter((c) => c.body?.auth_index === "2").length, 2, "one original failure and one recovery probe");
      for (const snap of snapshots) {
        assert.equal(credentialById(snap.accounts[0], "codex.json").autoRefreshPaused, false);
        assert.equal(credentialById(snap.accounts[0], "codex.json").quotaState, "ok");
      }
      h.controller.dispose();
    });
  }

  for (const cancel of ["clear", "dispose"]) {
    it(`cancels a queued manual recovery on ${cancel}`, async () => {
      const h = harness({ handler: scenarioHandler({
        apiCall: (body) => body.auth_index === "2" ? json(500, {}) : undefined,
      }) });
      await h.controller.refresh("default");
      h.setHandler(() => new Promise(() => {}));
      await h.controller.refresh(undefined, { wait: false });
      await new Promise((r) => setImmediate(r));
      const recovery = h.controller.refresh("default");
      await new Promise((r) => setImmediate(r));
      const count = h.calls.length;
      if (cancel === "clear") await h.controller.saveKey("default", { clear: true });
      else h.controller.dispose();
      await recovery;
      assert.equal(h.calls.length, count, "cancelled recovery cannot start a new cycle");
      h.controller.dispose();
    });
  }

  it("deduplicates repeated refresh clicks while a request is running", async () => {
    let release;
    const h = harness({ handler: () => new Promise((resolve) => { release = resolve; }) });
    const first = h.controller.refresh("default");
    await new Promise((r) => setImmediate(r));
    const second = h.controller.refresh("default");
    const third = h.controller.refresh("default", { wait: false });
    await third;
    assert.equal(h.calls.length, 1);
    release(json(503, {}));
    const snapshots = await Promise.all([first, second]);
    assert.ok(snapshots.every((s) => s.accounts[0].autoRefreshPaused));
    assert.equal(h.calls.length, 1);
    h.controller.dispose();
  });

  it("refreshes in the background from snapshot only when stale", async () => {
    const h = harness({ handler: scenarioHandler() });
    let snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].state, "loading");
    assert.equal(snap.refreshing, true);
    await h.controller.refresh("default");
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].state, "ok");
    assert.equal(snap.refreshing, false);
    const count = h.calls.length;
    h.clock.now += QUOTA_TTL_MS - 1;
    await h.controller.snapshot();
    assert.equal(h.calls.length, count);
    h.clock.now += 2;
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].refreshing, true);
    assert.equal(snap.accounts[0].state, "ok");
    await h.controller.refresh("default");
    assert.ok(h.calls.length > count);
  });

  it("never refreshes disabled accounts in the background", async () => {
    const h = harness({ handler: scenarioHandler() });
    h.accounts[0].enabled = false;
    const snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].state, "idle");
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.length, 0);
  });

  it("reports no-endpoint without fetching", async () => {
    const h = harness({ handler: scenarioHandler() });
    h.accounts[0].baseURL = "";
    h.accounts[0].endpoint = undefined;
    const snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "no-endpoint");
    assert.equal(h.calls.length, 0);
  });

  it("saves and clears the management key", async () => {
    const h = harness({ keys: {}, handler: scenarioHandler() });
    await assert.rejects(() => h.controller.saveKey("missing", { managementKey: "x" }), /unknown account/);
    await assert.rejects(() => h.controller.refresh("missing"), /dsh-cliproxyapi: unknown account/);
    let snap = await h.controller.saveKey("default", { managementKey: `  ${FAKE_KEY}  ` });
    assert.equal(h.keys.get("CLI_PROXY_MANAGEMENT_KEY"), FAKE_KEY);
    assert.equal(snap.accounts[0].state, "ok");
    assert.equal(JSON.stringify(snap).includes(FAKE_KEY), false);
    snap = await h.controller.saveKey("default", { clear: true });
    assert.equal(h.keys.has("CLI_PROXY_MANAGEMENT_KEY"), false);
    assert.equal(snap.accounts[0].state, "nokey");
    assert.deepEqual(snap.accounts[0].credentials, []);
  });

  it("clears a lockout when a new key is saved", async () => {
    const h = harness({ handler: () => json(401, {}) });
    await h.controller.refresh("default");
    h.setHandler(scenarioHandler());
    const snap = await h.controller.saveKey("default", { managementKey: "new-key-456" });
    assert.equal(snap.accounts[0].state, "ok");
    assert.equal(h.calls.at(-1).headers.Authorization, "Bearer new-key-456");
  });

  it("aborts in-flight work on dispose", async () => {
    const signals = [];
    const h = harness({
      handler: (url, body, init) => {
        signals.push(init.signal);
        return new Promise(() => {});
      },
    });
    const pending = h.controller.refresh("default");
    await new Promise((r) => setImmediate(r));
    h.controller.dispose();
    const snap = await pending;
    assert.ok(signals.length > 0);
    assert.ok(signals.every((s) => s.aborted));
    assert.notEqual(snap.accounts[0].state, "error");
    const count = h.calls.length;
    h.clock.now += QUOTA_TTL_MS * 2;
    await h.controller.snapshot();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.length, count);
  });

  it("bounds concurrent credential work", async () => {
    let active = 0;
    let peak = 0;
    const files = { files: Array.from({ length: 8 }, (_, i) => ({ name: `k${i}.json`, type: "kimi", auth_index: String(i) })) };
    const h = harness({
      concurrency: 2,
      handler: scenarioHandler({
        authFiles: () => json(200, files),
        models: () => json(200, { models: [{ id: "kimi-k3" }] }),
        apiCall: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return apiOk({ limits: [{ window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" }, detail: { limit: 100, remaining: 25, resetTime: "2026-10-21T09:00:00Z" } }], usage: { limit: 1000, used: 100 } });
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    assert.ok(peak <= 2, `peak ${peak}`);
    const kimi = snap.accounts[0].credentials[0];
    assert.deepEqual(kimi.windows.map((w) => [w.kind, w.remainingPercent]), [["5h", 25], ["7d", 90]]);
  });

  it("queries Kimi International on api.kimi.ai and falls back across Kimi hosts on a rejected token", async () => {
    const files = { files: [
      { name: "intl.json", type: "kimi-ai", auth_index: "1" },
      { name: "cn.json", type: "kimi", auth_index: "2" },
    ] };
    const kimiBody = { usage: { limit: 100, used: 40, name: "weekly" } };
    const h = harness({
      handler: scenarioHandler({
        authFiles: () => json(200, files),
        models: () => json(200, { models: [{ id: "kimi-k3" }] }),
        apiCall: (body) => {
          // The cn credential is actually a kimi.ai account: .com rejects it.
          if (body.auth_index === "2" && body.url.includes("kimi.com")) return json(200, { status_code: 401, body: "{}" });
          return apiOk(kimiBody);
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    const intl = credentialById(snap.accounts[0], "intl.json");
    const cn = credentialById(snap.accounts[0], "cn.json");
    assert.equal(intl.provider, "kimi");
    assert.equal(intl.quotaState, "ok");
    assert.equal(cn.quotaState, "ok");
    const urls = (idx) => h.calls.filter((c) => c.body?.auth_index === idx).map((c) => c.body.url);
    assert.deepEqual(urls("1"), ["https://api.kimi.ai/coding/v1/usages"]);
    assert.deepEqual(urls("2"), ["https://api.kimi.com/coding/v1/usages", "https://api.kimi.ai/coding/v1/usages"]);
  });

  it("reads Meta quota with the credential's dca_token without retaining it", async () => {
    const DCA = "dca:secret-meta-token-777";
    const files = { files: [{ name: "meta.json", type: "meta", auth_index: "9", email: "m@example.com" }] };
    const h = harness({
      handler: (url, body) => {
        const u = new URL(url);
        if (u.pathname === "/v0/management/auth-files") return json(200, files);
        if (u.pathname === "/v0/management/auth-files/models") return json(200, { models: [{ id: "muse-code" }] });
        if (u.pathname === "/v0/management/auth-files/download") {
          assert.equal(u.searchParams.get("name"), "meta.json");
          return json(200, { type: "meta", api_key: "llm-key-should-not-be-used", dca_token: DCA });
        }
        if (u.pathname === "/v0/management/api-call") {
          assert.equal(body.url, "https://api.meta.ai/muse-code/key");
          return apiOk({
            api_key: "echoed-secret",
            subs_tier_name: "Pro",
            subs_usage: {
              window: { used_percent: 30, resets_at: 1792569600, window_duration_mins: 300 },
              weekly: { used_percent: 55.5, resets_at: 1792915200 },
            },
          });
        }
        return json(404, {});
      },
    });
    const snap = await h.controller.refresh("default");
    const meta = snap.accounts[0].credentials[0];
    assert.equal(meta.quotaState, "ok");
    assert.equal(meta.plan, "Pro");
    assert.deepEqual(meta.windows.map((w) => [w.id, w.kind, w.remainingPercent]), [["meta:window", "5h", 70], ["meta:weekly", "7d", 44.5]]);
    const call = h.calls.find((c) => c.body?.url === "https://api.meta.ai/muse-code/key");
    assert.equal(call.body.header.Authorization, `Bearer ${DCA}`, "dca_token, not $TOKEN$ (the LLM key)");
    const serialized = JSON.stringify(snap) + JSON.stringify(h.logs);
    for (const secret of [DCA, "echoed-secret", "llm-key-should-not-be-used"]) assert.equal(serialized.includes(secret), false, secret);
  });

  it("reports a Meta credential without dca_token as an error without calling upstream", async () => {
    const h = harness({
      handler: (url) => {
        const u = new URL(url);
        if (u.pathname === "/v0/management/auth-files") return json(200, { files: [{ name: "meta.json", type: "meta", auth_index: "9" }] });
        if (u.pathname === "/v0/management/auth-files/download") return json(200, { type: "meta", api_key: "k" });
        if (u.pathname === "/v0/management/auth-files/models") return json(200, { models: [] });
        return json(404, {});
      },
    });
    const snap = await h.controller.refresh("default");
    const meta = snap.accounts[0].credentials[0];
    assert.equal(meta.quotaState, "error");
    assert.equal(meta.quotaErrorCode, "missing-token");
    assert.equal(h.calls.some((c) => c.url.includes("/api-call")), false);
  });

  it("uses CPA's normalized quota route for plugin providers that support quota", async () => {
    const files = { files: [
      { name: "oc.json", type: "opencode", auth_index: "5", supports_quota: true, quota_provider: "opencode" },
      { name: "plain.json", type: "openai-compat", auth_index: "6" },
    ] };
    const h = harness({
      handler: (url, body) => {
        const u = new URL(url);
        if (u.pathname === "/v0/management/auth-files") return json(200, files);
        if (u.pathname === "/v0/management/auth-files/models") return json(200, { models: [{ id: "oc-model" }] });
        if (u.pathname === "/v0/management/quota/fetch") {
          assert.deepEqual(body, { auth_index: "5", provider: "opencode" });
          return json(200, {
            subscription: { plan: "pro", tierName: "OpenCode Pro" },
            summary: [{ key: "balance", label: "Balance", value: 12.5, format: "currency", currency: "USD" }],
            groups: [{ displayName: "All models", buckets: [
              { window: "5h", remainingFraction: 0.8, resetTime: "2026-10-21T09:00:00Z" },
              { window: "weekly", remainingFraction: 0.35, resetTime: "2026-10-27T00:00:00Z", description: "Weekly limit" },
            ] }],
          });
        }
        return json(404, {});
      },
    });
    const snap = await h.controller.refresh("default");
    const oc = credentialById(snap.accounts[0], "oc.json");
    assert.equal(oc.quotaState, "ok");
    assert.equal(oc.plan, "OpenCode Pro");
    assert.deepEqual(oc.windows.map((w) => [w.kind, w.group, w.remainingPercent]), [["5h", "All models", 80], ["7d", "All models", 35]]);
    const plain = credentialById(snap.accounts[0], "plain.json");
    assert.equal(plain.quotaState, "unsupported", "no supports_quota: no request");
    assert.equal(h.calls.filter((c) => c.url.includes("/quota/fetch")).length, 1);
  });

  it("rejects oversized responses", async () => {
    const big = "x".repeat(4 * 1024 * 1024 + 10);
    const h = harness({ handler: () => new Response(big, { status: 200 }) });
    const snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "invalid-response");
  });
});
