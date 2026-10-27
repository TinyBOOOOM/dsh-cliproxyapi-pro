// Host media-catalog tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";





import { json, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { harness } from "../helpers/host-harness.mjs";

describe("media models", () => {
  it("keeps image and video models out of the chat routes, recommendations and seeding", async () => {
    const h = harness({ accounts: [{ id: "default", baseURL: "http://m.test" }] }, MEDIA_SERVERS);
    const payload = await h.controller.refresh("default");
    const account = payload.accounts[0];
    assert.equal(account.status.state, "connected", account.status.error);
    const routed = Object.values(h.providers).flatMap((r) => r.models.map((m) => m.id)).sort();
    assert.deepEqual(routed, ["claude-opus-5-5", "grok-4.6"]);
    assert.deepEqual(h.state().accounts[0].selectedModels, ["grok-4.6", "claude-opus-5-5"], "seeded from chat models only");
    assert.deepEqual(account.recommendedModels, ["grok-4.6", "claude-opus-5-5"]);
    const kinds = Object.fromEntries(account.status.allModels.map((m) => [m.id, m.kind]));
    assert.deepEqual(kinds, {
      "grok-4.6": "chat",
      "grok-imagine-image": "image",
      "grok-imagine-video-1.5": "video",
      "claude-opus-5-5": "chat",
    });
    const [media] = h.controller.mediaAccounts();
    assert.deepEqual(media.models.map((m) => [m.id, m.kind]), [["grok-imagine-image", "image"], ["grok-imagine-video-1.5", "video"]]);
    assert.deepEqual(media.chatModelIds.sort(), ["claude-opus-5-5", "grok-4.6"]);
  });

  it("an explicit selection naming a media model still never routes it", async () => {
    const h = harness(
      { accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: ["grok-imagine-image", "grok-4.6"] }] },
      MEDIA_SERVERS
    );
    await h.controller.refreshAll();
    assert.deepEqual(Object.values(h.providers).flatMap((r) => r.models.map((m) => m.id)), ["grok-4.6"]);
    assert.deepEqual(h.state().accounts[0].selectedModels, ["grok-imagine-image", "grok-4.6"], "the saved selection is untouched");
  });

  it("applies kind overrides on the next sync in both directions", async () => {
    let overrides = {};
    const h = harness(
      { accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      MEDIA_SERVERS,
      { mediaKindOverrides: (id) => (id === "default" ? overrides : {}) }
    );
    await h.controller.refreshAll();
    const ids = () => Object.values(h.providers).flatMap((r) => r.models.map((m) => m.id)).sort();
    assert.deepEqual(ids(), ["claude-opus-5-5", "grok-4.6"]);
    overrides = { "grok-imagine-image": "chat", "grok-4.6": "video" };
    await h.controller.refreshAccount("default");
    assert.deepEqual(ids(), ["claude-opus-5-5", "grok-imagine-image"]);
    const [media] = h.controller.mediaAccounts();
    assert.deepEqual(media.models.map((m) => [m.id, m.kind, m.detectedKind]), [
      ["grok-4.6", "video", "chat"],
      ["grok-imagine-video-1.5", "video", "video"],
    ]);
  });

  it("adds a media model only the plain listing carries and reads its registry type", async () => {
    const fetchImpl = async (url) => {
      const enriched = String(url).includes("client_version=pi");
      return json(
        enriched
          ? { models: [{ slug: "grok-4.6" }, { slug: "my-painter" }] }
          : {
              data: [
                { id: "grok-4.6", object: "model", owned_by: "xai" },
                { id: "my-painter", object: "model", owned_by: "openai", type: "openai-image" },
                { id: "plain-only-chat", object: "model", owned_by: "openai" },
                { id: "grok-imagine-video", object: "model", owned_by: "xai" },
              ],
            }
      );
    };
    const h = harness({ accounts: [{ id: "default", baseURL: "http://p.test", selectedModels: [] }] }, {}, { fetch: fetchImpl });
    await h.controller.refreshAll();
    const [media] = h.controller.mediaAccounts();
    assert.deepEqual(media.models.map((m) => [m.id, m.kind]), [["my-painter", "image"], ["grok-imagine-video", "video"]]);
    assert.deepEqual(media.chatModelIds, ["grok-4.6"], "plain-only chat models are not added");
    assert.deepEqual(Object.values(h.providers).flatMap((r) => r.models.map((m) => m.id)), ["grok-4.6"]);
  });

  it("reads the plain listing on its own deadline when the enriched catalog is slow", async () => {
    const fetchImpl = async (url) => {
      const enriched = String(url).includes("client_version=pi");
      await new Promise((resolve) => setTimeout(resolve, enriched ? 140 : 100));
      return json(
        enriched
          ? { models: [{ slug: "grok-4.6" }, { slug: "grok-imagine-video" }] }
          : {
              data: [
                { id: "grok-imagine-video", object: "model", owned_by: "xai" },
                { id: "grok-imagine-image-2.0", object: "model", owned_by: "openai", type: "openai-image" },
              ],
            }
      );
    };
    const h = harness(
      { version: 2, probeTimeoutMs: 200, accounts: [{ id: "default", baseURL: "http://p.test", selectedModels: [] }] },
      {},
      { fetch: fetchImpl }
    );
    try {
      await h.controller.refreshAll();
      const [media] = h.controller.mediaAccounts();
      assert.equal(media.listingOk, true);
      assert.equal(media.catalogIncomplete, false);
      assert.deepEqual(media.models.map((m) => m.id).sort(), ["grok-imagine-image-2.0", "grok-imagine-video"]);
    } finally {
      h.controller.dispose();
    }
  });

  it("retries a failed plain listing and reports an incomplete catalog when it keeps failing", async () => {
    let mode = "recover";
    let listingCalls = 0;
    const fetchImpl = async (url) => {
      if (!String(url).includes("client_version=pi")) {
        listingCalls += 1;
        if (listingCalls === 1 || mode === "fail") throw new Error("ETIMEDOUT");
        return json({ data: [{ id: "grok-imagine-image-2.0", object: "model", type: "openai-image" }] });
      }
      return json({ models: [{ slug: "grok-imagine-video" }] });
    };
    const state = () => ({ version: 2, probeTimeoutMs: 100, accounts: [{ id: "default", baseURL: "http://p.test", selectedModels: [] }] });
    const h = harness(state(), {}, { fetch: fetchImpl });
    try {
      await h.controller.refreshAll();
      const [media] = h.controller.mediaAccounts();
      assert.equal(listingCalls, 2, "the failed listing is tried again");
      assert.equal(media.listingOk, true);
      assert.deepEqual(media.models.map((m) => m.id).sort(), ["grok-imagine-image-2.0", "grok-imagine-video"]);
    } finally {
      h.controller.dispose();
    }

    mode = "fail";
    listingCalls = 0;
    const timers = [];
    const failing = harness(state(), {}, { fetch: fetchImpl, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
    try {
      await failing.controller.refreshAll();
      const [media] = failing.controller.mediaAccounts();
      assert.equal(media.listingOk, false);
      assert.equal(media.catalogIncomplete, true);
      assert.deepEqual(media.models.map((m) => m.id), ["grok-imagine-video"], "the enriched catalog is still usable");
      assert.equal(timers.length, 1, "an incomplete catalog is re-read soon");
      assert.equal(timers[0].ms, 4000);
    } finally {
      failing.controller.dispose();
    }
  });

  it("re-syncing unchanged media data performs no settings writes", async () => {
    let writes = 0;
    const providers = {};
    const h = harness({ accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] }, MEDIA_SERVERS, {
      settings: {
        mutate: async (_ns, ops) => {
          writes += 1;
          for (const op of ops) {
            if (op.op === "set") providers[op.path[1]] = op.value;
            else delete providers[op.path[1]];
          }
        },
      },
      readExistingPiAiRoute: (key) => providers[key],
    });
    await h.controller.refreshAll();
    const after = writes;
    assert.ok(after > 0);
    await h.controller.refreshAll();
    assert.equal(writes, after);
  });
});
