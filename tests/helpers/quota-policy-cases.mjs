// Registers quota pause, recovery, and refresh scheduling cases in the controller suite.
import assert from "node:assert/strict";
import { it } from "node:test";
import { QUOTA_TTL_MS } from "../../lib/quota/index.js";
import { FAKE_KEY, json, harness, AUTH_FILES, scenarioHandler, credentialById } from "./quota-harness.mjs";

export function registerPolicyCases() {
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
}
