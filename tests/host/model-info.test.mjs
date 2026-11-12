// Online model info: parsing, matching, limits and the cached download service (lib/host/model-info.js).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MODEL_INFO_SOURCES,
  MODEL_INFO_TTL_MS,
  MODEL_INFO_RETRY_MS,
  ONLINE_MAX_TOKENS_CAP,
  buildIndex,
  createModelInfo,
  lookupModel,
  parseModelsDev,
  parseOpenRouter,
  withOnlineLimits,
} from "../../lib/host/model-info.js";
import { modelsDevPayload, onlineLookup, openRouterPayload } from "../helpers/model-fixtures.mjs";

const model = (id, extra = {}) => ({ id, inputModalities: ["text"], reasoningLevels: [], ...extra });
const respond = (body, init = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(init.headers ?? {}) }, ...init });

/** A fake fetch serving both sources; records every request. */
function sources({ modelsDev = modelsDevPayload(), openRouter = openRouterPayload(), fail = false } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (fail) throw new Error("getaddrinfo ENOTFOUND");
    if (String(url) === MODEL_INFO_SOURCES.modelsDev.url) {
      if (init.headers["If-None-Match"] === '"md-1"') return new Response(null, { status: 304 });
      return respond(modelsDev, { headers: { etag: '"md-1"' } });
    }
    if (String(url) === MODEL_INFO_SOURCES.openRouter.url) return respond(openRouter);
    throw new Error(`unexpected ${url}`);
  };
  return { fetch, calls };
}

function service(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cpa-info-"));
  let clock = Date.parse("2026-11-11T00:00:00Z");
  const warnings = [];
  let on = true;
  const info = createModelInfo({
    cachePath: join(dir, "model-info.json"),
    enabled: () => on,
    now: () => clock,
    logger: { warn: (msg) => warnings.push(msg) },
    ...extra,
  });
  return { info, dir, warnings, tick: (ms) => (clock += ms), setEnabled: (v) => (on = v) };
}

describe("online model info parsing", () => {
  it("prefers the canonical provider over resellers and matches CPA spellings", () => {
    const lookup = onlineLookup();
    const md = modelsDevPayload();
    const fable = lookup(model("claude-fable-5-2"));
    assert.equal(fable.family, "claude-fable");
    assert.equal(fable.released, "2026-11-09");
    assert.equal(fable.costOutput, md.anthropic.models["claude-fable-5-2"].cost.output, "first-party price, not a reseller's");
    assert.equal(fable.intelligence, 64.6, "OpenRouter's `claude-fable-5.2` matches too");
    assert.equal(fable.exact, true);
    assert.equal(lookup(model("devin/claude-5-fable")).family, "claude-fable", "word order and prefixes do not matter");
    assert.equal(lookup(model("devin/model_private_11", { name: "Claude Haiku 4.5 (Devin)" })).family, "claude-haiku", "opaque ids match by name");
    assert.equal(lookup(model("devin/claude-opus-4-6-1m")).exact, false, "a variant matches its base only loosely");
    assert.equal(lookup(model("devin/inkling")), undefined);
    assert.equal(lookup(model("devin/deepseek-v4-flash")).status, "deprecated");
  });

  it("rejects payloads that are not catalogs and skips OpenRouter billing variants", () => {
    assert.throws(() => parseModelsDev([]), /not an object/);
    assert.throws(() => parseModelsDev({ x: { models: {} } }), /no models/);
    assert.throws(() => parseOpenRouter({}), /no data/);
    const entries = parseOpenRouter({ data: [{ id: "a/x-1:batch" }, { id: "a/x-1", created: 86400, expiration_date: "2027-01-02" }] });
    assert.deepEqual(entries, [{ id: "a/x-1", rank: 0, released: "1970-01-02", expires: "2027-01-02" }]);
    const index = buildIndex(entries);
    assert.equal(lookupModel({ openRouter: index }, model("x-1")).expires, "2027-01-02");
  });

  it("fills only limits the catalog left out, from exact matches, with a capped output", () => {
    const info = { exact: true, context: 1_000_000, output: 500_000 };
    assert.deepEqual(withOnlineLimits(model("x"), info), { ...model("x"), contextWindow: 1_000_000, maxTokens: ONLINE_MAX_TOKENS_CAP, onlineLimits: ["contextWindow", "maxTokens"] });
    const known = model("x", { contextWindow: 200_000, maxTokens: 64_000 });
    assert.equal(withOnlineLimits(known, info), known, "catalog values always win");
    assert.equal(withOnlineLimits(model("x"), { ...info, exact: false }).contextWindow, undefined, "loose matches never set limits");
    assert.equal(withOnlineLimits(model("x"), { exact: true, context: 8000, output: 32000 }).maxTokens, 8000, "never above the context window");
  });
});

