// Quota controller provider protocol, concurrency and response-bound cases.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { json, apiOk, harness, scenarioHandler, credentialById } from "../helpers/quota-harness.mjs";

describe("quota controller", () => {
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

  it("re-reads the Antigravity tier every round so an upgrade replaces the cached plan", async () => {
    let tier = { paidTier: { id: "g1-pro-tier", name: "Google AI Pro" } };
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (!body.url.endsWith(":loadCodeAssist")) return undefined;
          return tier === null ? json(200, { status_code: 500, body: "{}" }) : apiOk(tier);
        },
      }),
    });
    const loads = () => h.calls.filter((c) => c.body?.auth_index === "4" && c.body.url.endsWith(":loadCodeAssist")).length;
    let snap = await h.controller.refresh("default");
    assert.equal(credentialById(snap.accounts[0], "ag.json").plan, "Pro");
    assert.equal(loads(), 1);

    tier = { paidTier: { id: "g1-ultra-tier", name: "Google AI Ultra" } };
    snap = await h.controller.refresh("default");
    const ag = credentialById(snap.accounts[0], "ag.json");
    assert.equal(ag.quotaState, "ok");
    assert.equal(ag.plan, "Ultra", "the fresh tier wins over the previous round's plan");
    assert.equal(loads(), 2, "the tier is queried even though a plan is already known");

    // A failed tier read keeps the last known plan.
    tier = null;
    snap = await h.controller.refresh("default");
    assert.equal(credentialById(snap.accounts[0], "ag.json").plan, "Ultra");
    assert.equal(loads(), 3);
  });

  it("takes Antigravity Gemini quota from the daily per-model list when the summary only covers Claude/GPT", async () => {
    const SUMMARY = "v1internal:retrieveUserQuotaSummary";
    const claudeOnly = { groups: [{ displayName: "Claude and GPT models", buckets: [
      { bucketId: "3p-5h", window: "5h", remainingFraction: 0.75, resetTime: "2026-10-21T10:00:00Z" },
      { bucketId: "3p-weekly", window: "weekly", remainingFraction: 0.5, resetTime: "2026-10-27T00:00:00Z" },
    ] }] };
    const gemini = (fraction) => ({ remainingFraction: fraction, resetTime: "2026-10-21T09:30:00Z" });
    const dailyModels = { models: {
      // `modelId` is an internal placeholder; the key is the public id.
      "gemini-3-flash": { displayName: "Gemini 3 Flash", modelId: "MODEL_PLACEHOLDER_M18", quotaInfo: gemini(0.4) },
      "gemini-3.1-flash-lite": { displayName: "Gemini 3.1 Flash Lite", modelId: "MODEL_PLACEHOLDER_M50", quotaInfo: gemini(0.4) },
      "claude-sonnet-4-6": { displayName: "Claude Sonnet 4.6", modelId: "MODEL_PLACEHOLDER_M35", quotaInfo: { remainingFraction: 1, resetTime: "2026-10-21T11:00:00Z" } },
      tab_flash_lite_preview: { modelId: "MODEL_PLACEHOLDER_M19", quotaInfo: { remainingFraction: 1 } },
      chat_20706: { displayName: "Internal", isInternal: true, quotaInfo: { remainingFraction: 1 } },
    } };
    const h = harness({
      handler: scenarioHandler({
        models: (name) => json(200, { models: name === "ag.json" ? [{ id: "gemini-4-argon-high" }, { id: "claude-sonnet-4-6" }] : [] }),
        apiCall: (body) => {
          if (body.url.endsWith(SUMMARY)) return apiOk(claudeOnly);
          if (body.url === "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels") return apiOk(dailyModels);
          // Production still reads 100% while the daily host serves the traffic.
          if (body.url.endsWith(":fetchAvailableModels")) return apiOk({ models: { "gemini-3-flash": { quotaInfo: gemini(1) } } });
          if (body.url.endsWith(":retrieveUserQuota")) return apiOk({ buckets: [{ modelId: "gemini-3-flash", remainingFraction: 1 }] });
          return undefined;
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    const ag = credentialById(snap.accounts[0], "ag.json");
    assert.equal(ag.quotaState, "ok");
    assert.deepEqual(ag.windows.map((w) => [w.group, w.kind, w.remainingPercent, w.modelPrefixes, w.modelIds]), [
      ["Claude and GPT models", "5h", 75, ["claude", "gpt"], undefined],
      ["Gemini models", "5h", 40, ["gemini", "gemma"], undefined],
      ["Claude and GPT models", "7d", 50, ["claude", "gpt"], undefined],
    ], "one shared Gemini pool, matched by prefix so unlisted Gemini ids find it");
    const agCalls = () => h.calls.filter((c) => c.body?.auth_index === "4").map((c) => c.body.url);
    assert.equal(agCalls().some((u) => u.endsWith(":retrieveUserQuota")), false);
    assert.equal(agCalls().some((u) => u === "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels"), false);

    // The daily host stays preferred on the next round.
    h.calls.length = 0;
    await h.controller.refresh("default");
    assert.deepEqual(agCalls().filter((u) => u.endsWith(":fetchAvailableModels")), ["https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels"]);
  });

  it("keeps per-model Antigravity windows when a family's models report different quotas", async () => {
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (body.url.endsWith(":retrieveUserQuotaSummary")) return json(200, { status_code: 404, body: "{}" });
          if (body.url.endsWith(":fetchAvailableModels")) {
            return apiOk({ models: {
              "gemini-3-flash": { displayName: "Gemini 3 Flash", quotaInfo: { remainingFraction: 0.9, resetTime: "2026-10-21T09:00:00Z" } },
              "gemini-3.1-pro": { displayName: "Gemini 3.1 Pro", quotaInfo: { remainingFraction: 0, resetTime: "2026-10-21T09:00:00Z" } },
              "claude-sonnet-4-6": { displayName: "Claude Sonnet 4.6", quotaInfo: { remainingFraction: 0.6, resetTime: "2026-10-21T09:00:00Z" } },
            } });
          }
          return undefined;
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    const ag = credentialById(snap.accounts[0], "ag.json");
    assert.deepEqual(ag.windows.map((w) => [w.group, w.remainingPercent, w.modelIds ?? w.modelPrefixes]), [
      ["Gemini models", 90, ["gemini-3-flash"]],
      ["Gemini models", 0, ["gemini-3.1-pro"]],
      ["Claude and GPT models", 60, ["claude", "gpt"]],
    ]);
  });

  it("re-reads the Gemini CLI tier when the credential already has a project", async () => {
    const files = { files: [{ name: "gc.json", type: "gemini-cli", auth_index: "7", project_id: "proj-2" }] };
    let tier = { paidTier: { id: "g1-pro-tier", name: "Google AI Pro" } };
    const h = harness({
      handler: scenarioHandler({
        authFiles: () => json(200, files),
        models: () => json(200, { models: [{ id: "gemini-4-pro" }] }),
        apiCall: (body) => {
          if (body.url.endsWith(":loadCodeAssist")) return apiOk(tier);
          if (body.url.endsWith(":retrieveUserQuota")) {
            assert.equal(JSON.parse(body.data).project, "proj-2");
            return apiOk({ buckets: [{ modelId: "gemini-4-pro", remainingFraction: 0.5, resetTime: "2026-10-22T06:00:00Z" }] });
          }
          return undefined;
        },
      }),
    });
    let snap = await h.controller.refresh("default");
    let gc = credentialById(snap.accounts[0], "gc.json");
    assert.equal(gc.quotaState, "ok");
    assert.equal(gc.plan, "Pro");
    assert.deepEqual(gc.windows.map((w) => w.remainingPercent), [50]);

    tier = { paidTier: { id: "g1-ultra-tier", name: "Google AI Ultra" } };
    snap = await h.controller.refresh("default");
    gc = credentialById(snap.accounts[0], "gc.json");
    assert.equal(gc.plan, "Ultra");
    assert.equal(h.calls.filter((c) => c.body?.url?.endsWith(":loadCodeAssist")).length, 2);
  });

  it("rejects oversized responses", async () => {
    const big = "x".repeat(4 * 1024 * 1024 + 10);
    const h = harness({ handler: () => new Response(big, { status: 200 }) });
    const snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "invalid-response");
  });

  it("isolates Gemini 4 Argon quota windows and ignores internal Antigravity model ids", async () => {
    const h = harness({
      handler: scenarioHandler({
        authFiles: () => json(200, { files: [{ name: "ag.json", type: "antigravity", auth_index: "4", project_id: "proj-1" }] }),
        models: () => json(200, { models: [{ id: "gemini-4-argon-high" }, { id: "gemini-3-flash" }] }),
        apiCall: (body) => {
          if (body.url === "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary") {
            return apiOk({
              groups: [
                { displayName: "Gemini Models", buckets: [{ displayName: "Five Hour Limit Remaining", window: "5h", remainingFraction: 0.77, resetTime: "2026-10-21T10:00:00Z" }] },
                { displayName: "Gemini 4 Argon", buckets: [{ displayName: "Gemini 4 Argon Weekly Limit", remainingFraction: 0.01, resetTime: "2026-10-27T00:00:00Z" }] },
              ],
            });
          }
          return undefined;
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    const ag = credentialById(snap.accounts[0], "ag.json");
    assert.equal(ag.quotaState, "ok");
    const argon = ag.windows.find((w) => w.group === "Gemini 4 Argon");
    assert.equal(argon.kind, "7d");
    assert.equal(argon.remainingPercent, 1);
    assert.deepEqual(argon.modelPrefixes, ["argon", "gemini-4-argon"]);

    const hFallback = harness({
      handler: scenarioHandler({
        authFiles: () => json(200, { files: [{ name: "ag2.json", type: "antigravity", auth_index: "4", project_id: "proj-1" }] }),
        models: () => json(200, { models: [{ id: "gemini-4-argon-high" }] }),
        apiCall: (body) => {
          if (body.url.includes(":retrieveUserQuotaSummary")) return json(200, { status_code: 404, body: "{}" });
          if (body.url === "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels") {
            return apiOk({
              models: {
                chat_20706: { quotaInfo: { remainingFraction: 0.5, resetTime: "2026-10-21T10:00:00Z" } },
                tab_flash_lite_preview: { quotaInfo: { remainingFraction: 0.5, resetTime: "2026-10-21T10:00:00Z" } },
                "gemini-4-argon-high": { quotaInfo: { remainingFraction: 0.01, resetTime: "2026-10-27T00:00:00Z" } },
              },
            });
          }
          return undefined;
        },
      }),
    });
    const snap2 = await hFallback.controller.refresh("default");
    const ag2 = credentialById(snap2.accounts[0], "ag2.json");
    assert.deepEqual(ag2.windows.map((w) => [w.id, w.group]), [["ag-model:gemini-argon-models", "Gemini Argon models"]]);
    h.controller.dispose();
    hFallback.controller.dispose();
  });
});
