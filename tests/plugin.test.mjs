import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCpaRoot,
  discoveryCandidates,
  parseCatalog,
  filterModels,
  sortModelsNewestFirst,
  buildPiAiRoutes,
  resolveConfig,
  applyModelOverride,
  nativeProtocol,
  CpaRuntime,
  normalizeState,
  mergeHostConfig,
  newAccountDefaults,
  accountConflicts,
  createCpaController,
  recommendModels,
  apply,
} from "../lib/index.js";
import { videoImageBudget } from "../lib/media.js";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** A fake CPA: `?client_version=pi` returns the enriched catalog, plain `/v1/models` the owners. */
function fakeCpa(models) {
  return async (url) =>
    String(url).includes("client_version=pi")
      ? json({ models: models.map(({ owned_by: _o, ...rest }) => rest) })
      : json({ data: models.map((m) => ({ id: m.slug, object: "model", owned_by: m.owned_by })) });
}

describe("dsh-cliproxyapi unit tests", () => {
  it("normalizes CLIProxyAPI root URLs properly", () => {
    assert.equal(normalizeCpaRoot("http://127.0.0.1:8317/v1"), "http://127.0.0.1:8317");
    assert.equal(normalizeCpaRoot("203.0.113.10:8317/v1/messages"), "http://203.0.113.10:8317");
    assert.equal(normalizeCpaRoot("https://example.com/cpa/v1/"), "https://example.com/cpa");
  });

  it("deduplicates discovery candidates in priority order", () => {
    const candidates = discoveryCandidates({
      baseURL: "http://127.0.0.1:8317/v1",
      fallbackBaseURL: "http://203.0.113.10:8317/v1",
      environmentBaseURL: "http://localhost:8317",
    });
    assert.equal(candidates[0], "http://127.0.0.1:8317");
    assert.equal(candidates[1], "http://203.0.113.10:8317");
    assert.ok(candidates.includes("http://localhost:8317"));
  });

  it("parses both enriched models[] and OpenAI data[] catalogs", () => {
    const models = parseCatalog({
      models: [
        {
          slug: "gpt-6.1-sol",
          display_name: "GPT 6.1 Sol",
          context_window: 500000,
          max_tokens: 128000,
          input_modalities: ["text", "image"],
          supported_reasoning_levels: [
            { effort: "low" },
            { effort: "high" },
            { effort: "ultra" },
          ],
          visibility: "list",
        },
        {
          slug: "hidden-model",
          visibility: "hide",
        },
      ],
    });
    assert.equal(models.length, 1);
    assert.equal(models[0].id, "gpt-6.1-sol");
    assert.equal(models[0].name, "GPT 6.1 Sol");
    assert.equal(models[0].contextWindow, 500000);
    assert.equal(models[0].maxTokens, 128000);
    assert.deepEqual(models[0].inputModalities, ["text", "image"]);
    assert.equal(models[0].reasoning, true);
    assert.deepEqual(models[0].reasoningLevels, ["low", "high", "max"]);
  });

  it("filters models by selectedModels, includePrefix, and excludePrefix", () => {
    const raw = [
      { id: "gpt-5.5", name: "GPT 5.5", inputModalities: ["text"], reasoning: false, reasoningLevels: [] },
      { id: "gpt-6.1-sol", name: "GPT 6.1 Sol", inputModalities: ["text", "image"], reasoning: true, reasoningLevels: ["low", "high"] },
      { id: "zj/gpt-6.1-sol", name: "GPT 6.1 Sol ZJ", inputModalities: ["text"], reasoning: false, reasoningLevels: [] },
    ];
    const filtered = filterModels(raw, { includePrefix: "gpt", excludePrefix: "zj/" });
    assert.equal(filtered.length, 2);
    const sorted = sortModelsNewestFirst(filtered);
    assert.equal(sorted[0].id, "gpt-6.1-sol");
    assert.equal(sorted[1].id, "gpt-5.5");

    // Only checked models should pass when selectedModels is non-empty
    const bySelection = filterModels(raw, { selectedModels: ["gpt-6.1-sol"] });
    assert.equal(bySelection.length, 1);
    assert.equal(bySelection[0].id, "gpt-6.1-sol");
  });

  it("picks each model's native protocol from its family", () => {
    const cases = [
      [{ id: "claude-opus-5-5", ownedBy: "anthropic" }, "anthropic-messages"],
      [{ id: "devin/claude-sonnet-5-5", ownedBy: "anthropic" }, "anthropic-messages"],
      [{ id: "claude-sonnet-4-6", ownedBy: "antigravity" }, "anthropic-messages"],
      [{ id: "gpt-6.1-sol", ownedBy: "openai" }, "openai-responses"],
      [{ id: "devin/gpt-5-3-codex", ownedBy: "openai" }, "openai-responses"],
      [{ id: "grok-4.7", ownedBy: "xai" }, "openai-responses"],
      [{ id: "gpt-oss-120b-medium", ownedBy: "antigravity" }, "openai-completions"],
      [{ id: "devin/gemini-4-argon", ownedBy: "google" }, "openai-completions"],
      [{ id: "gemini-3-flash", ownedBy: "antigravity" }, "openai-completions"],
      [{ id: "devin/swe-2", ownedBy: "cognition" }, "openai-completions"],
      [{ id: "devin/kimi-k3", ownedBy: "moonshot" }, "openai-completions"],
    ];
    for (const [model, expected] of cases) assert.equal(nativeProtocol(model), expected, model.id);
  });

  it("syncs one route per protocol, keeps user fields, and follows the default model", async () => {
    const providers = {
      "cli-proxy": {
        api: "openai-completions",
        baseURL: "http://127.0.0.1:8317/v1",
        models: [{ id: "claude-opus-5-5" }],
        retryPolicy: { mode: "normal", maxRetries: 2 },
      },
    };
    const defaultModel = { provider: "cli-proxy", model: "claude-opus-5-5" };
    const calls = [];
    const runtime = new CpaRuntime({
      settings: {
        mutate: async (ns, ops) => {
          calls.push({ ns, ops });
          for (const op of ops) {
            if (ns === "llm-pi-ai") {
              if (op.op === "set") providers[op.path[1]] = op.value;
              else delete providers[op.path[1]];
            } else if (ns === "agent-default-model") defaultModel.provider = op.value;
          }
        },
      },
      config: () =>
        resolveConfig({
          provider: "cli-proxy",
          baseURL: "http://127.0.0.1:8317",
          selectedModels: ["claude-opus-5-5", "gpt-6.1-sol", "gemini-3-flash"],
        }),
      resolveApiKey: async () => "sk-test",
      readExistingPiAiRoute: (key) => providers[key],
      readDefaultModel: () => ({ ...defaultModel }),
      fetch: fakeCpa([
        {
          slug: "claude-opus-5-5",
          owned_by: "anthropic",
          context_window: 1000000,
          input_modalities: ["text", "image"],
          supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "max" }],
        },
        {
          slug: "gpt-6.1-sol",
          owned_by: "openai",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "ultra" }],
        },
        { slug: "gemini-3-flash", owned_by: "antigravity", supported_reasoning_levels: [{ effort: "low" }] },
        { slug: "unselected", owned_by: "openai" },
      ]),
    });

    await runtime.refresh();
    const st = runtime.status();
    assert.equal(st.state, "connected", st.error);
    assert.equal(st.modelCount, 3);
    assert.equal(st.totalDiscovered, 4);
    assert.deepEqual(st.routes, ["cli-proxy", "cli-proxy-responses", "cli-proxy-messages"]);

    const chat = providers["cli-proxy"];
    assert.equal(chat.api, "openai-completions");
    assert.equal(chat.baseURL, "http://127.0.0.1:8317/v1");
    assert.deepEqual(chat.models.map((m) => m.id), ["gemini-3-flash"]);
    assert.deepEqual(chat.models[0].compat, { supportsReasoningEffort: true, thinkingFormat: "openai" });
    assert.deepEqual(chat.retryPolicy, { mode: "normal", maxRetries: 2 });

    const responses = providers["cli-proxy-responses"];
    assert.equal(responses.api, "openai-responses");
    assert.equal(responses.baseURL, "http://127.0.0.1:8317/v1");
    assert.deepEqual(responses.models[0].reasoningEfforts, { low: "low", high: "high", max: "ultra" });
    assert.equal(responses.models[0].compat, undefined);

    const messages = providers["cli-proxy-messages"];
    assert.equal(messages.api, "anthropic-messages");
    assert.equal(messages.baseURL, "http://127.0.0.1:8317");
    assert.equal(messages.apiKeyEnv, "CLI_PROXY_API_KEY");
    assert.deepEqual(messages.models[0].compat, { forceAdaptiveThinking: true });
    assert.deepEqual(messages.models[0].input, ["text", "image"]);

    assert.equal(defaultModel.provider, "cli-proxy-messages");
    assert.equal(st.models.find((m) => m.id === "claude-opus-5-5").route, "cli-proxy-messages");

    // A second refresh with unchanged data writes nothing.
    calls.length = 0;
    await runtime.refresh();
    assert.equal(calls.length, 0);
  });

  it("removes an emptied route and honours fixed mode and per-model protocol", async () => {
    const providers = {};
    let config = resolveConfig({
      provider: "cli-proxy",
      baseURL: "http://127.0.0.1:8317",
      selectedModels: ["claude-opus-5-5", "gpt-6.1-sol"],
    });
    const runtime = new CpaRuntime({
      settings: {
        mutate: async (_ns, ops) => {
          for (const op of ops) {
            if (op.op === "set") providers[op.path[1]] = op.value;
            else delete providers[op.path[1]];
          }
        },
      },
      config: () => config,
      resolveApiKey: async () => undefined,
      readExistingPiAiRoute: (key) => providers[key],
      fetch: fakeCpa([
        { slug: "claude-opus-5-5", owned_by: "anthropic" },
        { slug: "gpt-6.1-sol", owned_by: "openai" },
      ]),
    });
    await runtime.refresh();
    assert.deepEqual(Object.keys(providers).sort(), ["cli-proxy-messages", "cli-proxy-responses"]);
    assert.deepEqual(providers["cli-proxy-messages"].headers, { Authorization: "Bearer cpa-local" });

    config = resolveConfig({ ...config, protocolMode: "fixed", protocol: "openai-completions" });
    await runtime.refresh();
    assert.deepEqual(Object.keys(providers), ["cli-proxy"]);
    assert.equal(providers["cli-proxy"].models.length, 2);

    config = resolveConfig({
      ...config,
      protocolMode: "auto",
      modelOverrides: { "claude-opus-5-5": { protocol: "openai-completions" } },
    });
    await runtime.refresh();
    assert.deepEqual(providers["cli-proxy"].models.map((m) => m.id), ["claude-opus-5-5"]);
    assert.deepEqual(providers["cli-proxy-responses"].models.map((m) => m.id), ["gpt-6.1-sol"]);
    assert.equal(providers["cli-proxy-messages"], undefined);
  });

  it("applies per-model parameter overrides over discovered values", () => {
    const source = {
      id: "gpt-6.1-sol",
      contextWindow: 500000,
      maxTokens: 128000,
      inputModalities: ["text", "image"],
      reasoning: true,
      reasoningLevels: ["low", "high", "max"],
    };
    const overridden = applyModelOverride(source, {
      contextWindow: 1000000,
      maxTokens: 32000,
      image: false,
      reasoningLevels: ["medium", "high"],
    });
    assert.equal(overridden.contextWindow, 1000000);
    assert.equal(overridden.maxTokens, 32000);
    assert.deepEqual(overridden.inputModalities, ["text"]);
    assert.equal(overridden.reasoning, true);
    assert.deepEqual(overridden.reasoningLevels, ["medium", "high"]);
    assert.equal(source.contextWindow, 500000);

    const config = resolveConfig({
      modelOverrides: {
        "gpt-6.1-sol": { contextWindow: "1000000", maxTokens: 0, reasoningLevels: ["nope", "high", "high"] },
        " ": { contextWindow: 1 },
      },
    });
    assert.deepEqual(config.modelOverrides, {
      "gpt-6.1-sol": { contextWindow: 1000000, reasoningLevels: ["high"] },
    });

    const built = buildPiAiRoutes(
      { ...config, displayName: "CLI Proxy API", apiKeyEnv: "CLI_PROXY_API_KEY", selectedModels: ["gpt-6.1-sol"] },
      { rootURL: "http://127.0.0.1:8317", models: [source, { id: "other", inputModalities: ["text"], reasoning: false, reasoningLevels: [] }] },
      true
    );
    const profile = built.routes["cli-proxy-responses"];
    assert.equal(built.allModels[0].contextWindow, 500000);
    assert.equal(built.orderedModels[0].contextWindow, 1000000);
    assert.equal(profile.models[0].contextWindow, 1000000);
    assert.equal(profile.models[0].maxTokens, 128000);
    assert.deepEqual(profile.models[0].input, ["text", "image"]);
    assert.deepEqual(profile.models[0].reasoningEfforts, { high: "high" });
  });
});

