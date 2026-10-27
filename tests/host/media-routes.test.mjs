// Host media-routes tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../../lib/index.js";

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json, fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
  it("apply() serves media status, save and the read-only diagnostic, still without an agent tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-media-apply-"));
    const stateDir = join(dir, ".dsh-cliproxyapi");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, "state.json"),
      JSON.stringify({ version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] })
    );
    const providers = {};
    const creds = { CLI_PROXY_API_KEY: "key-a" };
    const disposers = [];
    const tools = [];
    const injected = [];
    const routes = new Map();
    const calls = [];
    const realFetch = globalThis.fetch;
    const serve = fakeServers(MEDIA_SERVERS);
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), auth: init?.headers?.Authorization });
      if (String(url).includes("dsh-diagnostic-probe")) return new Response("{}", { status: 401 });
      return serve(url, init);
    };
    const ctx = {
      settings: {
        describe: () => [{ ns: "llm-pi-ai", value: { providers } }],
        mutate: async (_ns, ops) => {
          for (const op of ops) {
            if (op.op === "set") providers[op.path[1]] = op.value;
            else delete providers[op.path[1]];
          }
        },
      },
      get: (name) =>
        name === "profileContext"
          ? { dir }
          : name === "credentials"
          ? {
              resolve: async (ref) => (creds[ref] === undefined ? undefined : { value: creds[ref] }),
              describe: async (ref) => ({ configured: creds[ref] !== undefined, writable: true }),
              set: async () => {},
              unset: async () => {},
            }
          : undefined,
      on: () => {},
      effect: (fn) => {
        const d = fn();
        if (typeof d === "function") disposers.push(d);
      },
      inject: (deps, fn) => {
        injected.push(...deps);
        fn(sub);
      },
      logger: { info() {}, warn() {} },
    };
    const sub = {
      ...ctx,
      commands: { register: () => () => {} },
      tools: { register: (t) => (tools.push(t), () => {}) },
      webServer: { register: (r) => (routes.set(r.path, r.handler), () => {}) },
    };
    const call = async (method, path, payload) => {
      const body = payload === undefined ? "" : JSON.stringify(payload);
      const req = {
        method,
        headers: { host: "127.0.0.1:1" },
        async *[Symbol.asyncIterator]() {
          if (body !== "") yield Buffer.from(body);
        },
      };
      let sent;
      const res = { writeHead: (code) => (sent = { code }), end: (text) => (sent.body = JSON.parse(text)) };
      await routes.get(path)(req, res);
      return sent;
    };
    try {
      apply(ctx, {});
      // The optional agent tool waits for the tools service but registers nothing while switched off.
      assert.equal(tools.length, 0);
      await call("POST", "/api/dsh-cliproxyapi/refresh", {});

      let sent = await call("GET", "/api/dsh-cliproxyapi/media/status");
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.media.settings.agentTool, false);
      assert.equal(sent.body.media.settings.videoConfirm, "ask");
      const account = sent.body.media.accounts[0];
      assert.deepEqual(account.models.map((m) => [m.id, m.kind, m.enabled]), [
        ["grok-imagine-image", "image", true],
        ["grok-imagine-video-1.5", "video", true],
      ]);

      sent = await call("POST", "/api/dsh-cliproxyapi/media/save", {
        account: { accountId: "default", disabledModels: ["grok-imagine-video-1.5"] },
      });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.status, undefined, "no re-sync without a kind change");
      assert.equal(sent.body.media.accounts[0].models[1].enabled, false);
      const saved = JSON.parse(readFileSync(join(stateDir, "media-settings.json"), "utf8"));
      assert.deepEqual(saved.accounts.default.disabledModels, ["grok-imagine-video-1.5"]);
      assert.equal(JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")).version, 2, "account state is a separate file");

      sent = await call("POST", "/api/dsh-cliproxyapi/media/save", {
        account: { accountId: "default", kindOverrides: { "grok-imagine-image": "chat" } },
      });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.ok(Array.isArray(sent.body.status.accounts), "a kind change returns the re-synced account status");
      assert.ok(Object.values(providers).some((r) => r.models.some((m) => m.id === "grok-imagine-image")));

      sent = await call("POST", "/api/dsh-cliproxyapi/media/save", { defaultVideoSeconds: 99 });
      assert.equal(sent.code, 400);
      assert.equal(sent.body.error, "invalid-video-seconds");
      sent = await call("POST", "/api/dsh-cliproxyapi/media/save", { account: { accountId: "ghost", disabledModels: [] } });
      assert.equal(sent.code, 400);
      assert.equal(sent.body.error, "invalid-account");

      calls.length = 0;
      sent = await call("POST", "/api/dsh-cliproxyapi/media/diagnose", { accountId: "default" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.diagnostic.keyConfigured, true);
      assert.equal(sent.body.diagnostic.catalogs.enriched.ok, true);
      assert.deepEqual(sent.body.diagnostic.routes.map((r) => r.verdict), ["present", "present"]);
      assert.ok(calls.filter((c) => c.url.includes("dsh-diagnostic-probe")).every((c) => c.auth === undefined));
      assert.ok(!JSON.stringify(sent.body).includes("key-a"), "the key is never returned");
      sent = await call("POST", "/api/dsh-cliproxyapi/media/diagnose", {});
      assert.equal(sent.code, 400);
    } finally {
      globalThis.fetch = realFetch;
      for (const d of disposers) d();
    }
  });

  it("media/session reports an incomplete catalog while the plain listing is unreadable", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("client_version=pi")) {
        return json({ models: [{ slug: "grok-4.6" }, { slug: "grok-imagine-video" }] });
      }
      throw new Error("ETIMEDOUT");
    };
    const m = mountPlugin({
      state: { version: 2, probeTimeoutMs: 100, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
    });
    try {
      const view = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.equal(view.code, 200, JSON.stringify(view.body));
      assert.equal(view.body.session.catalogIncomplete, true, "the composer button keeps retrying");
      assert.deepEqual(view.body.session.options.video.map((o) => o.ref), ["default/grok-imagine-video"]);
      assert.deepEqual(view.body.session.options.image, [], "the enriched catalog alone has no image model");
    } finally {
      m.dispose();
    }
  });

  it("media/session re-reads a catalog whose plain listing failed and returns the image models", async () => {
    let listingCalls = 0;
    const fetchImpl = async (url) => {
      if (String(url).includes("client_version=pi")) {
        return json({ models: [{ slug: "grok-4.6" }, { slug: "grok-imagine-video" }] });
      }
      listingCalls += 1;
      if (listingCalls <= 2) throw new Error("ETIMEDOUT");
      return json({ data: [{ id: "grok-imagine-image-2.0", object: "model", type: "openai-image" }] });
    };
    const m = mountPlugin({
      state: { version: 2, probeTimeoutMs: 100, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
    });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      assert.equal(listingCalls, 2, "the first sync could not read the listing");
      const view = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.equal(view.code, 200, JSON.stringify(view.body));
      assert.equal(listingCalls, 3, "the composer request syncs once more");
      assert.equal(view.body.session.catalogIncomplete, false);
      assert.deepEqual(view.body.session.options.image.map((o) => o.ref), ["default/grok-imagine-image-2.0"]);
      assert.deepEqual(view.body.session.options.video.map((o) => o.ref), ["default/grok-imagine-video"]);
    } finally {
      m.dispose();
    }
  });
});
