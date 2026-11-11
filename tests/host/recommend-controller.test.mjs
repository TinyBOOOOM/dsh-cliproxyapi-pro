// Recommendations, suggestions and online model info through the account controller and HTTP routes.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "../../lib/index.js";
import { harness } from "../helpers/host-harness.mjs";
import { mountPlugin } from "../helpers/host-mount.mjs";
import { onlineLookup, recordedFetch } from "../helpers/model-fixtures.mjs";

/** A controllable stand-in for createModelInfo(). */
function fakeModelInfo({ lookup = () => undefined, loaded = true } = {}) {
  const state = { loaded, readyCalls: 0, refreshes: 0 };
  return {
    state,
    lookup: (model) => (state.loaded ? lookup(model) : undefined),
    ready: async () => {
      state.readyCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      state.loaded = true;
    },
    refresh: async () => {
      state.refreshes += 1;
      return false;
    },
    status: () => ({ enabled: true, state: state.loaded ? "ready" : "idle", sources: {} }),
  };
}

describe("recommendations in the account controller", () => {
  it("reports recommendations with reasons and suggestions for the saved selection", async () => {
    const modelInfo = fakeModelInfo({ lookup: onlineLookup() });
    const h = harness(
      { accounts: [{ id: "default", baseURL: "http://b.test", selectedModels: ["claude-fable-5-1", "claude-opus-5-5", "claude-gone-1"] }] },
      {},
      { fetch: recordedFetch({ "b.test": "server-b" }), modelInfo }
    );
    await h.controller.refreshAll();
    const payload = await h.controller.statusPayload();
    const [account] = payload.accounts;
    assert.equal(account.status.state, "connected", account.status.error);
    assert.deepEqual(account.recommendedModels, ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5"]);
    assert.equal(account.recommendations[0].source, "online");
    assert.deepEqual(account.suggestions.upgrades.map((u) => [u.from, u.to]), [[["claude-fable-5-1"], "claude-fable-5-2"]]);
    assert.deepEqual(account.suggestions.missing, [{ id: "claude-gone-1" }]);
    assert.equal(payload.global.onlineModelInfo, true);
    assert.equal(payload.global.modelInfo.state, "ready");
    // Advice never changes the saved selection.
    assert.deepEqual(h.state().accounts[0].selectedModels, ["claude-fable-5-1", "claude-opus-5-5", "claude-gone-1"]);
  });

  it("waits for online info before a first-run seed and seeds what the panel recommends", async () => {
    const modelInfo = fakeModelInfo({ lookup: onlineLookup(), loaded: false });
    const h = harness({ accounts: [{ id: "default", baseURL: "http://b.test" }] }, {}, { fetch: recordedFetch({ "b.test": "server-b" }), modelInfo });
    await h.controller.refreshAll();
    assert.equal(modelInfo.state.readyCalls, 1);
    assert.deepEqual(h.state().accounts[0].selectedModels, ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5"], "flagships by score, not the offline order");
    // A saved selection never waits again.
    await h.controller.refreshAll();
    assert.equal(modelInfo.state.readyCalls, 1);
  });

  it("fills limits the catalog leaves out into routes and marks them", async () => {
    const lookup = (model) => (model.id === "acme-max-2" ? { exact: true, context: 400_000, output: 300_000 } : undefined);
    const fetch = async (url) => {
      const body = String(url).includes("client_version=pi")
        ? { models: [{ slug: "acme-max-2" }, { slug: "acme-max-1", context_window: 100_000, max_tokens: 8000 }] }
        : { data: [{ id: "acme-max-2" }, { id: "acme-max-1" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const h = harness({ accounts: [{ id: "default", baseURL: "http://x.test", selectedModels: [] }] }, {}, { fetch, modelInfo: fakeModelInfo({ lookup }) });
    await h.controller.refreshAll();
    const profiles = Object.fromEntries(h.providers["cli-proxy"].models.map((m) => [m.id, m]));
    assert.equal(profiles["acme-max-2"].contextWindow, 400_000);
    assert.equal(profiles["acme-max-2"].maxTokens, 128_000, "capped");
    assert.equal(profiles["acme-max-1"].contextWindow, 100_000, "catalog values win");
    const view = (await h.controller.statusPayload()).accounts[0].status.allModels.find((m) => m.id === "acme-max-2");
    assert.deepEqual(view.discovered.onlineLimits, ["contextWindow", "maxTokens"]);
  });

  it("keeps the global switch in the state file and reports toggles", async () => {
    assert.equal(normalizeState({ accounts: [] }).onlineModelInfo, true, "on unless switched off");
    assert.equal(normalizeState({ onlineModelInfo: false, accounts: [] }).onlineModelInfo, false);
    assert.equal(normalizeState({ provider: "cli-proxy" }).onlineModelInfo, true, "a v1 file migrates with the default");
    const toggles = [];
    const h = harness({ accounts: [{ id: "default", baseURL: "http://b.test" }] }, {}, {
      fetch: recordedFetch({ "b.test": "server-b" }),
      onModelInfoToggled: (on) => toggles.push(on),
    });
    let payload = await h.controller.updateGlobals({ onlineModelInfo: false });
    assert.equal(payload.global.onlineModelInfo, false);
    assert.equal(h.state().onlineModelInfo, false);
    await h.controller.updateGlobals({ refreshIntervalSeconds: 120 });
    payload = await h.controller.updateAccount("default", { onlineModelInfo: true, displayName: "Server B" });
    assert.equal(payload.global.onlineModelInfo, true);
    assert.deepEqual(toggles, [false, true]);
  });
});

describe("online model info in the mounted plugin", () => {
  it("saves the switch through the settings route and reports its state", async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push(String(url));
      return recordedFetch({ "b.test": "server-b" })(url, init);
    };
    const m = mountPlugin({
      state: { onlineModelInfo: true, accounts: [{ id: "default", baseURL: "http://b.test", selectedModels: ["claude-opus-5-5"] }] },
      fetchImpl: fetch,
    });
    try {
      let res = await m.call("GET", "/api/dsh-cliproxyapi/status");
      assert.equal(res.body.global.onlineModelInfo, true);
      assert.ok(["idle", "loading", "error"].includes(res.body.global.modelInfo.state));
      res = await m.call("POST", "/api/dsh-cliproxyapi/save", { onlineModelInfo: false });
      assert.equal(res.code, 200, res.body?.error);
      assert.equal(res.body.global.onlineModelInfo, false);
      assert.equal(res.body.global.modelInfo.state, "off");
      assert.ok(!calls.some((url) => /models\.dev|openrouter/.test(url)), "nothing is downloaded before the delayed first look, or once off");
    } finally {
      m.dispose();
    }
  });
});