/** Two fake CPA servers keyed by host; each also checks the Bearer key. */
function fakeServers(servers) {
  return async (url, init) => {
    const u = new URL(String(url));
    const server = servers[u.host];
    if (server === undefined) throw new Error(`connect ECONNREFUSED ${u.host}`);
    const auth = init?.headers?.Authorization;
    if (server.key !== undefined && auth !== `Bearer ${server.key}`) {
      return new Response("{}", { status: 401 });
    }
    return fakeCpa(server.models)(url);
  };
}

function harness(initialState, servers, extraDeps = {}) {
  let state = normalizeState(initialState);
  const providers = {};
  const keys = { CLI_PROXY_API_KEY: "key-a" };
  const controller = createCpaController({
    settings: {
      mutate: async (ns, ops) => {
        if (ns !== "llm-pi-ai") return;
        for (const op of ops) {
          if (op.op === "set") providers[op.path[1]] = op.value;
          else delete providers[op.path[1]];
        }
      },
    },
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    resolveApiKey: async (ref) => keys[ref],
    describeApiKey: async (ref) => ({ configured: keys[ref] !== undefined, writable: true }),
    setCredential: async (ref, value) => {
      keys[ref] = value;
    },
    unsetCredential: async (ref) => {
      delete keys[ref];
    },
    readExistingPiAiRoute: (key) => providers[key],
    fetch: fakeServers(servers),
    ...extraDeps,
  });
  return { controller, providers, keys, state: () => state };
}

const SERVERS = {
  "a.test": {
    key: "key-a",
    models: [
      { slug: "claude-opus-5-5", owned_by: "anthropic" },
      { slug: "gpt-6.1-sol", owned_by: "openai" },
    ],
  },
  "b.test": {
    key: "key-b",
    models: [
      { slug: "gemini-4-argon", owned_by: "google" },
      { slug: "gpt-6-astra", owned_by: "openai" },
    ],
  },
};

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
      commands: { register: (c) => (commands.push(c), () => {}) },
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
      assert.deepEqual(commands.map((c) => c.name).sort(), ["cpa-image", "cpa-refresh", "cpa-status", "cpa-video", "cpa-video-edit", "cpa-video-extend", "cpa-video-status"]);
      assert.equal(commands.find((c) => c.name === "cpa-video").input.attachments, true);
      assert.equal(commands.find((c) => c.name === "cpa-image").input.attachments, true);

      let sent = await post("/api/dsh-cliproxyapi/refresh", {});
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

/**
 * Mount apply() against a temp profile with fake settings/credentials and the
 * given fetch. `extraServices` adds Host services to ctx.get(). Call
 * `dispose()` before the next mount (apply is mounted once per process).
 */
