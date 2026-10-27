// api behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("client API paths", () => {
  it("defines every API path the client calls, each matching a host route", async () => {
    const { ROUTES } = await import("../../lib/index.js");
    const { API } = clientHarness();
    const source = readFileSync(new URL("../../lib/client.js", import.meta.url), "utf8");
    const used = new Set([...source.matchAll(/\bAPI\.(\w+)/g)].map((m) => m[1]));
    const hostPaths = new Set(Object.values(ROUTES).map((path) => path.replace(/^\//, "")));
    assert.ok(used.has("testAccount"));
    for (const key of used) {
      assert.equal(typeof API[key], "string", `API.${key} is used but not defined`);
      assert.ok(hostPaths.has(API[key]), `API.${key} (${API[key]}) has no host route`);
    }
  });
});

