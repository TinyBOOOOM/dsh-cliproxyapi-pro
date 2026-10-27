// Native wire protocols, model overrides and managed llm-pi-ai route profiles.

import { name, REASONING_LEVELS, PROTOCOLS, PROTOCOL_ROUTES } from "./config.js";
import { filterModels, sortModelsNewestFirst } from "./models.js";

/**
 * Pick the wire protocol that reaches a model with the fewest translations.
 *
 * CLIProxyAPI serves every model on OpenAI Chat, OpenAI Responses and
 * Anthropic Messages and translates between them and the upstream channel.
 * Speaking the upstream's own protocol skips that translation:
 *   - Claude family  -> Anthropic Messages (`/v1/messages`)
 *   - OpenAI / Codex / Grok -> OpenAI Responses (`/v1/responses`)
 *   - everything else, including Gemini -> OpenAI Chat Completions; DSH
 *     cannot speak Gemini generateContent on a custom route.
 * `owned_by` from the CPA listing names the family; the id is the fallback.
 * @param model - parsed catalog model.
 * @returns one of {@link PROTOCOLS}.
 */
export function nativeProtocol(model) {
  const owner = String(model.ownedBy ?? "").toLowerCase();
  const bare = String(model.id ?? "").toLowerCase().split("/").pop() ?? "";
  if (owner === "anthropic" || /^claude/.test(bare)) return "anthropic-messages";
  if (owner === "openai" || owner === "xai") return "openai-responses";
  if (/^(gpt|o\d|codex|grok)/.test(bare) && !/^gpt-oss/.test(bare)) return "openai-responses";
  return "openai-completions";
}

/** The protocol a model is synchronized with under the given config. */
export function modelProtocol(model, config) {
  const override = config.modelOverrides?.[model.id]?.protocol;
  if (override !== undefined) return override;
  return config.protocolMode === "fixed" ? config.protocol : nativeProtocol(model);
}

/** The DSH route key carrying one protocol. */
export function routeKeyFor(provider, protocol) {
  return `${provider}${PROTOCOL_ROUTES[protocol].suffix}`;
}

export function routeBaseURL(rootURL, protocol) {
  return protocol === "anthropic-messages" ? rootURL : `${rootURL}/v1`;
}

export function supportedReasoning(model) {
  if (!model.reasoning) return undefined;
  const declared = new Set(model.reasoningLevels);
  const levels =
    declared.size === 0
      ? REASONING_LEVELS
      : REASONING_LEVELS.filter((level) => declared.has(level));
  const result = {};
  for (const level of levels) {
    result[level] = level === "off" ? null : model.reasoningWire?.[level] ?? level;
  }
  return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Claude models that take adaptive thinking with an `effort` value rather
 * than a token budget: Opus/Sonnet 4.6+, Haiku 5+, Fable and every 5.x.
 * Older Claude models keep budget-based thinking.
 */
export function claudeUsesAdaptiveThinking(model) {
  const bare = String(model.id).toLowerCase().split("/").pop() ?? "";
  if (/^claude-fable/.test(bare)) return true;
  const match = bare.match(/^claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (match === null) return /^claude-\d+-fable/.test(bare);
  const major = Number(match[1]);
  const minor = match[2] !== undefined && match[2].length <= 2 ? Number(match[2]) : 0;
  return major > 4 || (major === 4 && minor >= 6);
}

export function applyModelOverride(model, override) {
  if (override === undefined) return model;
  const next = { ...model };
  if (override.contextWindow !== undefined) next.contextWindow = override.contextWindow;
  if (override.maxTokens !== undefined) next.maxTokens = override.maxTokens;
  if (override.image === true || override.image === false) {
    const rest = model.inputModalities.filter((item) => item !== "image");
    next.inputModalities = override.image ? [...new Set(["text", "image", ...rest])] : rest.length > 0 ? rest : ["text"];
  }
  if (Array.isArray(override.reasoningLevels)) {
    next.reasoningLevels = [...override.reasoningLevels];
    next.reasoning = override.reasoningLevels.some((level) => level !== "off");
  }
  return next;
}

export function protocolCompat(model, protocol, hasReasoning) {
  if (protocol === "openai-completions") {
    return hasReasoning ? { supportsReasoningEffort: true, thinkingFormat: "openai" } : undefined;
  }
  if (protocol === "anthropic-messages") {
    return hasReasoning && claudeUsesAdaptiveThinking(model)
      ? { forceAdaptiveThinking: true }
      : undefined;
  }
  return undefined;
}

export function toPiAiModelProfile(model, protocol) {
  const reasoningEfforts = supportedReasoning(model);
  const compat = protocolCompat(model, protocol, reasoningEfforts !== undefined);
  return {
    id: model.id,
    ...(model.name === undefined ? {} : { name: model.name }),
    contextWindow: model.contextWindow ?? 262144,
    maxTokens: model.maxTokens ?? 64000,
    input: model.inputModalities.includes("image") ? ["text", "image"] : ["text"],
    ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
    ...(compat === undefined ? {} : { compat }),
  };
}

/**
 * Build one llm-pi-ai route per protocol the selected models need.
 * The base route key (e.g. `cli-proxy`) always carries OpenAI Chat so that
 * existing sessions and the default-model setting keep resolving; Responses
 * and Messages models get `<key>-responses` / `<key>-messages` siblings.
 * @returns `{ allModels, orderedModels, routes }` where `routes` maps each
 *   route key to its profile, in protocol order, and every ordered model
 *   carries its `protocol` and `route`.
 */
/** Whether a model belongs in chat routes: `kind` (with overrides) or detection says chat. */
export function isChatModel(model) {
  return (model.kind ?? model.detectedKind ?? "chat") === "chat";
}

export function buildPiAiRoutes(config, discovery, hasApiKey) {
  const allOrdered = sortModelsNewestFirst(discovery.models);
  // Image / video models are served by CPA's media endpoints, never by chat routes.
  const chatOrdered = allOrdered.filter(isChatModel);
  const filtered = filterModels(chatOrdered, config).map((model) => {
    const effective = applyModelOverride(model, config.modelOverrides?.[model.id]);
    const protocol = modelProtocol(model, config);
    return { ...effective, protocol, route: routeKeyFor(config.provider, protocol) };
  });
  if (filtered.length === 0) {
    throw new Error(
      `dsh-cliproxyapi: none of the selected models matched the ${chatOrdered.length} chat model(s) offered by ${discovery.rootURL}. Select models in Settings → CLIProxyAPI → Models.`
    );
  }
  const auth = hasApiKey
    ? { apiKeyEnv: config.apiKeyEnv }
    : { headers: { Authorization: "Bearer cpa-local" } };
  const routes = {};
  for (const protocol of PROTOCOLS) {
    const members = filtered.filter((m) => m.protocol === protocol);
    if (members.length === 0) continue;
    routes[routeKeyFor(config.provider, protocol)] = {
      displayName: `${config.displayName}${PROTOCOL_ROUTES[protocol].label}`,
      api: protocol,
      baseURL: routeBaseURL(discovery.rootURL, protocol),
      models: members.map((m) => toPiAiModelProfile(m, protocol)),
      ...auth,
    };
  }
  return { allModels: allOrdered, orderedModels: filtered, routes };
}

/** Every route key this plugin may own under a provider prefix. */
export function managedRouteKeys(provider) {
  return PROTOCOLS.map((protocol) => routeKeyFor(provider, protocol));
}