/** Poll a run's chat-row data until its background job has settled. */
async function settledRun(m, sessionId, commandId) {
  for (let i = 0; i < 200; i++) {
    const row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=${sessionId}&commandId=${commandId}`);
    if (row.body?.run?.status !== "running") return row;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("the run did not settle");
}

function mountPlugin({ state, fetchImpl, extraServices = {}, files = {}, dir: reuseDir }) {
  const dir = reuseDir ?? mkdtempSync(join(tmpdir(), "cpa-mount-"));
  const stateDir = join(dir, ".dsh-cliproxyapi");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "state.json"), JSON.stringify(state));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(stateDir, name), typeof content === "string" ? content : JSON.stringify(content));
  const providers = {};
  const creds = { CLI_PROXY_API_KEY: "key-a" };
  const disposers = [];
  const tools = [];
  const injected = [];
  const commands = [];
  const routes = new Map();
  const emitted = [];
  const listeners = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
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
        : extraServices[name],
    on: (event, fn) => ((listeners[event] ??= []).push(fn), () => {}),
    emit: (...args) => emitted.push(args),
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
    commands: { register: (c) => (commands.push(c), () => {}) },
    tools: {
      register: (t) => {
        tools.push(t);
        return () => {
          const at = tools.indexOf(t);
          if (at >= 0) tools.splice(at, 1);
        };
      },
    },
    webServer: { register: (r) => (routes.set(r.path, r.handler), () => {}) },
  };
  const call = async (method, path, payload) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = {
      method,
      url: path,
      headers: { host: "127.0.0.1:1" },
      async *[Symbol.asyncIterator]() {
        if (body !== "") yield Buffer.from(body);
      },
    };
    let sent;
    const res = {
      writeHead: (code, headers) => (sent = { code, headers }),
      end: (data) => {
        sent.raw = data;
        try {
          sent.body = JSON.parse(String(data));
        } catch {}
      },
    };
    await routes.get(new URL(path, "http://h").pathname)(req, res);
    return sent;
  };
  apply(ctx, {});
  return {
    dir,
    stateDir,
    providers,
    tools,
    injected,
    commands,
    call,
    routes,
    emitted,
    listeners,
    dispose() {
      globalThis.fetch = realFetch;
      for (const d of disposers) d();
    },
  };
}

const MEDIA_SERVERS = {
  "m.test": {
    key: "key-a",
    models: [
      { slug: "grok-4.6", owned_by: "xai" },
      { slug: "grok-imagine-image", owned_by: "xai" },
      { slug: "grok-imagine-video-1.5", owned_by: "xai" },
      { slug: "claude-opus-5-5", owned_by: "anthropic" },
    ],
  },
};

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

  it("/cpa-image syncs once when no catalog was read yet, and explains an empty choice per account", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const fetchImpl = async (url, init) =>
      new URL(String(url)).pathname.startsWith("/v1/images/")
        ? new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }))
        : serve(url, init);
    let m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    const signal = new AbortController().signal;
    try {
      // Right after a start or reload: no sync has run yet. The composer button's read syncs once.
      const view = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.deepEqual(view.body.session.options.image.map((o) => o.ref), ["default/grok-imagine-image"]);
      const result = await m.commands.find((c) => c.name === "cpa-image").handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal });
      assert.equal(result.kind, "success", result.text);
    } finally {
      m.dispose();
    }
    m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", displayName: "BCPA", baseURL: "http://m.test", enabled: false, selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    try {
      const result = await m.commands.find((c) => c.name === "cpa-image").handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal });
      assert.equal(result.kind, "error");
      assert.match(result.text, /no image model is available \(BCPA: disabled, 0 model\(s\), 0 image\)/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-image generates into the session folder, records it and serves only recorded files", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const imageCalls = [];
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.startsWith("/v1/images/")) {
          imageCalls.push({ path, auth: init.headers.Authorization, body: JSON.parse(init.body) });
          const n = JSON.parse(init.body).n;
          return new Response(JSON.stringify({ data: Array.from({ length: n }, () => ({ b64_json: png.toString("base64") })) }));
        }
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: png }) },
      },
    });
    try {
      assert.equal(m.tools.length, 0, "no agent tool while the switch is off");
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.deepEqual(sent.body.session.options.image.map((o) => o.ref), ["default/grok-imagine-image"]);
      assert.deepEqual(sent.body.session.current.image, { ref: "default/grok-imagine-image", source: "only" });

      const image = m.commands.find((c) => c.name === "cpa-image");
      const signal = new AbortController().signal;
      let result = await image.handler({ agent: { id: "s-1" }, rawInput: "-n 2 a red fox", attachments: [], signal, commandId: "cmd-t-1" });
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /^Generating 2 image\(s\) with grok-imagine-image/, "returns once admitted");
      // The session shows as running while the job runs, and idle after it.
      assert.deepEqual(m.emitted[0], ["api-session/status", "s-1", true]);
      let row = await settledRun(m, "s-1", "cmd-t-1");
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);
      assert.equal(row.code, 200, JSON.stringify(row.body));
      assert.equal(row.body.run.status, "done");
      assert.equal(row.body.run.prompt, "a red fox");
      assert.equal(row.body.run.count, 2);
      assert.equal(row.body.run.folder, "generated", "a display label, not a path");
      // The chat row finds this run's files by command id, in generation order.
      assert.deepEqual(row.body.files.map((f) => f.name.slice(-6)), ["-1.png", "-2.png"]);
      // Paths let the page open / reveal a file through DSH's Session Remote.
      assert.deepEqual(row.body.files.map((f) => f.path), row.body.files.map((f) => join(workDir, "generated", f.name)));
      assert.equal(row.body.folderPath, join(workDir, "generated"));
      assert.equal(row.body.desktop, process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "finder" : "filemanager");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-2&commandId=cmd-t-1");
      assert.deepEqual(row.body.files, [], "another session sees nothing");
      assert.equal(row.body.run, null);
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=bad%20id");
      assert.equal(row.code, 400);

      assert.deepEqual(imageCalls[0], {
        path: "/v1/images/generations",
        auth: "Bearer key-a",
        body: { model: "grok-imagine-image", prompt: "a red fox", n: 2, response_format: "b64_json" },
      });
      const files = readdirSync(join(workDir, "generated"));
      assert.equal(files.length, 2);
      assert.ok(files.every((f) => /^\d{8}-\d{6}-grok-imagine-image-a-red-fox-[12]\.png$/.test(f)), files.join(", "));
      assert.ok(!result.text.includes("key-a"));

      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      const recent = sent.body.session.recent;
      assert.equal(recent.length, 2);
      assert.ok(!JSON.stringify(recent).includes(workDir), "the page gets file names, not paths");
      sent = await m.call("GET", `/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=${recent[0].id}`);
      assert.equal(sent.code, 200);
      assert.equal(sent.headers["content-type"], "image/png");
      assert.deepEqual([...sent.raw], [...png]);
      sent = await m.call("GET", `/api/dsh-cliproxyapi/media/file?sessionId=s-2&id=${recent[0].id}`);
      assert.equal(sent.code, 404, "another session cannot read it");
      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=0000000000000000");
      assert.equal(sent.code, 404);

      result = await image.handler({
        agent: { id: "s-1" },
        rawInput: "--aspect 1:1 make it blue",
        attachments: [{ type: "image", attachment: { mediaType: "image/png" } }],
        signal,
        commandId: "cmd-t-2",
      });
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-t-2");
      assert.equal(row.body.run.references, 1);
      assert.equal(imageCalls[1].path, "/v1/images/edits");
      assert.match(imageCalls[1].body.images[0].image_url, /^data:image\/png;base64,/);
      assert.equal(imageCalls[1].body.size, "1024x1024");

      result = await image.handler({ agent: { id: "s-1" }, rawInput: "", attachments: [], signal });
      assert.equal(result.kind, "error");
      assert.match(result.text, /add a prompt/);
      result = await image.handler({ agent: { id: "s-1" }, rawInput: "cat", attachments: [{ type: "file", attachment: {} }], signal });
      assert.match(result.text, /only image attachments/);
      result = await image.handler({ agent: { id: "s-1" }, rawInput: "-m dall-e cat", attachments: [], signal });
      assert.match(result.text, /no enabled image model matches; available: default\/grok-imagine-image/);

      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-1", kind: "image", ref: "default/grok-imagine-image" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.session.current.image.source, "session");
      const media = JSON.parse(readFileSync(join(m.stateDir, "media-settings.json"), "utf8"));
      assert.equal(media.lastSelection.image, "default/grok-imagine-image", "the pick is remembered for new sessions");
      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-1", kind: "image", ref: "default/grok-imagine-video-1.5" });
      assert.equal(sent.code, 400);
      assert.equal(sent.body.error, "invalid-model");
      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=../x");
      assert.equal(sent.code, 400);

      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/save", { outputDir: "art/out" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      result = await image.handler({ agent: { id: "s-3" }, rawInput: "skyline", attachments: [], signal, commandId: "cmd-t-3" });
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-3", "cmd-t-3");
      assert.equal(row.body.run.folder, "art/out");
      assert.equal(readdirSync(join(workDir, "art", "out")).length, 1);
    } finally {
      m.dispose();
    }
  });
  it("/cpa-image reports background failures, keeps the session running across agent turns and marks cut-off runs", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    let release;
    let mode = "reject";
    const fetchImpl = async (url, init) => {
      if (!new URL(String(url)).pathname.startsWith("/v1/images/")) return serve(url, init);
      if (mode === "reject") return new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 });
      return new Promise((resolve, reject) => {
        release = resolve;
        init.signal?.addEventListener("abort", () => reject(init.signal.reason));
      });
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    const signal = new AbortController().signal;
    const image = () => m.commands.find((c) => c.name === "cpa-image");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await image().handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal, commandId: "cmd-f-1" });
      assert.equal(result.kind, "success", "admitted before the upstream answers");
      let row = await settledRun(m, "s-1", "cmd-f-1");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "upstream-error");
      assert.match(row.body.run.error, /CPA rejected the request \(HTTP 429/);
      assert.deepEqual(row.body.files, []);
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);

      mode = "hang";
      result = await image().handler({ agent: { id: "s-1" }, rawInput: "owl", attachments: [], signal, commandId: "cmd-f-2" });
      assert.equal(result.kind, "success");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-f-2");
      assert.equal(row.body.run.status, "running");
      // The agent finishing a turn of its own resets the host status to idle; the job republishes it.
      m.emitted.length = 0;
      for (const fn of m.listeners["agent/status"] ?? []) fn({ agent: { id: "s-1" }, status: "idle" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(m.emitted, [["api-session/status", "s-1", true]]);
    } finally {
      m.dispose();
    }
    assert.ok(release, "the request was in flight");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false], "reload settles the session as idle");
    const stored = JSON.parse(readFileSync(join(m.stateDir, "media-sessions.json"), "utf8"));
    const cut = stored.sessions["s-1"].runs.find((r) => r.commandId === "cmd-f-2");
    assert.equal(cut.status, "error");
    assert.equal(cut.errorCode, "interrupted");
    // A record still marked running that no job of this activation owns (a crash) reads as interrupted.
    m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    try {
      stored.sessions["s-1"].runs[0] = { ...cut, status: "running", errorCode: undefined, error: undefined };
      writeFileSync(join(m.stateDir, "media-sessions.json"), JSON.stringify(stored));
      const row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-f-2");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "interrupted");
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video submits, follows and saves a video, and serves it with byte ranges", async () => {
    const { Writable } = await import("node:stream");
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(100, 3)]);
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const videoCalls = [];
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("/videos")) videoCalls.push({ path, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
        if (path === "/v1/videos/generations") return new Response(JSON.stringify({ request_id: "req-1" }));
        if (path === "/v1/videos/req-1") return new Response(JSON.stringify({ status: "done", video: { url: "https://vidgen.x.ai/req-1.mp4", duration: 6 } }));
        if (path === "/openai/v1/videos/req-1/content") return new Response(mp4, { headers: { "content-type": "video/mp4" } });
        return serve(url, init);
      },
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      const video = m.commands.find((c) => c.name === "cpa-video");
      const signal = new AbortController().signal;
      const result = await video.handler({ agent: { id: "s-1" }, rawInput: "waves at sunset", attachments: [], signal, commandId: "cmd-v-1" });
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /^Submitting a 6 s 720p video \(text\) to grok-imagine-video-1\.5 .*cannot be cancelled/);
      assert.deepEqual(m.emitted[0], ["api-session/status", "s-1", true]);
      const row = await settledRun(m, "s-1", "cmd-v-1");
      assert.equal(row.body.run.status, "done", JSON.stringify(row.body.run));
      assert.equal(row.body.run.kind, "video");
      assert.equal(row.body.run.seconds, 6);
      assert.equal(row.body.run.resolution, "720p");
      assert.equal(row.body.run.videoId, "req-1");
      assert.equal(row.body.files.length, 1);
      assert.equal(row.body.files[0].kind, "video");
      assert.match(row.body.files[0].name, /\.mp4$/);
      assert.deepEqual(videoCalls.map((c) => `${c.method} ${c.path}`), ["POST /v1/videos/generations", "GET /v1/videos/req-1", "GET /openai/v1/videos/req-1/content"]);
      assert.deepEqual(videoCalls[0].body, { model: "grok-imagine-video-1.5", prompt: "waves at sunset", duration: 6, resolution: "720p" });
      assert.ok(!readFileSync(join(m.stateDir, "media-sessions.json"), "utf8").includes("vidgen"), "no upstream URL is stored");
      const jobs = JSON.parse(readFileSync(join(m.stateDir, "media-jobs.json"), "utf8")).jobs;
      assert.equal(jobs[0].state, "done");
      assert.equal(JSON.stringify(jobs).includes("key-a"), false);
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);

      // Byte ranges for <video>.
      const fileId = row.body.files[0].id;
      const ranged = await new Promise((resolve) => {
        const chunks = [];
        const res = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } });
        res.writeHead = (code, headers) => (res.sent = { code, headers });
        res.on("finish", () => resolve({ ...res.sent, body: Buffer.concat(chunks) }));
        const req = { method: "GET", url: `/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=${fileId}`, headers: { host: "127.0.0.1:1", range: "bytes=4-11" } };
        m.routes.get("/api/dsh-cliproxyapi/media/file")(req, res);
      });
      assert.equal(ranged.code, 206);
      assert.equal(ranged.headers["content-range"], `bytes 4-11/${mp4.length}`);
      assert.equal(ranged.body.toString(), "ftypisom");

      const status = await m.commands.find((c) => c.name === "cpa-video-status").handler({ agent: { id: "s-1" } });
      assert.match(status.text, /done\s+grok-imagine-video-1\.5, 6 s {2}waves at sunset {2}\(req-1\)/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-video reports refusals and failed videos, and checks its options and first frame", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    let mode = "refuse";
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/videos/generations") {
          if (mode === "refuse") return new Response(JSON.stringify({ error: { message: "Model is not supported" } }), { status: 400 });
          assert.match(JSON.parse(init.body).image.url, /^data:image\/png;base64,/);
          return new Response(JSON.stringify({ request_id: "req-9" }));
        }
        if (path === "/v1/videos/req-9") return new Response(JSON.stringify({ status: "failed", error: { message: "content moderated" } }));
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: new Uint8Array([1]) }) },
      },
    });
    const signal = new AbortController().signal;
    const video = () => m.commands.find((c) => c.name === "cpa-video");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      await video().handler({ agent: { id: "s-1" }, rawInput: "-s 4 -r 480p x", attachments: [], signal, commandId: "cmd-v-2" });
      let row = await settledRun(m, "s-1", "cmd-v-2");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "upstream-error");
      assert.match(row.body.run.error, /CPA rejected the request \(HTTP 400: Model is not supported\)/);
      assert.equal(existsSync(join(m.stateDir, "media-jobs.json")), false, "nothing was submitted, so no job");

      mode = "accept";
      const image = { type: "image", attachment: { mediaType: "image/png" } };
      await video().handler({ agent: { id: "s-1" }, rawInput: "--aspect 9:16 dance", attachments: [image], signal, commandId: "cmd-v-3" });
      row = await settledRun(m, "s-1", "cmd-v-3");
      assert.equal(row.body.run.errorCode, "video-failed");
      assert.match(row.body.run.error, /content moderated/);
      assert.equal(row.body.run.references, 1);
      assert.equal(JSON.parse(readFileSync(join(m.stateDir, "media-jobs.json"), "utf8")).jobs[0].state, "failed");

      let result = await video().handler({ agent: { id: "s-1" }, rawInput: "x", attachments: Array.from({ length: 15 }, () => image), signal });
      assert.match(result.text, /attach at most 14 images/);
      result = await video().handler({ agent: { id: "s-1" }, rawInput: "-s 30 x", attachments: [], signal });
      assert.match(result.text, /seconds must be a whole number from 1 to 15/);
      result = await video().handler({ agent: { id: "s-1" }, rawInput: "-m grok-imagine-image x", attachments: [], signal });
      assert.match(result.text, /no enabled video model matches/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-video jobs survive a reload: a running job resumes, an old one expires", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)]);
    let pending = true;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/videos/generations") return new Response(JSON.stringify({ request_id: "req-5" }));
      if (path === "/v1/videos/req-5") return new Response(JSON.stringify(pending ? { status: "pending" } : { status: "done", video: { url: "https://v/x" } }));
      if (path === "/openai/v1/videos/req-5/content") return new Response(mp4);
      return serve(url, init);
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    const dir = m.dir;
    const signal = new AbortController().signal;
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      await m.commands.find((c) => c.name === "cpa-video").handler({ agent: { id: "s-1" }, rawInput: "rain", attachments: [], signal, commandId: "cmd-v-5" });
      let row;
      for (let i = 0; i < 100; i += 1) {
        row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-v-5");
        if (row.body.run?.phase === "queued" && row.body.run?.videoId === "req-5") break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(row.body.run.status, "running");
      assert.equal(row.body.run.phase, "queued");
    } finally {
      m.dispose();
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    let jobs = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-jobs.json"), "utf8")).jobs;
    assert.equal(jobs[0].state, "submitted", "a reload pauses the job, it does not end it");
    const sessions = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-sessions.json"), "utf8"));
    assert.equal(sessions.sessions["s-1"].runs[0].status, "running", "no error is recorded for a paused job");

    // An old job next to it: past CPA's 3-hour binding.
    jobs.push({ ...jobs[0], id: "req-old", commandId: "cmd-v-6", submittedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() });
    sessions.sessions["s-1"].runs.unshift({ ...sessions.sessions["s-1"].runs[0], commandId: "cmd-v-6" });
    pending = false;
    m = mountPlugin({ state, fetchImpl, dir, files: { "media-jobs.json": { version: 1, jobs }, "media-sessions.json": sessions }, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    try {
      const resumed = await settledRun(m, "s-1", "cmd-v-5");
      assert.equal(resumed.body.run.status, "done", JSON.stringify(resumed.body.run));
      assert.equal(resumed.body.files[0].kind, "video");
      const old = await settledRun(m, "s-1", "cmd-v-6");
      assert.equal(old.body.run.errorCode, "expired");
      jobs = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-jobs.json"), "utf8")).jobs;
      assert.deepEqual(Object.fromEntries(jobs.map((j) => [j.id, j.state])), { "req-5": "done", "req-old": "expired" });
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video shrinks an oversized first frame, or asks DSH for a smaller one, before sending it", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const bodies = [];
    const bigJpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_500_000)]));
    const smallJpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000)]));
    const requests = [];
    let withRequestImages = true;
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/videos/generations") {
          bodies.push(init.body);
          return new Response(JSON.stringify({ error: { message: "stop here" } }), { status: 400 });
        }
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: {
          readImage: async (ref) => ({ ref: { mediaType: "image/jpeg", width: 3000, height: 2000 }, data: bigJpeg }),
          get readImageRequest() {
            return withRequestImages ? async (ref, target) => (requests.push(target), { data: smallJpeg, mediaType: "image/jpeg" }) : undefined;
          },
        },
      },
    });
    const signal = new AbortController().signal;
    const image = { type: "image", attachment: { mediaType: "image/jpeg" } };
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      const video = m.commands.find((c) => c.name === "cpa-video");
      const result = await video.handler({ agent: { id: "s-1" }, rawInput: "move", attachments: [image], signal, commandId: "cmd-v-8" });
      assert.equal(result.kind, "success", result.text);
      assert.deepEqual(requests, [{ width: 1280, height: 853, maxBytes: videoImageBudget("move", 1) }]);
      await settledRun(m, "s-1", "cmd-v-8");
      assert.ok(bodies[0].length <= 1024 * 1024, `the body stays within the measured 1 MiB (${bodies[0].length})`);
      assert.match(JSON.parse(bodies[0]).image.url, /^data:image\/jpeg;base64,/);
      withRequestImages = false;
      const refused = await video.handler({ agent: { id: "s-1" }, rawInput: "move", attachments: [image], signal });
      assert.equal(refused.kind, "error");
      assert.match(refused.text, /could not be made smaller than \d+ KB/);
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video sends references or pinned frames, and /cpa-video-edit / -extend reuse xAI's short-lived link", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const posts = [];
    let next = 0;
    const durations = {};
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (init?.method === "POST" && path.startsWith("/v1/videos/")) {
          const body = JSON.parse(init.body);
          const id = `req-${++next}`;
          posts.push({ path, body, id });
          durations[id] = path.endsWith("/extensions") ? 6 + body.duration : 6;
          return new Response(JSON.stringify({ request_id: id }));
        }
        const poll = /^\/v1\/videos\/(req-\d+)$/.exec(path);
        if (poll) return new Response(JSON.stringify({ status: "done", video: { url: `https://vidgen.x.ai/${poll[1]}.mp4`, duration: durations[poll[1]] } }));
        if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4);
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: new Uint8Array([1, 2, 3]) }) },
      },
    });
    const signal = new AbortController().signal;
    const image = { type: "image", attachment: { mediaType: "image/png" } };
    const run = (name, rawInput, attachments, commandId, sessionId = "s-1") =>
      m.commands.find((c) => c.name === name).handler({ agent: { id: sessionId }, rawInput, attachments, signal, commandId });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await run("cpa-video", "三个人跳舞", [image, image, image], "cmd-m-1");
      assert.match(result.text, /\(reference\)/);
      let row = await settledRun(m, "s-1", "cmd-m-1");
      assert.equal(row.body.run.mode, "reference");
      assert.equal(posts[0].body.reference_images.length, 3);
      assert.equal(posts[0].body.image, undefined);
      assert.deepEqual(row.body.actions.edit, true, "a 6 s video can be edited");
      assert.equal(row.body.actions.extend, true);
      assert.ok(!JSON.stringify(row.body).includes("vidgen"), "the page never sees xAI's link");

      await run("cpa-video", "首尾帧 从白天到黑夜", [image, image], "cmd-m-2");
      await settledRun(m, "s-1", "cmd-m-2");
      assert.ok(posts[1].body.image && posts[1].body.last_frame && posts[1].body.reference_images === undefined);
      await run("cpa-video", "--last 落在这里", [image], "cmd-m-3");
      await settledRun(m, "s-1", "cmd-m-3");
      assert.ok(posts[2].body.last_frame && posts[2].body.image === undefined);
      result = await run("cpa-video", "--first-last x", [image], "cmd-m-x");
      assert.match(result.text, /need attached images/);

      // Extend the newest video by 4 s, then edit the first one by id.
      result = await run("cpa-video-extend", "4秒 然后转身离开", [], "cmd-m-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-m-4");
      assert.deepEqual(posts[3], { path: "/v1/videos/extensions", id: "req-4", body: { model: "grok-imagine-video", prompt: "然后转身离开", video: { url: "https://vidgen.x.ai/req-3.mp4" }, duration: 4 } });
      assert.equal(row.body.run.mode, "extend");
      assert.equal(row.body.run.sourceCommandId, "cmd-m-3");
      assert.equal(row.body.run.status, "done");
      assert.equal(row.body.actions.edit, false, "the 10 s result is too long to edit");
      assert.equal(row.body.actions.extend, true);

      await run("cpa-video-edit", "--from cmd-m-1 把衣服换成红色", [], "cmd-m-5");
      await settledRun(m, "s-1", "cmd-m-5");
      assert.deepEqual(posts[4].body, { model: "grok-imagine-video", prompt: "把衣服换成红色", video: { url: "https://vidgen.x.ai/req-1.mp4" } });
      result = await run("cpa-video-edit", "--from cmd-m-4 换背景", [], "cmd-m-6");
      assert.match(result.text, /at most 8\.7 seconds/);
      result = await run("cpa-video-extend", "继续", [], "cmd-m-7", "s-2");
      assert.match(result.text, /no source video/);
      result = await run("cpa-video-extend", "-s 12 继续", [], "cmd-m-8");
      assert.match(result.text, /adds 2 to 10 seconds/);

      for (const file of ["media-sessions.json", "media-jobs.json"]) {
        assert.ok(!readFileSync(join(m.stateDir, file), "utf8").includes("vidgen"), `${file} keeps no xAI link`);
      }
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video-edit / -extend take any MP4: attached, --video, --url, or a generated file after its link is gone", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const box = (type, payload) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(8 + payload.length);
      head.write(type, 4, "latin1");
      return Buffer.concat([head, payload]);
    };
    const mp4Of = (seconds, fill = 32) => {
      const mvhd = Buffer.alloc(100);
      mvhd.writeUInt32BE(1000, 12);
      mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
      return Buffer.concat([box("ftyp", Buffer.from("isom\0\0\0\0isom")), box("mdat", Buffer.alloc(fill, 7)), box("moov", box("mvhd", mvhd))]);
    };
    writeFileSync(join(workDir, "clip.mp4"), mp4Of(5));
    writeFileSync(join(workDir, "long.mp4"), mp4Of(12));
    writeFileSync(join(workDir, "note.txt"), "not a video");
    const stored = join(workDir, "stored.mp4");
    writeFileSync(stored, mp4Of(4));
    const posts = [];
    let next = 0;
    let extensions = 405;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path.startsWith("/v1/videos/")) {
        if (path.endsWith("/extensions") && extensions === 405) {
          posts.push({ path, refused: true });
          return new Response(JSON.stringify({ error: { message: "status 405", type: "invalid_request_error" } }), { status: 405 });
        }
        const id = `req-${++next}`;
        posts.push({ path, body: JSON.parse(init.body), id });
        return new Response(JSON.stringify({ request_id: id }));
      }
      if (/^\/v1\/videos\/req-\d+$/.test(path)) return new Response(JSON.stringify({ status: "done", video: { url: "https://vidgen.x.ai/x.mp4", duration: 5 } }));
      if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4Of(5));
      return serve(url, init);
    };
    const streamOnly = { attachmentId: "sha256:" + "a".repeat(64), name: "phone clip.mp4", bytes: mp4Of(3).length };
    const attachments = {
      readImage: async (ref) => ({ ref, data: new Uint8Array([1, 2, 3]) }),
      fileHostPath: (ref) => (ref.name === "stored.mp4" ? stored : undefined),
      readFileStream: async function* () {
        yield new Uint8Array(mp4Of(3));
      },
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir }, attachments } });
    const signal = new AbortController().signal;
    const run = (name, rawInput, files, commandId) =>
      m.commands.find((c) => c.name === name).handler({ agent: { id: "s-1" }, rawInput, attachments: files, signal, commandId });
    const dataOf = (post) => Buffer.from(post.body.video.url.replace(/^data:video\/mp4;base64,/, ""), "base64");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await run("cpa-video-edit", "--video clip.mp4 换成红色", [], "cmd-e-1");
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /uploading clip\.mp4/);
      let row = await settledRun(m, "s-1", "cmd-e-1");
      assert.equal(posts[0].path, "/v1/videos/edits");
      assert.deepEqual(dataOf(posts[0]), mp4Of(5), "the local file goes inline as a data URI");
      assert.equal(row.body.run.sourceName, "clip.mp4");
      assert.equal(row.body.run.seconds, 5);

      result = await run("cpa-video-edit", "加一只猫", [{ type: "file", attachment: { attachmentId: "sha256:" + "b".repeat(64), name: "stored.mp4", bytes: 10 } }], "cmd-e-2");
      assert.equal(result.kind, "success", result.text);
      await settledRun(m, "s-1", "cmd-e-2");
      assert.deepEqual(dataOf(posts[1]), mp4Of(4), "an attachment is read from its host path");
      result = await run("cpa-video-edit", "加一只狗", [{ type: "file", attachment: streamOnly }], "cmd-e-3");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-3");
      assert.deepEqual(dataOf(posts[2]), mp4Of(3), "or streamed from the attachment store");
      assert.equal(row.body.run.sourceName, "phone clip.mp4");

      result = await run("cpa-video-edit", "--url https://example.com/v/a.mp4 变成夜晚", [], "cmd-e-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-4");
      assert.deepEqual(posts[3].body, { model: "grok-imagine-video", prompt: "变成夜晚", video: { url: "https://example.com/v/a.mp4" } });
      assert.equal(row.body.run.sourceName, "example.com");
      assert.equal(row.body.run.sourceKind, "url");

      // A path typed straight into the prompt is the source, not prompt text; 480p is taken out.
      result = await run("cpa-video-edit", `${join(workDir, "clip.mp4")}   480p  这个背景换成中国街头`, [], "cmd-e-path");
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /Ignored 480p/);
      row = await settledRun(m, "s-1", "cmd-e-path");
      assert.equal(posts.at(-1).body.prompt, "这个背景换成中国街头");
      assert.deepEqual(dataOf(posts.at(-1)), mp4Of(5));
      assert.equal(row.body.run.prompt, "这个背景换成中国街头");
      assert.deepEqual(row.body.run.ignored, ["480p"]);
      assert.equal(row.body.run.sourceName, "clip.mp4");
      assert.equal(row.body.run.sourceKind, "upload");

      const before = posts.length;
      for (const [line, files, pattern] of [
        ["--video long.mp4 x", [], /at most 8\.7 seconds \(this one has 12 s\)/],
        ["--video note.txt x", [], /must be an MP4/],
        ["--video missing.mp4 x", [], /no video file at missing\.mp4/],
        ["--video clip.mp4 --url https://example.com/a.mp4 x", [], /use one source video/],
        ["--video clip.mp4 x", [{ type: "file", attachment: streamOnly }], /use one source video/],
        ["x", [{ type: "image", attachment: { mediaType: "image/png" } }], /attach one MP4 video/],
        ["x", [{ type: "file", attachment: { ...streamOnly, bytes: 15 * 1024 * 1024 } }], /15\.0 MiB; videos up to 14 MiB/],
        ["--url ftp://example.com/a.mp4 x", [], /public http\(s\) address/],
      ]) {
        result = await run("cpa-video-edit", line, files);
        assert.equal(result.kind, "error", line);
        assert.match(result.text, pattern, line);
      }
      assert.equal(posts.length, before, "refused sources never reach CPA");

      // An upstream without the extension route: the run fails with a clear
      // message, and the next extension is refused without another request.
      result = await run("cpa-video-extend", "--video clip.mp4 -s 4 继续", [], "cmd-e-5");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-5");
      assert.equal(row.body.run.errorCode, "route-unsupported");
      assert.match(row.body.run.error, /does not offer video extension \(HTTP 405\)/);
      const refusedPosts = posts.length;
      result = await run("cpa-video-extend", "--video clip.mp4 继续", []);
      assert.match(result.text, /does not offer video extension/);
      assert.equal(posts.length, refusedPosts);
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-e-1");
      assert.equal(row.body.actions.extend, false, "the row hides Extend for that account");
      assert.equal(row.body.actions.edit, true);
    } finally {
      m.dispose();
    }

    // After a reload xAI's link is forgotten: --from sends the generated file itself.
    extensions = 200;
    m = mountPlugin({ state, fetchImpl, dir: m.dir, extraServices: { workingDirectory: { ensure: async () => workDir }, attachments } });
    try {
      const row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-e-1");
      assert.equal(row.body.actions.edit, true, "the downloaded file can still be edited");
      assert.equal(row.body.actions.expiresAt, undefined, "no link is remembered");
      const result = await run("cpa-video-extend", "--from cmd-e-1 -s 3 继续", [], "cmd-e-6");
      assert.equal(result.kind, "success", result.text);
      await settledRun(m, "s-1", "cmd-e-6");
      const post = posts.at(-1);
      assert.equal(post.path, "/v1/videos/extensions");
      assert.equal(post.body.duration, 3);
      assert.deepEqual(dataOf(post), mp4Of(5), "the file CPA downloaded for cmd-e-1");
    } finally {
      m.dispose();
    }
  });
