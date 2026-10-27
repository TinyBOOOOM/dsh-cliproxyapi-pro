// Host accounts tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeState, mergeHostConfig, newAccountDefaults, accountConflicts, recommendModels, apply } from "../../lib/index.js";

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json, fakeServers, SERVERS } from "../helpers/host-catalog.mjs";
import { harness } from "../helpers/host-harness.mjs";

describe("multi-account", () => {
  it("migrates a legacy single-account state into accounts[0] unchanged", () => {
    const legacy = {
      enabled: true,
      provider: "cli-proxy",
      displayName: "CLI Proxy API",
      baseURL: "https://cpa.example/",
      apiKeyEnv: "CLI_PROXY_API_KEY",
      protocol: "openai-completions",
      protocolMode: "auto",
      refreshIntervalSeconds: 120,
      probeTimeoutMs: 5000,
      includePrefix: "",
      excludePrefix: "",
      selectedModels: ["gpt-6.1-sol"],
      modelOverrides: { "gpt-6.1-sol": { maxTokens: 1000 } },
    };
    const state = normalizeState(legacy);
    assert.equal(state.version, 2);
    assert.equal(state.refreshIntervalSeconds, 120);
    assert.equal(state.accounts.length, 1);
    const [account] = state.accounts;
    assert.equal(account.id, "default");
    assert.equal(account.provider, "cli-proxy");
    assert.equal(account.baseURL, "https://cpa.example/");
    assert.deepEqual(account.selectedModels, ["gpt-6.1-sol"]);
    assert.deepEqual(account.modelOverrides, { "gpt-6.1-sol": { maxTokens: 1000 } });
    assert.equal("refreshIntervalSeconds" in account, false);

    // Normalizing twice is stable, and an empty file still yields one account.
    assert.deepEqual(normalizeState(state), state);
    assert.equal(normalizeState({}).accounts[0].id, "default");
    // An explicit empty list stays empty.
    assert.equal(normalizeState({ accounts: [] }).accounts.length, 0);
    // Duplicate ids are renamed.
    const dup = normalizeState({ accounts: [{ id: "x" }, { id: "x", provider: "p2" }] });
    assert.deepEqual(dup.accounts.map((a) => a.id), ["x", "account-2"]);
    // Flat host config applies to the first account only.
    const merged = normalizeState(mergeHostConfig(state, { baseURL: "http://other:8317" }));
    assert.equal(merged.accounts[0].baseURL, "http://other:8317");
  });

  it("gives new accounts unique routes and credential refs, disabled by default", () => {
    const state = normalizeState({});
    const next = newAccountDefaults(state.accounts);
    assert.equal(next.id, "account-2");
    assert.equal(next.provider, "cli-proxy-2");
    assert.equal(next.apiKeyEnv, "CLI_PROXY_API_KEY_2");
    assert.equal(next.enabled, false);
    assert.deepEqual(newAccountDefaults([]).provider, "cli-proxy");
    // `cli-proxy-responses` as a provider overlaps cli-proxy's Responses route.
    const conflicts = accountConflicts([
      { id: "a", provider: "cli-proxy" },
      { id: "b", provider: "cli-proxy-responses" },
    ]);
    assert.equal(conflicts.get("b"), "a");
  });

  it("syncs each account into its own routes and disables one without touching the other", async () => {
    const h = harness(
      {
        accounts: [
          { id: "default", baseURL: "http://a.test", selectedModels: [] },
        ],
      },
      SERVERS
    );
    await h.controller.refreshAll();
    assert.deepEqual(Object.keys(h.providers).sort(), ["cli-proxy-messages", "cli-proxy-responses"]);

    // Add a second account: starts disabled, a probe lists its models, no routes.
    let payload = await h.controller.addAccount({ baseURL: "http://b.test", apiKey: "key-b" });
    const second = payload.accounts.find((a) => a.id === payload.createdId);
    assert.equal(second.config.provider, "cli-proxy-2");
    assert.equal(second.config.enabled, false);
    assert.equal(second.status.state, "disabled");
    assert.equal(second.status.allModels.length, 2);
    assert.equal(second.credential.configured, true);
    assert.equal(h.keys.CLI_PROXY_API_KEY_2, "key-b");
    assert.equal(h.providers["cli-proxy-2"], undefined);

    // Enable it.
    payload = await h.controller.updateAccount(second.id, { enabled: true });
    assert.equal(payload.accounts[1].status.state, "connected", payload.accounts[1].status.error);
    assert.deepEqual(h.providers["cli-proxy-2"].models.map((m) => m.id), ["gemini-4-argon"]);
    assert.deepEqual(h.providers["cli-proxy-2-responses"].models.map((m) => m.id), ["gpt-6-astra"]);
    assert.equal(h.providers["cli-proxy-2"].apiKeyEnv, "CLI_PROXY_API_KEY_2");
    assert.equal(h.providers["cli-proxy-2"].baseURL, "http://b.test/v1");
    assert.equal(h.providers["cli-proxy-messages"].baseURL, "http://a.test");

    // Disable the first one: only its routes go away.
    await h.controller.updateAccount("default", { enabled: false });
    assert.deepEqual(Object.keys(h.providers).sort(), ["cli-proxy-2", "cli-proxy-2-responses"]);
    assert.equal(h.state().accounts[0].enabled, false);

    // Re-enable it via its provider id.
    await h.controller.updateAccount("cli-proxy", { enabled: true });
    assert.ok(h.providers["cli-proxy-messages"]);

    // Remove the second one: its routes go, the first stays.
    payload = await h.controller.removeAccount(second.id);
    assert.equal(payload.accounts.length, 1);
    assert.deepEqual(Object.keys(h.providers).sort(), ["cli-proxy-messages", "cli-proxy-responses"]);
  });

  it("rejects overlapping provider routes and never falls back from an explicit URL", async () => {
    const h = harness(
      {
        accounts: [
          { id: "default", baseURL: "http://a.test", selectedModels: [] },
          { id: "b", provider: "cli-proxy-b", baseURL: "http://down.test", apiKeyEnv: "K_B", selectedModels: [] },
        ],
      },
      SERVERS
    );
    await assert.rejects(
      h.controller.updateAccount("b", { provider: "cli-proxy-messages" }),
      /overlaps the routes/
    );
    assert.equal(h.state().accounts[1].provider, "cli-proxy-b");

    await h.controller.refreshAll();
    const payload = await h.controller.statusPayload();
    assert.equal(payload.accounts[0].status.state, "connected");
    assert.equal(payload.accounts[1].status.state, "error");
    assert.match(payload.accounts[1].status.error, /down\.test/);
    assert.doesNotMatch(payload.accounts[1].status.error, /127\.0\.0\.1/);
    assert.equal(h.providers["cli-proxy-b"], undefined);
  });

  it("leaves another account's routes alone when the state has an overlap", async () => {
    const h = harness(
      {
        accounts: [
          { id: "default", baseURL: "http://a.test", selectedModels: [] },
          { id: "dup", provider: "cli-proxy", enabled: false, baseURL: "http://b.test" },
        ],
      },
      SERVERS
    );
    await h.controller.refreshAll();
    const payload = await h.controller.statusPayload();
    assert.equal(payload.accounts[1].status.state, "error");
    assert.ok(h.providers["cli-proxy-messages"], "the disabled duplicate must not remove the first account's routes");
  });

  it("recommends the newest model of each family from the catalog itself", () => {
    const m = (id, name) => ({ id, ...(name ? { name } : {}), inputModalities: ["text"], reasoning: false, reasoningLevels: [] });
    const ids = recommendModels([
      m("gpt-5.5"),
      m("vendor/gpt-6.1", "GPT 6.1"),
      m("gpt-6.1"),
      m("claude-sonnet-4-6"),
      m("claude-opus-5-5"),
      m("gemini-3-flash"),
      m("kimi-k3"),
    ]);
    assert.deepEqual(ids, ["gpt-6.1", "claude-opus-5-5", "gemini-3-flash", "kimi-k3"]);
    assert.deepEqual(recommendModels([]), []);
    const many = Array.from({ length: 30 }, (_, i) => m(`fam${String.fromCharCode(97 + (i % 26))}${i}-1`));
    assert.equal(recommendModels(many).length, 12);
  });

  it("seeds a first-run selection from the server's catalog instead of fixed ids", async () => {
    // No selectedModels saved anywhere: a fresh install talking to an arbitrary CPA.
    const h = harness({ accounts: [{ id: "default", baseURL: "http://b.test" }] }, {
      "b.test": {
        models: [
          { slug: "gemini-4-argon", owned_by: "google" },
          { slug: "gemini-3-flash", owned_by: "google" },
          { slug: "gpt-6-astra", owned_by: "openai" },
          { slug: "gpt-5", owned_by: "openai" },
        ],
      },
    });
    await h.controller.refreshAll();
    let payload = await h.controller.statusPayload();
    const [account] = payload.accounts;
    assert.equal(account.status.state, "connected", account.status.error);
    assert.deepEqual(h.state().accounts[0].selectedModels, ["gemini-4-argon", "gpt-6-astra"]);
    assert.deepEqual(h.providers["cli-proxy"].models.map((x) => x.id), ["gemini-4-argon"]);
    assert.deepEqual(h.providers["cli-proxy-responses"].models.map((x) => x.id), ["gpt-6-astra"]);
    assert.deepEqual(account.recommendedModels, ["gemini-4-argon", "gpt-6-astra"]);

    // Seeding happens once: a later explicit choice is kept, even an empty one ("all").
    await h.controller.updateAccount("default", { selectedModels: [] });
    await h.controller.refreshAll();
    assert.deepEqual(h.state().accounts[0].selectedModels, []);
    assert.equal(h.providers["cli-proxy"].models.length, 2);

    // A saved selection the server does not offer reports a clear error but keeps the catalog visible.
    await h.controller.updateAccount("default", { selectedModels: ["not-on-this-server"] });
    payload = await h.controller.statusPayload();
    assert.equal(payload.accounts[0].status.state, "error");
    assert.match(payload.accounts[0].status.error, /none of the selected models/);
    assert.equal(payload.accounts[0].status.allModels.length, 4);
  });

  it("seeds a new disabled account on its first probe and keeps an unset selection on save", async () => {
    const h = harness({ accounts: [{ id: "default", baseURL: "http://a.test", selectedModels: [] }] }, SERVERS);
    const added = await h.controller.addAccount({ displayName: "No URL yet" });
    const id = added.createdId;
    assert.equal(h.state().accounts[1].selectedModels, undefined);
    assert.equal(added.accounts[1].config.selectionSaved, false);
    // Saving other fields before any catalog was seen leaves it unset.
    await h.controller.updateAccount(id, { baseURL: "http://b.test", apiKey: "key-b" });
    assert.deepEqual(h.state().accounts[1].selectedModels, ["gemini-4-argon", "gpt-6-astra"]);
    assert.equal(h.providers["cli-proxy-2"], undefined, "still disabled");
  });

  it("apply() migrates the legacy state file and serves commands and routes, but no agent tool", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-test-"));
    const stateDir = join(dir, ".dsh-cliproxyapi");
    mkdirSync(stateDir, { recursive: true });
    const legacy = {
      enabled: true,
      provider: "cli-proxy",
      displayName: "CLI Proxy API",
      baseURL: "http://a.test/",
      apiKeyEnv: "CLI_PROXY_API_KEY",
      protocolMode: "auto",
      refreshIntervalSeconds: 300,
      selectedModels: ["claude-opus-5-5"],
      modelOverrides: {},
    };
    writeFileSync(join(stateDir, "state.json"), JSON.stringify(legacy));

    const providers = {
      "cli-proxy-messages": { api: "anthropic-messages", baseURL: "http://a.test", models: [{ id: "claude-opus-5-5" }], apiKeyEnv: "CLI_PROXY_API_KEY" },
    };
    const creds = { CLI_PROXY_API_KEY: "key-a" };
    const disposers = [];
    const tools = [];
    const injected = [];
    const commands = [];
    const routes = new Map();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fakeServers(SERVERS);
    const ctx = {
      settings: {
        describe: () => [{ ns: "llm-pi-ai", value: { providers } }],
        mutate: async (ns, ops) => {
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
              set: async (ref, v) => {
                creds[ref] = v;
              },
              unset: async (ref) => {
                delete creds[ref];
              },
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
      commands: { register: (c) => (commands.push(c), () => commands.splice(commands.indexOf(c), 1)) },
      tools: { register: (t) => (tools.push(t), () => {}) },
      webServer: { register: (r) => (routes.set(r.path, r.handler), () => {}) },
    };
    const post = async (path, payload) => {
      const body = JSON.stringify(payload);
      const req = {
        method: "POST",
        headers: { host: "127.0.0.1:1" },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(body);
        },
      };
      let sent;
      const res = { writeHead: (code) => (sent = { code }), end: (text) => (sent.body = JSON.parse(text)) };
      await routes.get(path)(req, res);
      return sent;
    };
    try {
      apply(ctx, {});
      const saved = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8"));
      assert.equal(saved.version, 2);
      assert.equal(saved.accounts[0].id, "default");
      assert.deepEqual(saved.accounts[0].selectedModels, ["claude-opus-5-5"]);
      assert.ok(existsSync(join(stateDir, "state.v1.json")));

      // No agent tool: nothing is added to model context.
      // The optional agent tool waits for the tools service but registers nothing while switched off.
      assert.equal(tools.length, 0);
      // Generation is off on a profile that never used it: only the account commands exist.
      assert.deepEqual(commands.map((c) => c.name).sort(), ["cpa-refresh", "cpa-status"]);

      // The master switch registers the generation commands, and removes them again.
      let sent = await post("/api/dsh-cliproxyapi/media/save", { enabled: true });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.media.settings.enabled, true);
      assert.deepEqual(commands.map((c) => c.name).sort(), ["cpa-image", "cpa-refresh", "cpa-status", "cpa-video", "cpa-video-edit", "cpa-video-extend", "cpa-video-status"]);
      assert.equal(commands.find((c) => c.name === "cpa-video").input.attachments, true);
      assert.equal(commands.find((c) => c.name === "cpa-image").input.attachments, true);
      sent = await post("/api/dsh-cliproxyapi/media/save", { enabled: false });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(JSON.parse(readFileSync(join(stateDir, "media-settings.json"), "utf8")).enabled, false);
      assert.deepEqual(commands.map((c) => c.name).sort(), ["cpa-refresh", "cpa-status"]);
      sent = await post("/api/dsh-cliproxyapi/media/save", { enabled: "yes" });
      assert.equal(sent.code, 400);

      sent = await post("/api/dsh-cliproxyapi/refresh", {});
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.accounts[0].status.state, "connected");
      assert.deepEqual(providers["cli-proxy-messages"].models.map((m) => m.id), ["claude-opus-5-5"]);

      sent = await post("/api/dsh-cliproxyapi/accounts/add", {
        baseURL: "http://b.test",
        apiKey: "key-b",
        displayName: "Backup",
        selectedModels: ["gpt-6-astra"],
        enabled: true,
      });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.createdId, "account-2");
      assert.equal(sent.body.accounts[1].config.enabled, true);
      assert.equal(sent.body.accounts[1].status.state, "connected");
      assert.equal(providers["cli-proxy-2-responses"].displayName, "Backup (OpenAI Responses)");

      sent = await post("/api/dsh-cliproxyapi/save", { accountId: "account-2", enabled: false });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.accounts[1].status.state, "disabled");
      assert.equal(providers["cli-proxy-2-responses"], undefined);

      const status = await commands.find((c) => c.name === "cpa-status").handler();
      assert.match(status.text, /accounts: 2 \(1 enabled\)/);
      assert.match(status.text, /disabled/);

      // HTTP route: remove the second account.
      sent = await post("/api/dsh-cliproxyapi/accounts/remove", { accountId: "account-2" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.accounts.length, 1);
      assert.equal(JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")).accounts.length, 1);
    } finally {
      globalThis.fetch = realFetch;
      for (const d of disposers) d();
    }
  });
});
