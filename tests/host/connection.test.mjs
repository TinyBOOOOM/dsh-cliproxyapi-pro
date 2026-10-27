// Host connection tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";





import { SERVERS } from "../helpers/host-catalog.mjs";
import { harness } from "../helpers/host-harness.mjs";

describe("test connection", () => {
  it("probes unsaved values without saving, and uses the stored key when the draft is blank", async () => {
    const { controller, providers, state } = harness(
      { accounts: [{ id: "default", provider: "cli-proxy", baseURL: "https://a.test", enabled: false }] },
      SERVERS
    );
    const before = JSON.stringify(state());
    const stored = await controller.testConnection("default", { baseURL: "https://a.test" });
    assert.equal(stored.test.ok, true, stored.test.error);
    assert.equal(stored.test.endpoint, "https://a.test");
    assert.equal(stored.test.modelCount, 2);
    const draft = await controller.testConnection("default", { baseURL: "https://b.test", apiKey: "key-b" });
    assert.equal(draft.test.ok, true);
    assert.equal(draft.test.modelCount, 2);
    const wrong = await controller.testConnection("default", { baseURL: "https://b.test", apiKey: "nope" });
    assert.equal(wrong.test.ok, false);
    assert.match(wrong.test.error, /HTTP 401/);
    assert.ok(!JSON.stringify(wrong).includes("nope"), "the key is never echoed");
    const fresh = await controller.testConnection(undefined, { baseURL: "https://b.test", apiKey: "key-b" });
    assert.equal(fresh.test.ok, true, "a new account can be tested before it exists");
    assert.equal(JSON.stringify(state()), before, "nothing is saved");
    assert.deepEqual(Object.keys(providers), [], "no routes are written");
  });
});
