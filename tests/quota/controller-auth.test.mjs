// Quota controller management-key rejection limit (persisted in quota-state.json).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTH_FAILURE_LIMIT, QUOTA_TTL_MS, normalizeQuotaAuthState } from "../../lib/quota/index.js";
import { FAKE_KEY, json, harness, scenarioHandler } from "../helpers/quota-harness.mjs";

describe("quota controller", () => {
  it(`stops background refresh after ${AUTH_FAILURE_LIMIT} rejected keys; a manual refresh tries once`, async () => {
    const h = harness({ handler: () => json(401, { error: "invalid management key" }) });
    let snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].state, "error");
    assert.equal(snap.accounts[0].errorCode, "unauthorized");
    assert.equal(snap.accounts[0].errorStatus, 401);
    assert.equal(snap.accounts[0].authFailures, 1);
    assert.equal(snap.accounts[0].authFailureLimit, AUTH_FAILURE_LIMIT);
    assert.equal(snap.accounts[0].authPaused, false);
    // A rejected key is counted, not treated as a failed cycle that locks the account out.
    assert.equal(snap.accounts[0].autoRefreshPaused, false);
    assert.equal(h.calls.length, 1);

    // Background retries continue (once per TTL) until the limit.
    for (let n = 2; n <= AUTH_FAILURE_LIMIT; n++) {
      h.clock.now += QUOTA_TTL_MS + 1;
      await h.controller.snapshot();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      assert.equal(h.calls.length, n);
    }
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].authFailures, AUTH_FAILURE_LIMIT);
    assert.equal(snap.accounts[0].authPaused, true);

    h.clock.now += QUOTA_TTL_MS * 10;
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].refreshing, false);
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.length, AUTH_FAILURE_LIMIT, "paused accounts are not refreshed in the background");
    await h.controller.refresh();
    assert.equal(h.calls.length, AUTH_FAILURE_LIMIT, "refresh-all skips paused accounts");

    // A manual refresh tries exactly once and stays paused on another rejection.
    snap = await h.controller.refresh("default");
    assert.equal(h.calls.length, AUTH_FAILURE_LIMIT + 1);
    assert.equal(snap.accounts[0].authPaused, true);
    h.clock.now += QUOTA_TTL_MS * 10;
    await h.controller.snapshot();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.calls.length, AUTH_FAILURE_LIMIT + 1);

    h.setHandler(scenarioHandler());
    snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].state, "ok");
    assert.equal(snap.accounts[0].authFailures, undefined);
    assert.equal(snap.accounts[0].authPaused, undefined);
    assert.equal(JSON.stringify(h.logs).includes(FAKE_KEY), false);
  });

  it("network errors neither count as key failures nor reset them", async () => {
    const h = harness({ handler: () => json(403, {}) });
    await h.controller.refresh("default");
    h.setHandler(() => { throw new TypeError("fetch failed"); });
    const snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].errorCode, "network");
    assert.equal(snap.accounts[0].authFailures, 1);
  });

  it("keeps the failure count across reloads without storing the key", async () => {
    let stored;
    const authStore = { read: () => stored, write: (value) => { stored = structuredClone(value); } };
    const reject = () => json(401, {});
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
      const h = harness({ handler: reject, authStore });
      await h.controller.refresh("default");
      h.controller.dispose();
    }
    assert.equal(stored.version, 1);
    assert.equal(stored.accounts.default.authFailures, AUTH_FAILURE_LIMIT);
    assert.equal(stored.accounts.default.errorCode, "unauthorized");
    assert.equal(JSON.stringify(stored).includes(FAKE_KEY), false);

    // The next activation shows the stopped state and never tries in the background.
    const next = harness({ handler: reject, authStore });
    let snap = await next.controller.snapshot();
    await new Promise((r) => setImmediate(r));
    assert.equal(next.calls.length, 0);
    assert.equal(snap.accounts[0].state, "error");
    assert.equal(snap.accounts[0].errorCode, "unauthorized");
    assert.equal(snap.accounts[0].authPaused, true);

    // A key changed elsewhere (credentials page) resets the count.
    assert.equal(next.controller.keyChanged("SOMETHING_ELSE"), undefined);
    assert.equal(next.controller.keyChanged("CLI_PROXY_MANAGEMENT_KEY"), "default");
    assert.equal(stored.accounts.default, undefined);
    snap = await next.controller.snapshot();
    await new Promise((r) => setImmediate(r));
    assert.equal(next.calls.length, 1);
    assert.deepEqual(normalizeQuotaAuthState({ accounts: { "bad id": { authFailures: 2 }, ok: { authFailures: 0 } } }), { version: 1, accounts: {} });
  });

  it("a changed management key also lifts a failed-cycle lockout", async () => {
    const h = harness({ handler: () => json(503, {}) });
    let snap = await h.controller.refresh("default");
    assert.equal(snap.accounts[0].autoRefreshPaused, true);
    h.setHandler(scenarioHandler());
    assert.equal(h.controller.keyChanged("CLI_PROXY_MANAGEMENT_KEY"), "default");
    h.clock.now += QUOTA_TTL_MS + 1;
    snap = await h.controller.snapshot();
    assert.equal(snap.accounts[0].autoRefreshPaused, false);
    assert.equal(snap.refreshing, true, "background refresh resumes after the key changed");
    await h.controller.refresh("default");
    h.controller.dispose();
  });

  it("resets the failure count when a new key is saved", async () => {
    const h = harness({ handler: () => json(401, {}) });
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await h.controller.refresh("default");
    let snap = await h.controller.saveKey("default", { managementKey: "still-wrong" });
    assert.equal(snap.accounts[0].authFailures, 1, "a new key starts a new count");
    assert.equal(snap.accounts[0].authPaused, false);
    h.setHandler(scenarioHandler());
    snap = await h.controller.saveKey("default", { managementKey: "new-key-456" });
    assert.equal(snap.accounts[0].state, "ok");
    assert.equal(h.calls.at(-1).headers.Authorization, "Bearer new-key-456");
  });
});
