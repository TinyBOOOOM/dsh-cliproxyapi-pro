// The global sidebar-quota switch: state normalization, settings route and quota snapshot.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeState } from "../../lib/index.js";
import { mountPlugin } from "../helpers/host-mount.mjs";
import { recordedFetch } from "../helpers/model-fixtures.mjs";

describe("sidebar quota switch", () => {
  it("defaults to on and survives normalization and v1 migration", () => {
    assert.equal(normalizeState({ accounts: [] }).sidebarQuota, true, "on unless switched off");
    assert.equal(normalizeState({ sidebarQuota: false, accounts: [] }).sidebarQuota, false);
    assert.equal(normalizeState({ provider: "cli-proxy" }).sidebarQuota, true, "a v1 file migrates with the default");
    assert.equal(normalizeState({ sidebarQuota: "no", accounts: [] }).sidebarQuota, true, "only an explicit false turns it off");
  });

  it("is saved through the settings route and reported in the quota snapshot", async () => {
    const m = mountPlugin({
      state: { accounts: [{ id: "default", baseURL: "http://b.test", selectedModels: ["claude-opus-5-5"] }] },
      fetchImpl: recordedFetch({ "b.test": "server-b" }),
    });
    try {
      let res = await m.call("GET", "/api/dsh-cliproxyapi/status");
      assert.equal(res.body.global.sidebarQuota, true);
      res = await m.call("GET", "/api/dsh-cliproxyapi/quota/status");
      assert.equal(res.body.quota.sidebar, true);

      res = await m.call("POST", "/api/dsh-cliproxyapi/save", { sidebarQuota: false });
      assert.equal(res.code, 200, res.body?.error);
      assert.equal(res.body.global.sidebarQuota, false);
      assert.equal(JSON.parse(readFileSync(join(m.stateDir, "state.json"), "utf8")).sidebarQuota, false);
      assert.equal(res.body.accounts[0].config.baseURL, "http://b.test", "a global-only save leaves the account alone");

      res = await m.call("GET", "/api/dsh-cliproxyapi/quota/status");
      assert.equal(res.body.quota.sidebar, false, "the page learns the switch from its quota read");

      res = await m.call("POST", "/api/dsh-cliproxyapi/save", { sidebarQuota: true });
      assert.equal(res.body.global.sidebarQuota, true);
    } finally {
      m.dispose();
    }
  });
});
