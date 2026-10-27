// text behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("settings page text", () => {
  it("every key the UI renders exists in both dictionaries", async () => {
    const { readFileSync } = await import("node:fs");
    const s = readFileSync(new URL("../../lib/client.js", import.meta.url), "utf8");
    const zs = s.indexOf("    const zh = {"), es = s.indexOf("    const en = {"), cs = s.indexOf("    const CSS = `");
    const zh = s.slice(zs, es), en = s.slice(es, cs), body = s.slice(cs);
    const used = new Set([...body.matchAll(/\bt\("([A-Za-z0-9_]+)"\)|fmt\(t, "([A-Za-z0-9_]+)"/g)].map((m) => m[1] || m[2]));
    const has = (d, k) => new RegExp(`\\n {6}${k}:`).test(d);
    assert.deepEqual([...used].filter((k) => !has(zh, k) || !has(en, k)), []);
  });
});

