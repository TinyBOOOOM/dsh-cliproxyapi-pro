// Host unit tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCpaRoot, discoveryCandidates, parseCatalog, filterModels, sortModelsNewestFirst, buildPiAiRoutes, resolveConfig, applyModelOverride, nativeProtocol, CpaRuntime } from "../../lib/index.js";




import { fakeCpa } from "../helpers/host-catalog.mjs";

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
