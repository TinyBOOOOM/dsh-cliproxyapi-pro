import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, normalizeState, ROUTES } from "../lib/index.js";

function fixture(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cpa-updates-http-"));
  const configDir = join(dir, ".dsh-cliproxyapi");
  mkdirSync(configDir);
  writeFileSync(join(configDir, "state.json"), JSON.stringify(normalizeState({ accounts: [] })));
  writeFileSync(join(configDir, "update-settings.json"), JSON.stringify({ version: 1, autoCheck: false, ...options.settings }));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { "dsh-cliproxyapi-pro": options.source ?? "1.4.1" } }));
  const routes = new Map(), disposers = [];
  let reject;
  const connection = { trustedHosts: ["public.test"], requestRejection: () => reject };
  const ctx = {
    settings: { describe: () => [], mutate: async () => assert.fail("updates must not write DSH settings") },
    get: (name) => name === "profileContext" ? { dir, name: "fixture" } : name === "connection" ? connection : name === "hmr" && options.onHmrExit ? { executing: { exit: (fn) => { options.onHmrExit(); return fn(); } } } : undefined,
    on() {},
    effect(fn) { const dispose = fn(); if (typeof dispose === "function") disposers.push(dispose); },
    inject(_deps, fn) { fn(ctx); },
    commands: { register: () => () => {} },
    tools: { register: () => () => {} },
    webServer: { register: (route) => { routes.set(route.path, route.handler); return () => routes.delete(route.path); } },
    logger: { info() {}, warn() {} },
  };
  // Capture a dispatcher, never the process's real network implementation.
  const initialFetch = globalThis.fetch;
  const fixtureFetch = (...args) => {
    assert.notEqual(globalThis.fetch, initialFetch, "this test must install a fake fetch");
    assert.notEqual(globalThis.fetch, fixtureFetch);
    return globalThis.fetch(...args);
  };
  globalThis.fetch = fixtureFetch;
  try { apply(ctx, {}); } finally { globalThis.fetch = initialFetch; }
  return {
    dir, configDir, routes, connection,
    reject(value) { reject = value; },
    async call(path, { method = "POST", body = {}, headers = {}, socket = {} } = {}) {
      const req = {
        method, socket,
        headers: { host: "127.0.0.1:9000", origin: "http://127.0.0.1:9000", ...headers },
        async *[Symbol.asyncIterator]() { yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body)); },
      };
      let response;
      await routes.get(path)(req, { writeHead(code) { response = { code }; }, end(text) { response.body = JSON.parse(text); } });
      return response;
    },
    dispose() { for (const dispose of disposers.reverse()) dispose(); rmSync(dir, { recursive: true, force: true }); },
  };
}

const metadata = { name: "dsh-cliproxyapi-pro", version: "1.5.0", dist: { tarball: "https://registry.npmjs.org/dsh-cliproxyapi-pro/-/dsh-cliproxyapi-pro-1.5.0.tgz", integrity: `sha512-${Buffer.alloc(64).toString("base64")}` } };

