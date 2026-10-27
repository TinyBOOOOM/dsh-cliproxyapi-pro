// Quota controller snapshots, matching, transport failures, and lifecycle tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QUOTA_TTL_MS, matchCredentials } from "../../lib/quota/index.js";
import { FAKE_KEY, UPSTREAM_TOKEN, START, json, apiOk, harness, scenarioHandler, credentialById } from "../helpers/quota-harness.mjs";
import { registerPolicyCases } from "../helpers/quota-policy-cases.mjs";
import { registerProviderCases } from "../helpers/quota-provider-cases.mjs";

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

  registerPolicyCases();

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

  registerProviderCases();
});
