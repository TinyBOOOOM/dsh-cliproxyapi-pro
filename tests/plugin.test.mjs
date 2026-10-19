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
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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

function harness(initialState, servers) {
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

  it("apply() migrates the legacy state file and serves tool, commands and routes", async () => {
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
      inject: (_deps, fn) => fn(sub),
      logger: { info() {}, warn() {} },
    };
    const sub = {
      ...ctx,
      commands: { register: (c) => (commands.push(c), () => {}) },
      tools: { register: (t) => (tools.push(t), () => {}) },
      webServer: { register: (r) => (routes.set(r.path, r.handler), () => {}) },
    };
    try {
      apply(ctx, {});
      const saved = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8"));
      assert.equal(saved.version, 2);
      assert.equal(saved.accounts[0].id, "default");
      assert.deepEqual(saved.accounts[0].selectedModels, ["claude-opus-5-5"]);
      assert.ok(existsSync(join(stateDir, "state.v1.json")));

      const tool = tools[0];
      let out = await tool.execute({ action: "refresh" });
      assert.equal(out.accounts[0].state, "connected", out.summary);
      assert.deepEqual(providers["cli-proxy-messages"].models.map((m) => m.id), ["claude-opus-5-5"]);

      out = await tool.execute({ action: "add_account", baseURL: "http://b.test", apiKey: "key-b", displayName: "Backup", selectedModels: ["gpt-6-astra"] });
      assert.equal(out.account, "account-2");
      assert.equal(out.accounts[1].enabled, true);
      assert.equal(out.accounts[1].state, "connected", out.summary);
      assert.equal(providers["cli-proxy-2-responses"].displayName, "Backup (OpenAI Responses)");

      out = await tool.execute({ action: "configure", account: "account-2", enabled: false });
      assert.equal(out.accounts[1].state, "disabled");
      assert.equal(providers["cli-proxy-2-responses"], undefined);
      assert.match(out.summary, /disabled/);

      const status = await commands.find((c) => c.name === "cpa-status").handler();
      assert.match(status.text, /accounts: 2 \(1 enabled\)/);

      // HTTP route: remove the second account.
      const handler = routes.get("/api/dsh-cliproxyapi/accounts/remove");
      const body = JSON.stringify({ accountId: "account-2" });
      const req = {
        method: "POST",
        headers: { host: "127.0.0.1:1" },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(body);
        },
      };
      let sent;
      const res = { writeHead: (code) => (sent = { code }), end: (text) => (sent.body = JSON.parse(text)) };
      await handler(req, res);
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.accounts.length, 1);
      assert.equal(JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8")).accounts.length, 1);
    } finally {
      globalThis.fetch = realFetch;
      for (const d of disposers) d();
    }
  });
});
