// Management origin and management credential-reference contract tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { managementKeyRef, managementOrigin } from "../../lib/quota/index.js";

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