describe("online model info service", () => {
  it("downloads once a day with plain GETs and caches a compact index", async () => {
    const { fetch, calls } = sources();
    const { info } = service({ fetch });
    assert.equal(info.status().state, "idle");
    assert.equal(await info.refresh(), true);
    assert.deepEqual(calls.map((c) => c.url), [MODEL_INFO_SOURCES.modelsDev.url, MODEL_INFO_SOURCES.openRouter.url]);
    for (const call of calls) {
      assert.equal(call.init.method, "GET");
      assert.deepEqual(Object.keys(call.init.headers), ["Accept"], "nothing but Accept is sent");
      assert.equal(call.init.body, undefined);
    }
    assert.equal(info.lookup(model("claude-fable-5-2")).family, "claude-fable");
    const status = info.status();
    assert.equal(status.state, "ready");
    assert.ok(status.sources.modelsDev.models > 50 && status.sources.openRouter.models > 50);
    assert.equal(await info.refresh(), false, "within a day nothing is fetched");
    assert.equal(calls.length, 2);
  });

  it("revalidates with the ETag after a day and survives failures with the cached data", async () => {
    const { fetch, calls } = sources();
    const s = service({ fetch });
    await s.info.refresh();
    s.tick(MODEL_INFO_TTL_MS + 1);
    await s.info.refresh();
    assert.equal(calls[2].init.headers["If-None-Match"], '"md-1"', "models.dev is revalidated, a 304 keeps its data");
    assert.equal(s.info.lookup(model("claude-opus-5-5")).family, "claude-opus");

    // A fresh instance reads the cache from disk; a failing network keeps it usable.
    const cachePath = join(s.dir, "model-info.json");
    assert.ok(existsSync(cachePath));
    assert.ok(!readFileSync(cachePath, "utf8").includes("description"), "only the compact fields are cached");
    const broken = sources({ fail: true });
    const again = createModelInfo({ cachePath, fetch: broken.fetch, now: () => Date.now() + 2 * MODEL_INFO_TTL_MS, logger: { warn() {} } });
    assert.equal(again.lookup(model("claude-opus-5-5")).family, "claude-opus");
    await again.refresh();
    assert.equal(again.lookup(model("claude-opus-5-5")).family, "claude-opus");
    assert.equal(again.status().sources.modelsDev.error, "getaddrinfo ENOTFOUND");
    assert.equal(again.status().state, "partial");
    await again.refresh();
    assert.equal(broken.calls.length, 2, `a failed source waits ${MODEL_INFO_RETRY_MS / 60000} minutes before retrying`);
  });

  it("does nothing and answers nothing while switched off", async () => {
    const { fetch, calls } = sources();
    const s = service({ fetch });
    s.setEnabled(false);
    assert.equal(await s.info.refresh({ force: true }), false);
    await s.info.ready(10);
    assert.equal(calls.length, 0);
    assert.equal(s.info.status().state, "off");
    s.setEnabled(true);
    await s.info.refresh();
    s.setEnabled(false);
    assert.equal(s.info.lookup(model("claude-opus-5-5")), undefined, "cached data is not used while off");
  });

  it("rejects oversized or invalid bodies and stops waiting after the timeout", async () => {
    const big = service({
      fetch: async () => new Response("{}", { status: 200, headers: { "content-length": String(MODEL_INFO_SOURCES.modelsDev.maxBytes + 1) } }),
    });
    await big.info.refresh();
    assert.equal(big.info.status().sources.modelsDev.error, "response too large");
    assert.match(big.warnings[0], /models\.dev/);
    const invalid = service({ fetch: async () => respond("<html>") });
    await invalid.info.refresh();
    assert.equal(invalid.info.status().state, "error");

    const hanging = service({ fetch: () => new Promise(() => {}) });
    const started = Date.now();
    await hanging.info.ready(30);
    assert.ok(Date.now() - started < 2000, "ready() gives up after its timeout");
    hanging.info.dispose();
  });
});