it("generate_media: off by default, then image / video with approval, budget, refunds and sub-agents", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    writeFileSync(join(workDir, "ref.png"), png);
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const posts = [];
    let refuse = false;
    let pending = false;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && (path.startsWith("/v1/videos/") || path.startsWith("/v1/images/"))) {
        const body = JSON.parse(init.body);
        posts.push({ path, body });
        if (refuse) return new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });
        if (path.startsWith("/v1/images/")) return new Response(JSON.stringify({ data: Array.from({ length: body.n }, () => ({ b64_json: png.toString("base64") })) }));
        return new Response(JSON.stringify({ request_id: `req-${posts.length}` }));
      }
      const poll = /^\/v1\/videos\/(req-\d+)$/.exec(path);
      if (poll) return new Response(JSON.stringify(pending ? { status: "pending" } : { status: "done", video: { url: "https://vidgen.x.ai/v.mp4", duration: 6 } }));
      if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4);
      return serve(url, init);
    };
    const approvals = [];
    let answer = "allowed-once";
    let policy = "ask";
    const saved = [];
    const root = { id: "s-root", options: { provider: "cli-proxy", model: "claude-opus-5-5" }, session: { id: "s-root", requestHeader: () => undefined } };
    const child = { id: "s-child", options: { provider: "cli-proxy", model: "claude-opus-5-5" }, session: { id: "s-child", requestHeader: () => undefined } };
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: {
          saveImage: async ({ data, mediaType, name }) => (saved.push(name), { attachmentId: `sha256:${saved.length}`, mediaType, bytes: data.byteLength, width: 8, height: 8, name }),
          readImage: async (ref) => ({ ref, data: png }),
        },
        approval: {
          effectivePolicy: () => policy,
          request: async (req) => (approvals.push(req), answer),
        },
        llm: { resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }) },
        agents: { list: () => [root, child], isOwnedBy: (id, owner) => id === "s-child" && owner === root },
      },
    });
    let n = 0;
    const call = (args, agent = root, signal = new AbortController().signal) => m.tools.find((t) => t.name === "generate_media").execute(args, { agent, callId: `toolu_${++n}`, signal });
    const session = async (id = "s-root") => (await m.call("GET", `/api/dsh-cliproxyapi/media/session?sessionId=${id}`)).body.session;
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      assert.equal(m.tools.length, 0, "off by default");
      await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: true });
      assert.deepEqual(m.tools.map((t) => t.name), ["generate_media"]);
      const tool = m.tools[0];
      const schema = JSON.stringify({ d: tool.description, p: tool.parameters });
      assert.ok(!/grok-imagine-image|claude|default\//.test(schema), "the schema lists no models or accounts");
      assert.ok(schema.length < 2600, `compact schema (${schema.length} chars)`);

      // Image: no confirmation by default; the model gets previews when it can see images.
      let out = await call({ kind: "image", prompt: "a lighthouse", count: 2, aspect: "16:9", images: ["ref.png"] });
      assert.equal(out.status, "done");
      assert.equal(out.files.length, 2);
      assert.equal(out.previews.length, 2);
      assert.equal(approvals.length, 0);
      assert.equal(posts[0].path, "/v1/images/edits");
      assert.equal(posts[0].body.prompt, "a lighthouse");
      assert.equal(posts[0].body.n, 2);
      const content = tool.output.render({}, out);
      assert.equal(content.filter((b) => b.type === "image").length, 2);
      let row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=${out.run}`);
      assert.equal(row.body.run.status, "done", "the call has a chat-row record like a command");
      assert.equal(out.run, "toolu_1");

      // Words that look like options stay in the prompt (literal).
      // A real Responses all-fields call formerly failed on model:"", count:1,
      // then on first-frame without images. It must use the selected model and
      // reach confirmation exactly once as a text-to-video request.
      out = await call({ kind: "video", prompt: "10秒 竖屏 一只猫", mode: "generate", model: "", images: [], frames: "first-frame", video: "", aspect: "16:9", seconds: 4, resolution: "480p", count: 1 });
      assert.equal(approvals.length, 1, "videos ask by default");
      assert.match(approvals[0].displayReason.zh, /4 秒视频/);
      assert.match(approvals[0].displayReason.en, /cannot be cancelled/);
      assert.equal(approvals[0].toolName, "generate_media");
      assert.equal(posts[1].body.prompt, "10秒 竖屏 一只猫");
      assert.equal(posts[1].body.duration, 4);
      assert.equal(posts[1].body.model, "grok-imagine-video-1.5", "an empty model uses the user's selected model");
      assert.equal(posts[1].body.image, undefined);
      assert.equal(posts[1].body.reference_images, undefined);
      assert.equal((await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=${out.run}`)).body.run.mode, "text");
      assert.equal(out.status, "done");
      assert.equal(out.files.length, 1);
      assert.equal((await session()).agent.used, 4, "confirmed videos are counted too");

      // Declined: nothing is sent or counted.
      answer = "rejected";
      const before = posts.length;
      await assert.rejects(call({ kind: "video", prompt: "x", seconds: 4 }), /the user declined this video; do not retry/);
      assert.equal(posts.length, before);
      assert.equal((await session()).agent.used, 4);
      answer = "allowed-once";

      // DSH's approval prompts are off for the session ("danger-full-access" pairs with
      // approval "never"): the plugin asks in the call's own chat row instead.
      policy = "never";
      const askedBefore = approvals.length;
      const rowOf = async (id) => (await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=${id}`)).body;
      const waitConfirm = async (id) => {
        for (let i = 0; i < 200; i += 1) {
          const row = await rowOf(id);
          if (row.confirm) return row;
          await new Promise((r) => setTimeout(r, 5));
        }
        throw new Error("no confirmation shown");
      };
      let pendingCall = call({ kind: "video", prompt: "in row", seconds: 4 });
      let shown = await waitConfirm(`toolu_${n}`);
      assert.equal(shown.run, null, "nothing recorded while waiting");
      assert.equal(shown.confirm.kind, "video");
      assert.match(shown.confirm.zh, /4 秒视频.*无法取消/);
      assert.equal(posts.length, before, "nothing sent while waiting");
      const wrong = await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-other", commandId: `toolu_${n}`, allow: true });
      assert.equal(wrong.code, 400, "only the call's own session can answer");
      await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-root", commandId: `toolu_${n}`, allow: false });
      await assert.rejects(pendingCall, /the user declined this video; do not retry/);
      assert.equal(posts.length, before);
      pendingCall = call({ kind: "video", prompt: "in row", mode: null, model: null, images: null, frames: null, video: null, aspect: null, seconds: 4, resolution: null, count: null });
      shown = await waitConfirm(`toolu_${n}`);
      const ok = await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-root", commandId: `toolu_${n}`, allow: true });
      assert.equal(ok.code, 200);
      out = await pendingCall;
      assert.equal(out.status, "done");
      assert.equal(posts.at(-1).body.prompt, "in row");
      assert.equal(approvals.length, askedBefore, "DSH's approval service is not used when its prompts are off");
      assert.equal((await rowOf(out.run)).confirm, undefined);
      assert.equal((await session()).agent.used, 8);
      const late = await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-root", commandId: out.run, allow: true });
      assert.equal(late.code, 400, "an answered confirmation cannot be answered again");
      policy = "ask";

      // Auto for this session with a 10 s limit: switching to auto starts the count again.
      let sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-root", videoConfirm: "auto", videoBudget: { mode: "limited", seconds: 10 } });
      assert.equal(sent.body.session.agent.used, 0);
      assert.equal(sent.body.session.agent.sources.videoConfirm, "session");
      const asked = approvals.length;
      out = await call({ kind: "video", prompt: "a", seconds: 6 }, child);
      assert.equal(approvals.length, asked, "auto does not ask");
      assert.equal((await session()).agent.used, 6, "a sub-agent counts against its root session");
      row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-child&commandId=${out.run}`);
      assert.equal(row.body.run.status, "done", "the row lives in the sub-agent's own session");
      const sentBefore = posts.length;
      await assert.rejects(call({ kind: "video", prompt: "b", seconds: 6 }), /budget is 10 s and 6 s are used; this video needs 6 s/);
      assert.equal(posts.length, sentBefore);

      // CPA refuses at once: the seconds come back.
      refuse = true;
      await assert.rejects(call({ kind: "video", prompt: "c", seconds: 4 }), /CPA rejected the request/);
      refuse = false;
      assert.equal((await session()).agent.used, 6);

      // Stop waiting: the job keeps running in the background.
      pending = true;
      const stop = new AbortController();
      const waiting = call({ kind: "video", prompt: "d", seconds: 4 }, root, stop.signal);
      for (let i = 0; i < 100 && posts.length === sentBefore + 1; i += 1) await new Promise((r) => setTimeout(r, 5));
      stop.abort();
      out = await waiting;
      assert.equal(out.status, "running");
      assert.match(out.note, /keeps running in the background/);
      assert.equal((await session()).agent.used, 10);

      // Argument checks reach the model as plain errors.
      await assert.rejects(call({ kind: "image", prompt: "x", seconds: 4 }), /seconds is for videos only/);
      await assert.rejects(call({ kind: "video", mode: "edit", prompt: "x", seconds: 4 }), /edit keeps the source's length/);

      // Edit a local MP4 (no limit for this session now: a new limit starts the count again).
      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-root", videoBudget: { mode: "unlimited" } });
      assert.equal(sent.body.session.agent.used, 0);
      pending = false;
      writeFileSync(join(workDir, "clip.mp4"), mp4);
      out = await call({ kind: "video", mode: "edit", prompt: "make it red", video: "clip.mp4" });
      const edit = posts.at(-1);
      assert.equal(edit.path, "/v1/videos/edits");
      assert.equal(edit.body.prompt, "make it red");
      assert.match(edit.body.video.url, /^data:video\/mp4;base64,/);
      assert.equal(out.status, "done");
      assert.equal(out.mode, "edit");

      // Switching off removes the tool.
      await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: false });
      assert.equal(m.tools.length, 0);
    } finally {
      m.dispose();
    }
  });
  it("generate_media mirrors its call as a top-level command row for the confirmation and the output", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path === "/v1/videos/generations") return json({ request_id: "req-1" });
      if (path === "/v1/videos/req-1") return json({ status: "done", video: { url: "https://vidgen.x.ai/v.mp4", duration: 5 } });
      if (path === "/openai/v1/videos/req-1/content") return new Response(mp4);
      return serve(url, init);
    };
    const appended = [];
    const root = {
      id: "s-root",
      options: { provider: "cli-proxy", model: "claude-opus-5-5" },
      session: {
        id: "s-root",
        requestHeader: () => undefined,
        append: (type, data) => appended.push({ type, data }),
      },
    };
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        approval: { effectivePolicy: () => "never", request: async () => { throw new Error("approval must not be used"); } },
      },
    });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: true });
      const tool = m.tools.find((candidate) => candidate.name === "generate_media");
      const pending = tool.execute(
        { kind: "video", prompt: "北方大雪", seconds: 5, resolution: "480p", model: "grok-imagine-video-1.5" },
        { agent: root, callId: "toolu_1", signal: new AbortController().signal }
      );
      let row;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=toolu_1");
        if (row.body.confirm !== undefined) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(appended[0]?.type, "command/run", "the generative call is mirrored before the confirmation");
      assert.deepEqual(
        { name: appended[0].data.name, commandId: appended[0].data.commandId },
        { name: "cpa-video", commandId: "toolu_1" }
      );
      assert.match(appended[0].data.args, /北方大雪/);
      assert.equal(row.body.confirm.kind, "video");
      assert.match(row.body.confirm.zh, /北方大雪/);
      const answer = await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-root", commandId: "toolu_1", allow: true });
      assert.equal(answer.code, 200, JSON.stringify(answer.body));
      const out = await pending;
      assert.equal(out.status, "done");
      assert.equal(out.files.length, 1);
      const done = appended.find((entry) => entry.type === "command/done");
      assert.equal(done?.data.kind, "success", "the mirrored row settles for the same run");
    } finally {
      m.dispose();
    }
  });

  it("asks the session's chat model for parameters the rules missed; explicit options win and the prompt only loses words", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const posts = [];
    const llmCalls = [];
    let answer = () => "{}";
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && (path.startsWith("/v1/videos/") || path.startsWith("/v1/images/"))) {
        const body = JSON.parse(init.body);
        posts.push({ path, body });
        if (path.startsWith("/v1/images/")) return new Response(JSON.stringify({ data: Array.from({ length: body.n }, () => ({ b64_json: png.toString("base64") })) }));
        return new Response(JSON.stringify({ request_id: `req-${posts.length}` }));
      }
      if (/^\/v1\/videos\/req-\d+$/.test(path)) return new Response(JSON.stringify({ status: "pending" }));
      return serve(url, init);
    };
    const llm = {
      async *stream(options) {
        llmCalls.push(options);
        const text = answer(options);
        if (text instanceof Error) throw text;
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: text.slice(0, 5) };
        yield { type: "text-delta", index: 0, text: text.slice(5) };
        yield { type: "finish", reason: "stop" };
      },
    };
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir }, attachments: { readImage: async (ref) => ({ ref, data: png }) }, llm },
    });
    const agent = { id: "s-1", options: { provider: "cli-proxy", model: "gpt-5.5" }, session: { id: "s-1", requestHeader: () => ({ config: { provider: "cli-proxy", model: "claude-opus-4-7" } }) } };
    const signal = new AbortController().signal;
    const run = (name, rawInput, attachments, commandId) => m.commands.find((c) => c.name === name).handler({ agent, rawInput, attachments, signal, commandId });
    const image = { type: "image", attachment: { mediaType: "image/png" } };
    const until = async (predicate) => {
      for (let i = 0; i < 200 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 5));
    };
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      // Plain language the rules cannot read: length, quality, orientation and how the two images are used.
      answer = () => JSON.stringify({ seconds: "10", resolution: "720P", aspect: "9：16", frames: "first-last", prompt: "从白天慢慢变成黑夜" });
      let result = await run("cpa-video", "-r 480p 做成十秒钟的竖版高清视频，第二张当结尾，从白天慢慢变成黑夜", [image, image], "cmd-i-1");
      assert.equal(result.kind, "success", result.text);
      await until(() => posts.length === 1);
      assert.equal(llmCalls[0].provider, "cli-proxy");
      assert.equal(llmCalls[0].model, "claude-opus-4-7", "the model the session last used");
      assert.equal(llmCalls[0].purpose, "cpa-media-params");
      assert.ok(!/resolution:/.test(llmCalls[0].system), "a field set by an option is not asked for");
      assert.match(llmCalls[0].messages[0].content[0].text, /Attached images: 2/);
      const body = posts[0].body;
      assert.equal(body.duration, 10);
      assert.equal(body.resolution, "480p", "the explicit -r wins");
      assert.equal(body.aspect_ratio, "9:16");
      assert.ok(body.image && body.last_frame && body.reference_images === undefined, "first and last frame");
      assert.equal(body.prompt, "从白天慢慢变成黑夜");
      let row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-i-1");
      assert.equal(row.body.run.mode, "first-last");
      assert.equal(row.body.run.seconds, 10);
      assert.deepEqual(row.body.run.interpreted, { by: "cli-proxy/claude-opus-4-7", items: ["10s", "9:16", "first-last"], prompt: true });

      // A rewritten prompt is not accepted: the original is sent.
      answer = () => JSON.stringify({ seconds: 6, prompt: "A cat surfing on a big wave at sunset" });
      await run("cpa-video", "一只猫在冲浪", [], "cmd-i-2");
      await until(() => posts.length === 2);
      assert.equal(posts[1].body.prompt, "一只猫在冲浪");
      assert.equal(posts[1].body.duration, 6);

      // A failed call never blocks the run.
      answer = () => new Error("model unavailable");
      await run("cpa-video", "一只猫在冲浪", [], "cmd-i-3");
      await until(() => posts.length === 3);
      assert.equal(posts[2].body.prompt, "一只猫在冲浪");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-i-3");
      assert.equal(row.body.run.interpreted.failed, true);

      // Images: count and ratio.
      answer = () => JSON.stringify({ count: 3, aspect: "16:9", prompt: "海边的灯塔" });
      result = await run("cpa-image", "来三张横版的 海边的灯塔", [], "cmd-i-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-i-4");
      assert.equal(row.body.run.status, "done", JSON.stringify(row.body.run));
      assert.equal(posts[3].body.n, 3);
      assert.equal(posts[3].body.aspect_ratio, "16:9");
      assert.equal(posts[3].body.prompt, "海边的灯塔");
      assert.equal(row.body.run.count, 3);

      // Extension length in words.
      writeFileSync(join(workDir, "clip.mp4"), Buffer.concat([Buffer.from([0, 0, 0, 0x10]), Buffer.from("ftypisom"), Buffer.alloc(4)]));
      answer = () => JSON.stringify({ seconds: 5, prompt: "镜头拉远" });
      result = await run("cpa-video-extend", "--video clip.mp4 再加五秒，镜头拉远", [], "cmd-i-5");
      assert.equal(result.kind, "success", result.text);
      await until(() => posts.length === 5);
      assert.equal(posts[4].path, "/v1/videos/extensions");
      assert.equal(posts[4].body.duration, 5);
    } finally {
      m.dispose();
    }
  });});