describe("plugin update HTTP integration", () => {
  it("owns update timers outside HMR and clears them when disabled or disposed", async () => {
    const originals = { setTimeout, setInterval, clearTimeout, clearInterval };
    const timers = new Map();
    let next = 0, exits = 0, h;
    globalThis.setTimeout = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; };
    globalThis.setInterval = globalThis.setTimeout;
    globalThis.clearTimeout = globalThis.clearInterval = (id) => timers.delete(id);
    try {
      h = fixture({ settings: { autoCheck: true }, onHmrExit: () => exits++ });
      assert.ok([...timers.values()].some((t) => t.ms === 3000));
      assert.ok([...timers.values()].some((t) => t.ms === 6 * 60 * 60 * 1000));
      assert.ok(exits >= 3, "update and CPA timers leave HMR context");
      const result = await h.call(ROUTES.updateSave, { body: { autoCheck: false } });
      assert.equal(result.code, 200);
      assert.equal([...timers.values()].some((t) => t.ms === 3000 || t.ms === 6 * 60 * 60 * 1000), false);
      h.dispose(); h = null;
      assert.equal(timers.size, 0);
    } finally {
      h?.dispose();
      Object.assign(globalThis, originals);
    }
  });
  it("serves read-only status and saves isolated preferences without account/settings writes", async () => {
    const h = fixture({ source: "link:D:\\example\\source" });
    const before = readFileSync(join(h.configDir, "state.json"), "utf8");
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail("status/save must not fetch");
    try {
      const status = await h.call(ROUTES.updateStatus, { method: "GET" });
      assert.equal(status.code, 200);
      assert.equal(status.body.update.autoCheck, false);
      assert.equal(status.body.update.blockedReason, "linked-install");
      assert.equal(status.body.update.upgradeCommand, null);
      assert.match(status.body.update.currentVersion, /^\d+\.\d+\.\d+/);
      const saved = await h.call(ROUTES.updateSave, { body: { region: "cn", channel: "beta", autoDownload: true, autoInstall: true } });
      assert.equal(saved.code, 200);
      assert.equal(saved.body.update.region, "cn");
      assert.equal(saved.body.update.channel, "beta");
      const disk = JSON.parse(readFileSync(join(h.configDir, "update-settings.json"), "utf8"));
      assert.equal(disk.version, 1);
      assert.equal(disk.autoDownload, true);
      assert.equal(disk.autoInstall, true);
      assert.equal(saved.body.update.autoInstall, true);
      assert.equal(before, readFileSync(join(h.configDir, "state.json"), "utf8"));
    } finally { globalThis.fetch = realFetch; h.dispose(); }
  });

  it("enforces host authentication and same-authority origins before network operations", async () => {
    const h = fixture();
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = async () => { fetched++; return new Response(JSON.stringify(metadata)); };
    try {
      h.reject(401);
      assert.equal((await h.call(ROUTES.updateStatus, { method: "GET" })).code, 401);
      assert.equal((await h.call(ROUTES.updateCheck)).code, 401);
      h.reject(undefined);
      for (const headers of [
        { origin: "null" }, { origin: "broken" }, { origin: "file:///etc/passwd" },
        { host: undefined },
        { origin: "http://127.0.0.1:9001" },
        { origin: "http://evil.test" }, { origin: "http://user:pass@127.0.0.1:9000" },
        { "sec-fetch-site": "cross-site" },
        { host: "evil.test", origin: "http://evil.test" },
      ]) {
        assert.equal((await h.call(ROUTES.updateCheck, { headers })).code, 403, JSON.stringify(headers));
      }
      assert.equal((await h.call(ROUTES.updateCheck, { method: "GET" })).code, 405);
      assert.equal(fetched, 0);
      // The desktop shell proxies API calls without an Origin header; the host
      // session check already rejected anonymous callers above, so this is allowed.
      assert.equal((await h.call(ROUTES.updateCheck, { headers: { origin: undefined } })).code, 200);
      // The scheme comes from the Origin itself, exactly as the host fence does.
      assert.equal((await h.call(ROUTES.updateCheck, { headers: { origin: "https://127.0.0.1:9000" } })).code, 200);
      const success = await h.call(ROUTES.updateCheck, { headers: { host: "public.test", origin: "https://public.test" } });
      assert.equal(success.code, 200);
      assert.equal(success.body.update.latestVersion, "1.5.0");
    } finally { globalThis.fetch = realFetch; h.dispose(); }
  });

  it("validates update-only bodies and never accepts arbitrary sources or commands", async () => {
    const h = fixture();
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail("invalid inputs must not fetch");
    try {
      for (const body of [{ region: "http://evil.test" }, { registry: "https://evil.test" }, { channel: "main" }, { autoCheck: "yes" }, [], "null", "{bad", { channel: "x".repeat(9000) }]) {
        const res = await h.call(ROUTES.updateSave, { body });
        assert.equal(res.code, 400);
        assert.equal(res.body.ok, false);
        assert.ok(res.body.errorCode);
      }
      assert.equal((await h.call(ROUTES.updateCheck, { body: { url: "https://evil.test" } })).code, 400);
      assert.equal((await h.call(ROUTES.updateDownload, { body: { version: "1.5.0", command: "whoami" } })).code, 400);
      assert.equal((await h.call(ROUTES.updateDownload, { body: { version: "1.5.0" } })).body.errorCode, "stale-version");
    } finally { globalThis.fetch = realFetch; h.dispose(); }
  });

  it("reports network errors without disclosing raw exception details", async () => {
    const h = fixture({ settings: { region: "global" } });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("secret/private/path/token"); };
    try {
      const res = await h.call(ROUTES.updateCheck);
      assert.equal(res.code, 200);
      assert.equal(res.body.update.errorCode, "network-error");
      assert.equal(JSON.stringify(res).includes("secret"), false);
      assert.equal((await h.call(ROUTES.status, { method: "GET" })).body.accounts.length, 0);
    } finally { globalThis.fetch = realFetch; h.dispose(); }
  });
});
