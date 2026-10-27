// Constants, credential references and account configuration normalization.



export const PACKAGE_NAME = "dsh-cliproxyapi-pro";
export const name = "dsh-cliproxyapi-pro";
export const inject = ["settings"];

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_PROVIDER = "cli-proxy";
export const DEFAULT_DISPLAY_NAME = "CLI Proxy API";
export const DEFAULT_API_KEY_ENV = "CLI_PROXY_API_KEY";
export const STATE_VERSION = 2;
export const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Per-account settings; everything else in the state file is global. */
export const ACCOUNT_FIELDS = [
  "enabled",
  "provider",
  "displayName",
  "baseURL",
  "apiKeyEnv",
  "protocol",
  "protocolMode",
  "includePrefix",
  "excludePrefix",
  "selectedModels",
  "modelOverrides",
];
export const GLOBAL_FIELDS = ["refreshIntervalSeconds", "probeTimeoutMs"];
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 300;
export const DEFAULT_PROBE_TIMEOUT_MS = 5000;

export const LOCAL_CANDIDATES = [
  "http://127.0.0.1:8317",
  "http://localhost:8317",
  "http://[::1]:8317",
];

/**
 * Most models {@link recommendModels} picks for an account that has no saved
 * selection yet: one per model family, so the picker starts small.
 */
export const MAX_RECOMMENDED_MODELS = 12;

export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
export const PI_AI_NS = "llm-pi-ai";
export const REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** Wire protocols the DSH llm-pi-ai adapter accepts on a hand-declared route. */
export const PROTOCOLS = ["openai-completions", "openai-responses", "anthropic-messages"];
/** Route-key suffix and display-name label of each protocol's route. */
export const PROTOCOL_ROUTES = {
  "openai-completions": { suffix: "", label: "" },
  "openai-responses": { suffix: "-responses", label: " (OpenAI Responses)" },
  "anthropic-messages": { suffix: "-messages", label: " (Claude Messages)" },
};
export const DEFAULT_MODEL_NS = "agent-default-model";
export const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function toCredentialRef(value) {
  const trimmed = String(value ?? "").trim();
  if (!REF_PATTERN.test(trimmed)) {
    throw new TypeError(`credential ref "${trimmed}" must match ${String(REF_PATTERN)}`);
  }
  return trimmed;
}

export function getEnvValue(ctx, varName) {
  try {
    const launchEnv = ctx.get?.("launchEnvironment");
    if (launchEnv && typeof launchEnv.get === "function") {
      const hit = launchEnv.get(varName);
      if (hit && typeof hit.value === "string" && hit.value.length > 0) {
        return hit.value;
      }
    }
  } catch {}
  const raw = process.env[varName];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function readVolatile(field, fallback) {
  if (field !== undefined && field !== null && typeof field.get === "function") {
    const val = field.get();
    return val === undefined || val === null ? fallback : val;
  }
  return field === undefined || field === null ? fallback : field;
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed !== "" && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

export const OVERRIDE_LIMITS = {
  contextWindow: 10_000_000,
  maxTokens: 2_000_000,
};

export function normalizePositiveInteger(value, max) {
  if (typeof value === "string" && value.trim() !== "") {
    if (!/^\d+$/.test(value.trim())) return undefined;
    value = Number(value.trim());
  }
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= max
    ? value
    : undefined;
}

export function normalizeModelOverrides(value) {
  const raw = readVolatile(value, undefined);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (typeof id !== "string" || id.trim() === "") continue;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const normalized = {};
    const contextWindow = normalizePositiveInteger(entry.contextWindow, OVERRIDE_LIMITS.contextWindow);
    const maxTokens = normalizePositiveInteger(entry.maxTokens, OVERRIDE_LIMITS.maxTokens);
    if (contextWindow !== undefined) normalized.contextWindow = contextWindow;
    if (maxTokens !== undefined) normalized.maxTokens = maxTokens;
    if (entry.image === true || entry.image === false) normalized.image = entry.image;
    if (typeof entry.protocol === "string" && PROTOCOLS.includes(entry.protocol)) {
      normalized.protocol = entry.protocol;
    }
    if (Array.isArray(entry.reasoningLevels)) {
      const levels = [];
      for (const level of entry.reasoningLevels) {
        if (typeof level !== "string") continue;
        const mapped = level.trim().toLowerCase();
        if (REASONING_LEVELS.includes(mapped) && !levels.includes(mapped)) levels.push(mapped);
      }
      normalized.reasoningLevels = levels;
    }
    if (Object.keys(normalized).length > 0) out[id.trim()] = normalized;
  }
  return out;
}

export function resolveConfig(rawConfig = {}) {
  const providerRaw = String(readVolatile(rawConfig?.provider, DEFAULT_PROVIDER)).trim();
  const provider = providerRaw || DEFAULT_PROVIDER;
  const displayNameRaw = String(readVolatile(rawConfig?.displayName, DEFAULT_DISPLAY_NAME)).trim();
  const displayName = displayNameRaw || DEFAULT_DISPLAY_NAME;
  const apiKeyEnvRaw = String(readVolatile(rawConfig?.apiKeyEnv, DEFAULT_API_KEY_ENV)).trim();
  const apiKeyEnv = apiKeyEnvRaw || DEFAULT_API_KEY_ENV;
  const baseURL = String(readVolatile(rawConfig?.baseURL, "")).trim();
  const protocolRaw = String(readVolatile(rawConfig?.protocol, "openai-completions")).trim();
  const protocol =
    protocolRaw === "openai-responses" || protocolRaw === "anthropic-messages"
      ? protocolRaw
      : "openai-completions";
  const protocolMode =
    String(readVolatile(rawConfig?.protocolMode, "auto")).trim() === "fixed" ? "fixed" : "auto";
  const refreshRaw = Number(
    readVolatile(rawConfig?.refreshIntervalSeconds, DEFAULT_REFRESH_INTERVAL_SECONDS)
  );
  const refreshIntervalSeconds =
    Number.isFinite(refreshRaw) && refreshRaw >= 15 && refreshRaw <= 86400
      ? Math.floor(refreshRaw)
      : DEFAULT_REFRESH_INTERVAL_SECONDS;
  const timeoutRaw = Number(readVolatile(rawConfig?.probeTimeoutMs, DEFAULT_PROBE_TIMEOUT_MS));
  const probeTimeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 250 && timeoutRaw <= 60000
      ? Math.floor(timeoutRaw)
      : DEFAULT_PROBE_TIMEOUT_MS;
  const includePrefix = String(readVolatile(rawConfig?.includePrefix, "")).trim();
  const excludePrefix = String(readVolatile(rawConfig?.excludePrefix, "")).trim();
  const selectedModels = normalizeStringList(readVolatile(rawConfig?.selectedModels, undefined));
  const modelOverrides = normalizeModelOverrides(rawConfig?.modelOverrides);

  return {
    id: normalizeAccountId(readVolatile(rawConfig?.id, DEFAULT_ACCOUNT_ID)) ?? DEFAULT_ACCOUNT_ID,
    enabled: readVolatile(rawConfig?.enabled, true) !== false,
    provider,
    displayName,
    baseURL,
    apiKeyEnv,
    protocol,
    protocolMode,
    refreshIntervalSeconds,
    probeTimeoutMs,
    includePrefix,
    excludePrefix,
    ...(selectedModels === undefined ? {} : { selectedModels }),
    modelOverrides,
  };
}

export function normalizeAccountId(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return ACCOUNT_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}
