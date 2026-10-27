// Registers provider protocol, concurrency, and response-bound cases in the controller suite.
import assert from "node:assert/strict";
import { it } from "node:test";
import { json, apiOk, harness, scenarioHandler, credentialById } from "./quota-harness.mjs";

export function registerProviderCases() {
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
}
