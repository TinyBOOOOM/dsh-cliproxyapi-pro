// Zero-external-dependency host plugin for DSH CLIProxyAPI auto-discovery, model selection & sync.
// Uses only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.tools`, `ctx.webServer`).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  createPluginUpdater, loadUpdateSettings, saveUpdateSettings, storeUpdatePackage,
  UPDATE_INTERVAL_MS, UpdateError,
} from "./updater.js";
import { createQuotaController } from "./quota.js";

// #region Constants & Config Resolution

export const PACKAGE_NAME = "dsh-cliproxyapi-pro";
export const name = "dsh-cliproxyapi-pro";
export const inject = ["settings"];

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_PROVIDER = "cli-proxy";
export const DEFAULT_DISPLAY_NAME = "CLI Proxy API";
export const DEFAULT_API_KEY_ENV = "CLI_PROXY_API_KEY";
export const STATE_VERSION = 2;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
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
const GLOBAL_FIELDS = ["refreshIntervalSeconds", "probeTimeoutMs"];
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

const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const PI_AI_NS = "llm-pi-ai";
const REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
/** Wire protocols the DSH llm-pi-ai adapter accepts on a hand-declared route. */
export const PROTOCOLS = ["openai-completions", "openai-responses", "anthropic-messages"];
/** Route-key suffix and display-name label of each protocol's route. */
const PROTOCOL_ROUTES = {
  "openai-completions": { suffix: "", label: "" },
  "openai-responses": { suffix: "-responses", label: " (OpenAI Responses)" },
  "anthropic-messages": { suffix: "-messages", label: " (Claude Messages)" },
};
const DEFAULT_MODEL_NS = "agent-default-model";
const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function toCredentialRef(value) {
  const trimmed = String(value ?? "").trim();
  if (!REF_PATTERN.test(trimmed)) {
    throw new TypeError(`credential ref "${trimmed}" must match ${String(REF_PATTERN)}`);
  }
  return trimmed;
}

function getEnvValue(ctx, varName) {
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

function readVolatile(field, fallback) {
  if (field !== undefined && field !== null && typeof field.get === "function") {
    const val = field.get();
    return val === undefined || val === null ? fallback : val;
  }
  return field === undefined || field === null ? fallback : field;
}

function normalizeStringList(value) {
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

const OVERRIDE_LIMITS = {
  contextWindow: 10_000_000,
  maxTokens: 2_000_000,
};

function normalizePositiveInteger(value, max) {
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

// #endregion

// #region Accounts

export function normalizeAccountId(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return ACCOUNT_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** The persisted shape of one account: its settings without the globals. */
export function pickAccount(resolved) {
  return {
    id: resolved.id,
    enabled: resolved.enabled,
    provider: resolved.provider,
    displayName: resolved.displayName,
    baseURL: resolved.baseURL,
    apiKeyEnv: resolved.apiKeyEnv,
    protocol: resolved.protocol,
    protocolMode: resolved.protocolMode,
    includePrefix: resolved.includePrefix,
    excludePrefix: resolved.excludePrefix,
    ...(resolved.selectedModels === undefined ? {} : { selectedModels: resolved.selectedModels }),
    modelOverrides: resolved.modelOverrides,
  };
}

function pickFields(source, fields) {
  const out = {};
  if (typeof source !== "object" || source === null) return out;
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field];
  return out;
}

function plainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

/**
 * Normalize the state file into `{ version, refreshIntervalSeconds,
 * probeTimeoutMs, accounts[] }`. A legacy single-account file (flat fields,
 * no `accounts` array) becomes one account with id `default`, so its
 * provider route, key reference and model selection carry over unchanged.
 * Invalid or duplicate account ids are replaced with generated ones.
 */
export function normalizeState(raw = {}) {
  const source = plainObject(raw) ?? {};
  const globals = resolveConfig(pickFields(source, GLOBAL_FIELDS));
  const rawAccounts = Array.isArray(source.accounts)
    ? source.accounts
    : [{ ...pickFields(source, ACCOUNT_FIELDS), id: DEFAULT_ACCOUNT_ID }];
  const accounts = [];
  const ids = new Set();
  for (const entry of rawAccounts) {
    if (plainObject(entry) === undefined) continue;
    let id = normalizeAccountId(entry.id);
    if (id === undefined || ids.has(id)) {
      let n = accounts.length + 1;
      while (ids.has(`account-${n}`)) n += 1;
      id = `account-${n}`;
    }
    ids.add(id);
    accounts.push(pickAccount(resolveConfig({ ...pickFields(entry, ACCOUNT_FIELDS), id })));
  }
  return {
    version: STATE_VERSION,
    refreshIntervalSeconds: globals.refreshIntervalSeconds,
    probeTimeoutMs: globals.probeTimeoutMs,
    accounts,
  };
}

/**
 * Overlay the host-supplied plugin config on the persisted state. A config
 * with `accounts` replaces the account list; flat legacy fields apply to the
 * first account, as they did when only one account existed.
 */
export function mergeHostConfig(persisted, config) {
  const host = plainObject(config) ?? {};
  const base = plainObject(persisted) ?? {};
  if (!Array.isArray(base.accounts) || Array.isArray(host.accounts)) return { ...base, ...host };
  const flat = pickFields(host, ACCOUNT_FIELDS);
  const accounts = [...base.accounts];
  if (Object.keys(flat).length > 0 && accounts.length > 0) accounts[0] = { ...accounts[0], ...flat };
  return { ...base, ...pickFields(host, GLOBAL_FIELDS), accounts };
}

/**
 * Accounts whose managed route keys overlap an earlier account's. Each one
 * maps to the id of the account that already owns the keys.
 */
export function accountConflicts(accounts) {
  const owners = new Map();
  const conflicts = new Map();
  for (const account of accounts) {
    const keys = managedRouteKeys(account.provider);
    const clash = keys.map((key) => owners.get(key)).find((owner) => owner !== undefined);
    if (clash !== undefined) {
      conflicts.set(account.id, clash);
      continue;
    }
    for (const key of keys) owners.set(key, account.id);
  }
  return conflicts;
}

export function assertNoConflicts(accounts) {
  const conflicts = accountConflicts(accounts);
  for (const [id, ownerId] of conflicts) {
    const account = accounts.find((a) => a.id === id);
    const owner = accounts.find((a) => a.id === ownerId);
    throw new Error(
      `dsh-cliproxyapi: provider route "${account?.provider}" of account "${account?.displayName ?? id}" overlaps the routes of account "${owner?.displayName ?? ownerId}". Every account needs its own Provider Route ID.`
    );
  }
}

/**
 * Defaults for a newly added account: the first free `cli-proxy-N` route,
 * its own credential reference, and disabled until the user fills it in.
 * When no account owns `cli-proxy`, the new account takes the classic names.
 */
export function newAccountDefaults(accounts) {
  const usedIds = new Set(accounts.map((a) => a.id));
  const usedKeys = new Set(accounts.flatMap((a) => managedRouteKeys(a.provider)));
  const usedRefs = new Set(accounts.map((a) => a.apiKeyEnv));
  const free = (provider) => managedRouteKeys(provider).every((key) => !usedKeys.has(key));
  const base = {
    enabled: false,
    baseURL: "",
    protocol: "openai-completions",
    protocolMode: "auto",
    includePrefix: "",
    excludePrefix: "",
    // No selectedModels: the first successful probe seeds recommendModels().
    modelOverrides: {},
  };
  if (!usedIds.has(DEFAULT_ACCOUNT_ID) && free(DEFAULT_PROVIDER) && !usedRefs.has(DEFAULT_API_KEY_ENV)) {
    return {
      ...base,
      id: DEFAULT_ACCOUNT_ID,
      provider: DEFAULT_PROVIDER,
      displayName: DEFAULT_DISPLAY_NAME,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
    };
  }
  let n = Math.max(2, accounts.length + 1);
  while (
    usedIds.has(`account-${n}`) ||
    !free(`${DEFAULT_PROVIDER}-${n}`) ||
    usedRefs.has(`${DEFAULT_API_KEY_ENV}_${n}`)
  ) {
    n += 1;
  }
  return {
    ...base,
    id: `account-${n}`,
    provider: `${DEFAULT_PROVIDER}-${n}`,
    displayName: `${DEFAULT_DISPLAY_NAME} ${n}`,
    apiKeyEnv: `${DEFAULT_API_KEY_ENV}_${n}`,
  };
}

/**
 * Apply an account patch from the UI or the tool. `selectedModels` and
 * `modelOverrides` replace the stored value when present; the id never changes.
 */
export function patchAccount(account, patch) {
  const fields = pickFields(patch, ACCOUNT_FIELDS);
  const next = { ...account, ...fields, id: account.id };
  if (patch !== null && typeof patch === "object" && "selectedModels" in patch) {
    next.selectedModels = Array.isArray(patch.selectedModels)
      ? normalizeStringList(patch.selectedModels) ?? []
      : [];
  }
  if (patch !== null && typeof patch === "object" && "modelOverrides" in patch) {
    next.modelOverrides = normalizeModelOverrides(patch.modelOverrides);
  }
  return pickAccount(resolveConfig(next));
}

// #endregion

// #region Persistent State Store

export function resolveStateFilePath(ctx) {
  try {
    const profileCtx = ctx?.get?.("profileContext");
    if (profileCtx && typeof profileCtx.dir === "string" && profileCtx.dir.trim() !== "") {
      return join(profileCtx.dir.trim(), ".dsh-cliproxyapi", "state.json");
    }
  } catch {}
  const dshHome =
    process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ""
      ? process.env.DSH_HOME.trim()
      : join(homedir(), ".dsh");
  return join(dshHome, "dsh-cliproxyapi", "state.json");
}

export function loadPersistedState(filePath) {
  try {
    if (!existsSync(filePath)) return {};
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function savePersistedState(filePath, state) {
  try {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, filePath);
  } catch {}
}

// #endregion

// #region Discovery & Catalog Parsing

function positiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function firstPositiveInteger(source, fields) {
  for (const field of fields) {
    const value = positiveInteger(source[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function catalogArray(payload) {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.data)) return payload.data;
  return undefined;
}

function rawReasoningEfforts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : typeof item === "object" && item !== null && typeof item.effort === "string"
        ? item.effort
        : ""
    )
    .map((raw) => raw.trim().toLowerCase())
    .filter(Boolean);
}

function parseReasoningLevels(value) {
  const levels = [];
  for (const normalized of rawReasoningEfforts(value)) {
    const mapped =
      normalized === "none" ? "off" : normalized === "ultra" ? "max" : normalized;
    if (REASONING_LEVELS.includes(mapped) && !levels.includes(mapped)) {
      levels.push(mapped);
    }
  }
  return levels;
}

/**
 * Wire spellings that differ from the DSH level name: a catalog offering only
 * `ultra` sends `ultra` for DSH `max`; one also offering `max` keeps `max`.
 */
function parseReasoningWire(value) {
  const raw = new Set(rawReasoningEfforts(value));
  return raw.has("ultra") && !raw.has("max") ? { max: "ultra" } : {};
}

export function normalizeCpaRoot(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") throw new Error("empty CPA baseURL");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol ${url.protocol}`);
  }
  url.search = "";
  url.hash = "";
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/(?:v1(?:\/messages|\/chat\/completions|\/responses)?|backend-api)$/i, "");
  url.pathname = path === "" ? "/" : `${path}/`;
  return url.toString().replace(/\/$/, "");
}

/**
 * Probe order: the configured URL, then (only with `autoDiscover`, the
 * default) the account's existing route, `CLIPROXYAPI_BASE_URL` and the local
 * ports. Accounts with an explicit URL never fall back to another server, so
 * one account can't silently mirror another.
 */
export function discoveryCandidates(options) {
  const raw =
    options.autoDiscover === false
      ? [options.baseURL]
      : [options.baseURL, options.fallbackBaseURL, options.environmentBaseURL, ...LOCAL_CANDIDATES];
  const result = [];
  for (const candidate of raw) {
    if (candidate === undefined || String(candidate).trim() === "") continue;
    try {
      const normalized = normalizeCpaRoot(candidate);
      if (!result.includes(normalized)) result.push(normalized);
    } catch {
      if (candidate === options.baseURL && String(options.baseURL).trim() !== "") {
        throw new Error(`dsh-cliproxyapi: invalid baseURL "${candidate}"`);
      }
    }
  }
  return result;
}

export function parseCatalog(payload) {
  const catalog = catalogArray(payload);
  if (catalog === undefined) {
    throw new Error("response does not contain a models or data array");
  }
  const models = new Map();
  for (const item of catalog) {
    if (typeof item !== "object" || item === null) continue;
    if (String(item.visibility ?? "").toLowerCase() === "hide") continue;
    const rawId = item.slug ?? item.id;
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (id === "" || models.has(id)) continue;
    const inputModalities = stringArray(item.input_modalities ?? item.inputModalities).map((v) =>
      v.toLowerCase()
    );
    const rawLevels = item.supported_reasoning_levels ?? item.reasoning_levels;
    const levels = parseReasoningLevels(rawLevels);
    const reasoningWire = parseReasoningWire(rawLevels);
    const contextWindow = firstPositiveInteger(item, [
      "context_window",
      "max_context_window",
      "context_length",
      "contextWindow",
    ]);
    const maxTokens = firstPositiveInteger(item, [
      "max_output_tokens",
      "max_tokens",
      "maxTokens",
    ]);
    const rawName = item.display_name ?? item.name;
    models.set(id, {
      id,
      ...(typeof rawName === "string" && rawName.trim() !== "" ? { name: rawName.trim() } : {}),
      ...(typeof item.owned_by === "string" && item.owned_by.trim() !== ""
        ? { ownedBy: item.owned_by.trim() }
        : {}),
      ...(typeof item.provider === "string" && item.provider.trim() !== ""
        ? { provider: item.provider.trim() }
        : {}),
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
      inputModalities: inputModalities.length > 0 ? inputModalities : ["text"],
      reasoning: item.reasoning === true || levels.some((level) => level !== "off"),
      reasoningLevels: levels,
      ...(Object.keys(reasoningWire).length === 0 ? {} : { reasoningWire }),
    });
  }
  return [...models.values()];
}

async function readBoundedJson(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) {
    throw new Error("catalog is larger than 8 MiB");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) {
    throw new Error("catalog is larger than 8 MiB");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("catalog is not valid JSON");
  }
}

async function fetchOwners(fetchImpl, rootURL, options, signal) {
  const owners = new Map();
  try {
    const response = await fetchImpl(`${rootURL}/v1/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(options.apiKey === undefined || options.apiKey === ""
          ? {}
          : { Authorization: `Bearer ${options.apiKey}` }),
      },
      signal,
    });
    if (!response.ok) return owners;
    const list = catalogArray(await readBoundedJson(response)) ?? [];
    for (const item of list) {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const owner = typeof item?.owned_by === "string" ? item.owned_by.trim() : "";
      if (id !== "" && owner !== "") owners.set(id, owner);
    }
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
  }
  return owners;
}

export async function discoverCpa(options) {
  const fetchImpl = options.fetch ?? fetch;
  const failures = [];
  const candidates = discoveryCandidates(options);
  for (const rootURL of candidates) {
    const modelsURL = `${rootURL}/v1/models?client_version=pi`;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
    const signal =
      options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
    try {
      const response = await fetchImpl(modelsURL, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(options.apiKey === undefined || options.apiKey === ""
            ? {}
            : { Authorization: `Bearer ${options.apiKey}` }),
        },
        signal,
      });
      if (!response.ok) {
        failures.push(`${rootURL}: HTTP ${response.status}`);
        continue;
      }
      const models = parseCatalog(await readBoundedJson(response));
      // The enriched catalog omits `owned_by`; the plain listing carries the
      // model family each upstream reports, which decides its native protocol.
      const owners = await fetchOwners(fetchImpl, rootURL, options, signal);
      return {
        rootURL,
        modelsURL,
        models: models.map((m) =>
          m.ownedBy === undefined && owners.has(m.id) ? { ...m, ownedBy: owners.get(m.id) } : m
        ),
      };
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      failures.push(`${rootURL}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`dsh-cliproxyapi: no usable CPA service found (${failures.join("; ")})`);
}

// #endregion

// #region Profile & Model Builder

function splitPrefixes(csv) {
  if (typeof csv !== "string" || csv.trim() === "") return [];
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function filterModels(models, config) {
  const includes = splitPrefixes(config.includePrefix);
  const excludes = splitPrefixes(config.excludePrefix);
  const selectedSet =
    Array.isArray(config.selectedModels) && config.selectedModels.length > 0
      ? new Set(config.selectedModels)
      : null;

  return models.filter((m) => {
    if (selectedSet !== null && !selectedSet.has(m.id)) {
      return false;
    }
    const idLower = m.id.toLowerCase();
    if (includes.length > 0 && !includes.some((p) => idLower.startsWith(p) || idLower.includes(p))) {
      return false;
    }
    if (excludes.length > 0 && excludes.some((p) => idLower.startsWith(p) || idLower.includes(p))) {
      return false;
    }
    return true;
  });
}

export function modelFamily(model) {
  const label = (model.name ?? model.id).trim().toLowerCase();
  const known = label.match(
    /^(gpt-oss|gemini|claude|gpt|grok|deepseek|qwen|glm|kimi|minimax|mistral|llama|swe|o(?=\d))/
  )?.[1];
  if (known !== undefined) return known;
  return label.split(/[\s_/-]*\d/, 1)[0]?.replace(/[\s_/-]+$/, "") || label;
}

function modelVersion(model) {
  const labels = [model.name, model.id];
  for (const label of labels) {
    if (label === undefined) continue;
    const match = label.match(/(?:^|[^\d])(\d+(?:[.-]\d+)*)/);
    if (match?.[1] !== undefined) return match[1].split(/[.-]/).map(Number);
  }
  return [];
}

function compareVersionDescending(left, right) {
  const a = modelVersion(left);
  const b = modelVersion(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sortModelsNewestFirst(models) {
  const groups = new Map();
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.get(family);
    if (group === undefined) groups.set(family, [model]);
    else group.push(model);
  }
  return [...groups.values()].flatMap((group) => [...group].sort(compareVersionDescending));
}

/**
 * A starting selection derived from the server's own catalog: the newest
 * model of each family, in catalog order, at most {@link MAX_RECOMMENDED_MODELS}.
 * Among equally new models a plain id is preferred over a prefixed one
 * (`gpt-6` over `vendor/gpt-6`).
 * @param models - parsed catalog models.
 * @returns model ids.
 */
export function recommendModels(models) {
  const groups = new Map();
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.get(family);
    if (group === undefined) groups.set(family, [model]);
    else group.push(model);
  }
  const picks = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) => compareVersionDescending(a, b) || Number(a.id.includes("/")) - Number(b.id.includes("/"))
    );
    picks.push(sorted[0].id);
    if (picks.length >= MAX_RECOMMENDED_MODELS) break;
  }
  return picks;
}

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

function routeBaseURL(rootURL, protocol) {
  return protocol === "anthropic-messages" ? rootURL : `${rootURL}/v1`;
}

function supportedReasoning(model) {
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
function claudeUsesAdaptiveThinking(model) {
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

function protocolCompat(model, protocol, hasReasoning) {
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

function toPiAiModelProfile(model, protocol) {
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
export function buildPiAiRoutes(config, discovery, hasApiKey) {
  const allOrdered = sortModelsNewestFirst(discovery.models);
  const filtered = filterModels(allOrdered, config).map((model) => {
    const effective = applyModelOverride(model, config.modelOverrides?.[model.id]);
    const protocol = modelProtocol(model, config);
    return { ...effective, protocol, route: routeKeyFor(config.provider, protocol) };
  });
  if (filtered.length === 0) {
    throw new Error(
      `dsh-cliproxyapi: none of the selected models matched the ${discovery.models.length} model(s) offered by ${discovery.rootURL}. Select models in Settings → Built-in plugins → CLIProxyAPI or with the cliproxyapi tool.`
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

// #endregion

// #region Runtime Synchronizer

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields this plugin writes; any stale copy is replaced, never merged. */
const MANAGED_ROUTE_FIELDS = ["displayName", "api", "baseURL", "models", "apiKeyEnv", "headers"];

function stripManagedFields(route) {
  const out = { ...route };
  for (const field of MANAGED_ROUTE_FIELDS) delete out[field];
  // An empty dict materialized by the schema is not a user choice.
  if (out.compat !== undefined && sameJson(out.compat, { chatTemplateKwargs: {}, chatTemplateArgs: {} })) {
    delete out.compat;
  }
  return out;
}

async function mutateSettingsSafe(settings, ns, ops) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await settings.mutate(ns, ops);
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("HMR transactions cannot be nested")) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function formatModelView(m, selectedSet, config) {
  const overrides = config?.modelOverrides ?? {};
  const override = overrides[m.id];
  const effective = applyModelOverride(m, override);
  const protocol = config === undefined ? nativeProtocol(m) : modelProtocol(m, config);
  return {
    protocol,
    nativeProtocol: nativeProtocol(m),
    ...(m.ownedBy === undefined ? {} : { ownedBy: m.ownedBy }),
    id: effective.id,
    name: effective.name ?? effective.id,
    family: modelFamily(effective),
    contextWindow: effective.contextWindow ?? 262144,
    maxTokens: effective.maxTokens ?? 64000,
    image: effective.inputModalities.includes("image"),
    reasoning: effective.reasoning,
    reasoningLevels: effective.reasoningLevels,
    selected: selectedSet.has(effective.id),
    ...(override === undefined ? {} : { override }),
    discovered: {
      contextWindow: m.contextWindow ?? 262144,
      maxTokens: m.maxTokens ?? 64000,
      image: m.inputModalities.includes("image"),
      reasoningLevels: m.reasoningLevels,
    },
  };
}

export class CpaRuntime {
  constructor(options) {
    this.options = options;
    this.activeProvider = undefined;
    this.activeRoutes = undefined;
    this.running = undefined;
    this.rerun = false;
    this.controller = new AbortController();
    this.allDiscoveredModels = [];
    this.syncedModels = [];
    this.currentStatus = {
      state: "idle",
      modelCount: 0,
      totalDiscovered: 0,
    };
  }

  status() {
    const syncedSet = new Set(this.syncedModels.map((m) => m.id));
    const config = this.options.config();
    const byId = new Map(this.allDiscoveredModels.map((m) => [m.id, m]));
    return {
      ...this.currentStatus,
      models: this.syncedModels.map((m) => ({
        ...formatModelView(byId.get(m.id) ?? m, syncedSet, config),
        route: m.route,
      })),
      allModels: this.allDiscoveredModels.map((m) => formatModelView(m, syncedSet, config)),
    };
  }

  /**
   * Run one sync. `probe: true` also reads the catalog of a disabled account
   * so its models can be picked before it is enabled; periodic refreshes of a
   * disabled account stay offline.
   */
  refresh(options = {}) {
    if (options.probe === true) this.probeRequested = true;
    if (this.running !== undefined) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.runLoop().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  dispose() {
    this.controller.abort(new Error("dsh-cliproxyapi disposed"));
    if (this.hmrRetryTimer !== undefined) clearTimeout(this.hmrRetryTimer);
  }

  /** Stop syncing and remove every route this account wrote. */
  async teardown(provider) {
    this.dispose();
    try {
      await this.running;
    } catch {}
    await this.releaseRoutes([provider, this.activeProvider]);
    this.activeProvider = undefined;
    this.activeRoutes = undefined;
  }

  /** Unset the managed route keys of the given providers that still exist. */
  async releaseRoutes(providers) {
    const reserved = this.reservedKeys();
    const keys = new Set(
      providers
        .filter((p) => typeof p === "string" && p !== "")
        .flatMap((p) => managedRouteKeys(p))
    );
    const ops = [];
    for (const key of keys) {
      if (reserved.has(key)) continue;
      if (this.options.readExistingPiAiRoute?.(key) !== undefined) {
        ops.push({ op: "unset", path: ["providers", key] });
      }
    }
    if (ops.length > 0) await mutateSettingsSafe(this.options.settings, PI_AI_NS, ops);
  }

  /**
   * An account that has never saved a selection gets the catalog's
   * recommendation once, persisted through `options.seedSelection`, so the
   * picker starts with one model per family instead of the whole catalog.
   * @returns the seeded ids, or undefined when a selection already exists.
   */
  seedSelection(config, models) {
    if (config.selectedModels !== undefined || models.length === 0) return undefined;
    const ids = recommendModels(models);
    try {
      this.options.seedSelection?.(ids);
    } catch (error) {
      this.options.logger?.warn?.(
        `dsh-cliproxyapi: could not save the initial model selection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return ids;
  }

  /** Route keys owned by other accounts, from the latest config. */
  reservedKeys() {
    try {
      const keys = this.options.config?.()?.reservedKeys;
      return new Set(Array.isArray(keys) ? keys : []);
    } catch {
      return new Set();
    }
  }

  /** Resolve the key and probe the account's CPA service. */
  async discover(config) {
    const existingRoute = this.options.readExistingPiAiRoute?.(config.provider);
    const effectiveApiKeyEnv =
      config.apiKeyEnv === DEFAULT_API_KEY_ENV &&
      existingRoute?.apiKeyEnv &&
      typeof existingRoute.apiKeyEnv === "string"
        ? existingRoute.apiKeyEnv
        : config.apiKeyEnv;

    const apiKey = await this.options.resolveApiKey(effectiveApiKeyEnv);
    const autoDiscover = config.baseURL === "";
    const fallbackBaseURL =
      autoDiscover && typeof existingRoute?.baseURL === "string" ? existingRoute.baseURL : undefined;
    const environmentBaseURL = autoDiscover ? this.options.environmentBaseURL?.() : undefined;

    const result = await discoverCpa({
      baseURL: config.baseURL,
      autoDiscover,
      ...(fallbackBaseURL === undefined ? {} : { fallbackBaseURL }),
      ...(environmentBaseURL === undefined ? {} : { environmentBaseURL }),
      ...(apiKey === undefined ? {} : { apiKey }),
      timeoutMs: config.probeTimeoutMs,
      signal: this.controller.signal,
      ...(this.options.fetch === undefined ? {} : { fetch: this.options.fetch }),
    });
    return { result, apiKey, effectiveApiKeyEnv };
  }

  async runLoop() {
    do {
      this.rerun = false;
      try {
        await this.syncOnce();
        this.hmrRetries = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.currentStatus = {
          ...this.currentStatus,
          state: "error",
          error: message,
        };
        this.options.logger?.warn?.(message);
        this.scheduleHmrRetry(message);
      }
    } while (this.rerun && !this.controller.signal.aborted);
  }

  /**
   * A plugin reload holds DSH's HMR transaction for longer than the in-call
   * backoff; retry the whole sync a few times once that transaction ends.
   */
  scheduleHmrRetry(message) {
    if (!message.includes("HMR transactions cannot be nested")) return;
    this.hmrRetries = (this.hmrRetries ?? 0) + 1;
    if (this.hmrRetries > 5 || this.controller.signal.aborted) return;
    if (this.hmrRetryTimer !== undefined) clearTimeout(this.hmrRetryTimer);
    const schedule = this.options.setTimeout ?? setTimeout;
    this.hmrRetryTimer = schedule(() => {
      this.hmrRetryTimer = undefined;
      void this.refresh();
    }, 3000 * this.hmrRetries);
  }

  async syncOnce() {
    const config = this.options.config();
    const probe = this.probeRequested === true;
    this.probeRequested = false;

    // An account whose route keys belong to another account must not write
    // or remove them.
    if (config.conflictWith !== undefined) {
      this.syncedModels = [];
      throw new Error(
        `dsh-cliproxyapi: provider route "${config.provider}" overlaps account "${config.conflictWith}"; choose a different Provider Route ID`
      );
    }

    if (!config.enabled) {
      // A disabled account keeps no models in the picker.
      await this.releaseRoutes([config.provider, this.activeProvider]);
      this.activeProvider = undefined;
      this.activeRoutes = undefined;
      this.syncedModels = [];
      let endpoint;
      let probeError;
      if (probe) {
        try {
          const { result } = await this.discover(config);
          this.allDiscoveredModels = result.models;
          this.seedSelection(config, result.models);
          endpoint = result.rootURL;
        } catch (error) {
          if (this.controller.signal.aborted) throw error;
          probeError = error instanceof Error ? error.message : String(error);
        }
      }
      this.currentStatus = {
        state: "disabled",
        provider: config.provider,
        displayName: config.displayName,
        ...(endpoint === undefined ? {} : { endpoint }),
        modelCount: 0,
        totalDiscovered: this.allDiscoveredModels.length,
        ...(probe ? { refreshedAt: new Date().toISOString() } : {}),
        ...(probeError === undefined ? {} : { error: probeError }),
      };
      return;
    }

    const { error: _prevErr, ...prevStatus } = this.currentStatus;
    this.currentStatus = { ...prevStatus, state: "probing" };

    const { result, apiKey, effectiveApiKeyEnv } = await this.discover(config);
    // Keep the catalog visible in the panel even if the selection matches nothing.
    this.allDiscoveredModels = result.models;
    const seeded = this.seedSelection(config, result.models);

    const effectiveConfig = {
      ...config,
      ...(seeded === undefined ? {} : { selectedModels: seeded }),
      apiKeyEnv: effectiveApiKeyEnv,
    };

    const built = buildPiAiRoutes(effectiveConfig, result, apiKey !== undefined);
    this.syncedModels = built.orderedModels;

    // Each managed route keeps unrelated fields a user set by hand (retry
    // policy, image budgets) and takes this plugin's fields on top. A route
    // key that no longer carries models is removed.
    const reserved = new Set(config.reservedKeys ?? []);
    const ownedKeys = new Set(
      [
        ...managedRouteKeys(config.provider),
        ...(this.activeProvider !== undefined && this.activeProvider !== config.provider
          ? managedRouteKeys(this.activeProvider)
          : []),
      ].filter((key) => !reserved.has(key))
    );
    const ops = [];
    const nextRoutes = {};
    for (const key of ownedKeys) {
      const existing = this.options.readExistingPiAiRoute?.(key);
      const wanted = built.routes[key];
      if (wanted === undefined) {
        if (existing !== undefined) ops.push({ op: "unset", path: ["providers", key] });
        continue;
      }
      const merged = {
        ...(existing && typeof existing === "object" ? stripManagedFields(existing) : {}),
        ...wanted,
      };
      nextRoutes[key] = merged;
      if (!sameJson(existing, merged)) {
        ops.push({ op: "set", path: ["providers", key], value: merged });
      }
    }
    if (ops.length > 0) {
      await mutateSettingsSafe(this.options.settings, PI_AI_NS, ops);
    }
    this.activeProvider = config.provider;
    this.activeRoutes = nextRoutes;
    await this.followDefaultModel(built.orderedModels, ownedKeys);

    const protocolCounts = {};
    for (const m of built.orderedModels) protocolCounts[m.protocol] = (protocolCounts[m.protocol] ?? 0) + 1;
    this.currentStatus = {
      state: "connected",
      endpoint: result.rootURL,
      provider: config.provider,
      displayName: config.displayName,
      routes: Object.keys(built.routes),
      protocolCounts,
      modelCount: built.orderedModels.length,
      totalDiscovered: result.models.length,
      refreshedAt: new Date().toISOString(),
    };
    this.options.logger?.info?.(
      `dsh-cliproxyapi: connected to ${result.rootURL}; synchronized ${built.orderedModels.length}/${result.models.length} model(s) into ${Object.keys(built.routes).join(", ")}`
    );
  }

  /**
   * Keep the agent default model reachable when protocol routing moves it to
   * a sibling route (e.g. `cli-proxy` -> `cli-proxy-messages`).
   */
  async followDefaultModel(models, ownedKeys) {
    const current = this.options.readDefaultModel?.();
    if (current === undefined || !ownedKeys.has(current.provider)) return;
    const target = models.find((m) => m.id === current.model);
    if (target === undefined || target.route === current.provider) return;
    try {
      await mutateSettingsSafe(this.options.settings, DEFAULT_MODEL_NS, [
        { op: "set", path: ["provider"], value: target.route },
      ]);
    } catch (error) {
      this.options.logger?.warn?.(
        `dsh-cliproxyapi: could not move default model to ${target.route}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Queue settings writes so concurrent account syncs never interleave their
 * transactions on the shared `llm-pi-ai` namespace.
 */
export function serializeSettings(settings) {
  let tail = Promise.resolve();
  return {
    mutate(ns, ops) {
      const run = tail.then(() => settings.mutate(ns, ops));
      tail = run.catch(() => {});
      return run;
    },
  };
}

/**
 * Owns one {@link CpaRuntime} per account and the state file they share.
 *
 * @param deps.readState - returns the normalized state (see {@link normalizeState}).
 * @param deps.writeState - persists a normalized state.
 * @param deps.resolveApiKey / deps.describeApiKey - credential lookups by ref.
 * @param deps.setCredential / deps.unsetCredential - credential writes by ref.
 * @param deps.onGlobalsChanged - called after the refresh interval changes.
 */
export function createCpaController(deps) {
  const settings = serializeSettings(deps.settings);
  const runtimes = new Map();

  const accountConfig = (state, id) => {
    const account = state.accounts.find((a) => a.id === id);
    if (account === undefined) return undefined;
    const conflicts = accountConflicts(state.accounts);
    const conflictWith = conflicts.get(id);
    return {
      ...resolveConfig({
        ...account,
        refreshIntervalSeconds: state.refreshIntervalSeconds,
        probeTimeoutMs: state.probeTimeoutMs,
      }),
      // Route keys of every other (non-conflicting) account: never written or
      // removed here. A conflicting account owns no keys.
      reservedKeys: state.accounts
        .filter((a) => a.id !== id && !conflicts.has(a.id))
        .flatMap((a) => managedRouteKeys(a.provider)),
      ...(conflictWith === undefined ? {} : { conflictWith }),
    };
  };

  const ensureRuntime = (id) => {
    const existing = runtimes.get(id);
    if (existing !== undefined) return existing;
    let last = accountConfig(deps.readState(), id) ?? resolveConfig({ id, enabled: false });
    const runtime = new CpaRuntime({
      settings,
      config: () => {
        const config = accountConfig(deps.readState(), id);
        if (config !== undefined) last = config;
        return last;
      },
      resolveApiKey: deps.resolveApiKey,
      readExistingPiAiRoute: deps.readExistingPiAiRoute,
      readDefaultModel: deps.readDefaultModel,
      // Persist a first-run selection unless one was saved in the meantime.
      seedSelection: (ids) => {
        const state = deps.readState();
        const account = state.accounts.find((a) => a.id === id);
        if (account === undefined || account.selectedModels !== undefined) return;
        deps.writeState(
          normalizeState({
            ...state,
            accounts: state.accounts.map((a) => (a.id === id ? { ...a, selectedModels: ids } : a)),
          })
        );
      },
      ...(deps.setTimeout === undefined ? {} : { setTimeout: deps.setTimeout }),
      ...(deps.environmentBaseURL === undefined ? {} : { environmentBaseURL: deps.environmentBaseURL }),
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      logger: deps.logger,
    });
    runtime.lastProvider = () => last.provider;
    runtimes.set(id, runtime);
    return runtime;
  };

  /** Create runtimes for new accounts and tear down removed ones. */
  const reconcile = async (state) => {
    for (const account of state.accounts) ensureRuntime(account.id);
    const live = new Set(state.accounts.map((a) => a.id));
    const removed = [...runtimes.entries()].filter(([id]) => !live.has(id));
    for (const [id, runtime] of removed) {
      runtimes.delete(id);
      try {
        await runtime.teardown(runtime.lastProvider());
      } catch (error) {
        deps.logger?.warn?.(
          `dsh-cliproxyapi: could not remove routes of account ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };

  const findAccount = (state, ref) => {
    if (ref === undefined || ref === null || String(ref).trim() === "") {
      if (state.accounts.length === 0) {
        throw new Error("dsh-cliproxyapi: no CLIProxyAPI account is configured; add one first");
      }
      return state.accounts[0];
    }
    const wanted = String(ref).trim();
    const hit =
      state.accounts.find((a) => a.id === wanted) ??
      state.accounts.find((a) => a.provider === wanted) ??
      state.accounts.find((a) => a.displayName === wanted);
    if (hit === undefined) {
      throw new Error(
        `dsh-cliproxyapi: unknown account "${wanted}" (known: ${state.accounts.map((a) => a.id).join(", ") || "none"})`
      );
    }
    return hit;
  };

  const effectiveKeyEnv = (config) => {
    const route = deps.readExistingPiAiRoute?.(config.provider);
    return config.apiKeyEnv === DEFAULT_API_KEY_ENV && typeof route?.apiKeyEnv === "string"
      ? route.apiKeyEnv
      : config.apiKeyEnv;
  };

  const describeAccount = async (state, account) => {
    const config = accountConfig(state, account.id);
    const runtime = ensureRuntime(account.id);
    const st = runtime.status();
    const existingRoute = deps.readExistingPiAiRoute?.(config.provider);
    const keyEnv = effectiveKeyEnv(config);
    const keyInfo = (await deps.describeApiKey?.(keyEnv)) ?? { configured: false };
    return {
      id: account.id,
      config: {
        ...config,
        selectedModels: config.selectedModels ?? [],
        // false until a selection is saved or seeded by the first probe.
        selectionSaved: config.selectedModels !== undefined,
        modelOverrides: config.modelOverrides ?? {},
        effectiveBaseURL: config.baseURL || st.endpoint || existingRoute?.baseURL || "",
        effectiveApiKeyEnv: keyEnv,
      },
      credential: {
        ref: keyEnv,
        configured: keyInfo.configured === true,
        writable: keyInfo.writable !== false,
        source: keyInfo.source ?? null,
      },
      // One model per family from this account's catalog (the panel's reset button).
      recommendedModels: recommendModels(runtime.allDiscoveredModels),
      status: st,
    };
  };

  const statusPayload = async (extra = {}) => {
    const state = deps.readState();
    const accounts = [];
    for (const account of state.accounts) accounts.push(await describeAccount(state, account));
    return {
      ok: true,
      global: {
        refreshIntervalSeconds: state.refreshIntervalSeconds,
        probeTimeoutMs: state.probeTimeoutMs,
      },
      accounts,
      ...extra,
    };
  };

  const applyKeyPatch = async (account, patch) => {
    const ref = toCredentialRef(account.apiKeyEnv);
    if (typeof patch.apiKey === "string" && patch.apiKey.trim() !== "") {
      if (deps.setCredential === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await deps.setCredential(ref, patch.apiKey.trim());
    } else if (patch.clearApiKey === true) {
      await deps.unsetCredential?.(ref);
    }
  };

  const writeAccounts = (state, accounts, patch = {}) => {
    assertNoConflicts(accounts);
    for (const account of accounts) toCredentialRef(account.apiKeyEnv);
    const next = normalizeState({ ...state, ...pickFields(patch, GLOBAL_FIELDS), accounts });
    deps.writeState(next);
    if (next.refreshIntervalSeconds !== state.refreshIntervalSeconds) deps.onGlobalsChanged?.(next);
    return next;
  };

  const refreshAccount = (id, options) => ensureRuntime(id).refresh(options);

  return {
    statusPayload,
    findAccount: (ref) => findAccount(deps.readState(), ref),

    /** Refresh every account (no catalog probe for disabled ones). */
    async refreshAll(options = {}) {
      const state = deps.readState();
      await reconcile(state);
      await Promise.all(state.accounts.map((a) => refreshAccount(a.id, options)));
    },

    /** Refresh one account, or all of them when `ref` is omitted. */
    async refresh(ref, options = { probe: true }) {
      const state = deps.readState();
      await reconcile(state);
      if (ref === undefined || ref === null || String(ref).trim() === "") {
        await Promise.all(state.accounts.map((a) => refreshAccount(a.id, options)));
        return statusPayload();
      }
      const account = findAccount(state, ref);
      await refreshAccount(account.id, options);
      return statusPayload({ account: account.id });
    },

    /** Update one account's settings (and globals in the same patch). */
    async updateAccount(ref, patch = {}) {
      const state = deps.readState();
      const account = findAccount(state, ref);
      const updated = patchAccount(account, patch);
      const accounts = state.accounts.map((a) => (a.id === account.id ? updated : a));
      writeAccounts(state, accounts, patch);
      await applyKeyPatch(updated, patch);
      await refreshAccount(account.id, { probe: true });
      return statusPayload({ account: account.id });
    },

    /** Update only the global settings. */
    async updateGlobals(patch = {}) {
      const state = deps.readState();
      writeAccounts(state, state.accounts, patch);
      return statusPayload();
    },

    /** Add an account; it starts disabled unless `patch.enabled` is true. */
    async addAccount(patch = {}) {
      const state = deps.readState();
      const defaults = newAccountDefaults(state.accounts);
      const created = patchAccount(defaults, {
        ...patch,
        enabled: patch.enabled === true,
      });
      const accounts = [...state.accounts, created];
      const next = writeAccounts(state, accounts, patch);
      await applyKeyPatch(created, patch);
      await reconcile(next);
      await refreshAccount(created.id, { probe: true });
      return statusPayload({ account: created.id, createdId: created.id });
    },

    /** Remove an account and every route it synchronized. */
    async removeAccount(ref) {
      if (ref === undefined || ref === null || String(ref).trim() === "") {
        throw new Error("dsh-cliproxyapi: removing an account needs its id");
      }
      const state = deps.readState();
      const account = findAccount(state, ref);
      // Capture the account's provider (and reserved keys) before it leaves the state.
      ensureRuntime(account.id).options.config();
      const next = writeAccounts(
        state,
        state.accounts.filter((a) => a.id !== account.id)
      );
      await reconcile(next);
      return statusPayload({ removedId: account.id });
    },

    /** Accounts whose credential reference is `ref`. */
    accountsUsingKey(ref) {
      const state = deps.readState();
      return state.accounts
        .map((a) => accountConfig(state, a.id))
        .filter((config) => effectiveKeyEnv(config) === ref)
        .map((config) => config.id);
    },

    refreshAccount,

    /**
     * Account facts the quota engine needs: the CPA address it talks to and
     * the DSH route keys whose models belong to this account. A conflicting
     * account owns no routes, so none of its models map to quota.
     */
    quotaAccounts() {
      const state = deps.readState();
      const conflicts = accountConflicts(state.accounts);
      return state.accounts.map((account) => {
        const config = accountConfig(state, account.id);
        const runtime = runtimes.get(account.id);
        const st = runtime?.currentStatus ?? {};
        const existingRoute = deps.readExistingPiAiRoute?.(config.provider);
        const owners = new Map((runtime?.allDiscoveredModels ?? []).map((m) => [m.id, m.ownedBy]));
        return {
          id: account.id,
          displayName: config.displayName,
          provider: config.provider,
          enabled: config.enabled === true,
          baseURL: config.baseURL || "",
          endpoint: st.endpoint || existingRoute?.baseURL || "",
          routes: conflicts.has(account.id) ? [] : managedRouteKeys(config.provider),
          // Models this account currently puts in the DSH picker.
          pickerModels: (runtime?.syncedModels ?? []).map((m) => ({
            id: m.id,
            route: m.route,
            ...(typeof owners.get(m.id) === "string" ? { ownedBy: owners.get(m.id) } : {}),
          })),
        };
      });
    },

    dispose() {
      for (const runtime of runtimes.values()) runtime.dispose();
      runtimes.clear();
    },
  };
}

// #endregion

// #region HTTP Gate & WebServer Routes

export const ROUTES = {
  status: "/api/dsh-cliproxyapi/status",
  refresh: "/api/dsh-cliproxyapi/refresh",
  save: "/api/dsh-cliproxyapi/save",
  addAccount: "/api/dsh-cliproxyapi/accounts/add",
  removeAccount: "/api/dsh-cliproxyapi/accounts/remove",
  updateStatus: "/api/dsh-cliproxyapi/updates/status",
  updateCheck: "/api/dsh-cliproxyapi/updates/check",
  updateSave: "/api/dsh-cliproxyapi/updates/save",
  updateDownload: "/api/dsh-cliproxyapi/updates/download",
  quotaStatus: "/api/dsh-cliproxyapi/quota/status",
  quotaRefresh: "/api/dsh-cliproxyapi/quota/refresh",
  quotaSave: "/api/dsh-cliproxyapi/quota/save",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function loopbackAuthority(host) {
  if (typeof host !== "string") return false;
  const lower = host.toLowerCase();
  const name = lower.startsWith("[")
    ? lower.slice(0, lower.indexOf("]") + 1)
    : lower.split(":")[0];
  return (
    name === "127.0.0.1" ||
    name === "localhost" ||
    name === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)
  );
}

function admitRequest(ctx, req, res, expectedMethod) {
  if (req.method !== expectedMethod) {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return false;
  }
  const connection = ctx.get?.("connection");
  if (typeof connection?.requestRejection === "function") {
    let rejection;
    try {
      rejection = connection.requestRejection(req);
    } catch {
      rejection = 403;
    }
    if (rejection !== undefined) {
      const code = typeof rejection === "number" ? rejection : rejection?.status ?? 403;
      sendJson(res, code, { error: "Request rejected by host connection security policy" });
      return false;
    }
  }
  if (expectedMethod === "POST") {
    const host = req.headers.host;
    const trusted = Array.isArray(connection?.trustedHosts) ? connection.trustedHosts : [];
    if (
      host !== undefined &&
      !loopbackAuthority(host) &&
      !trusted.some((t) => String(t).toLowerCase() === host.toLowerCase())
    ) {
      sendJson(res, 403, { error: "Forbidden host" });
      return false;
    }
    if (req.headers["sec-fetch-site"] === "cross-site") {
      sendJson(res, 403, { error: "Cross-site request forbidden" });
      return false;
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      try {
        if (new URL(origin).host !== host) {
          sendJson(res, 403, { error: "Origin mismatch" });
          return false;
        }
      } catch {
        sendJson(res, 403, { error: "Invalid Origin" });
        return false;
      }
    }
  }
  return true;
}

/** Same authority, using the scheme the Origin itself declares (host comparison only). */
function sameAuthorityOrigin(origin, host) {
  let originUrl;
  try { originUrl = new URL(origin); } catch { return false; }
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
  if (originUrl.username || originUrl.password) return false;
  try {
    return originUrl.host === new URL(`${originUrl.protocol}//${host}`).host;
  } catch {
    return false;
  }
}

/**
 * Update writes need an authenticated browser request. The host connection
 * service already enforces the Host/Origin fence and its session cookie, so
 * this only narrows it: when a browser sends an Origin it must belong to this
 * listener. A carrier that omits Origin (the desktop shell proxies API calls
 * without it) is allowed, because the session cookie is still required and an
 * unauthenticated caller is rejected before reaching the route.
 */
function admitUpdateRequest(ctx, req, res, method) {
  if (!admitRequest(ctx, req, res, method)) return false;
  if (method === "GET") return true;
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (host === undefined || origin !== undefined && !sameAuthorityOrigin(origin, host)) {
    sendJson(res, 403, { ok: false, errorCode: "forbidden-origin", error: "Same-origin browser request required" });
    return false;
  }
  return true;
}

async function readJsonBody(req, maxBytes = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() === "" ? {} : JSON.parse(raw);
}

// #endregion

// #region Mount Once Guard

const MOUNTED = Symbol.for("dsh-web.mounted-plugins");
const WAITERS = Symbol.for("dsh-web.mounted-plugins.waiters");

function mountedSet() {
  const existing = globalThis[MOUNTED];
  if (existing instanceof Set) return existing;
  const created = new Set();
  globalThis[MOUNTED] = created;
  return created;
}

function mountWaiters() {
  return (globalThis[WAITERS] ??= new Map());
}

function mountOnce(packageName, fn) {
  const mount = (...args) => {
    const mounted = mountedSet();
    const ctx = args[0];
    if (mounted.has(packageName)) {
      const waiters = mountWaiters();
      const queue = waiters.get(packageName) ?? [];
      let alive = true;
      const pending = {
        run: () => {
          if (alive) mount(...args);
        },
      };
      ctx?.effect?.(() => () => {
        alive = false;
        const idx = queue.indexOf(pending);
        if (idx >= 0) queue.splice(idx, 1);
      });
      queue.push(pending);
      waiters.set(packageName, queue);
      return;
    }
    mounted.add(packageName);
    ctx?.effect?.(() => () => {
      mounted.delete(packageName);
      const waiters = mountWaiters();
      const queue = waiters.get(packageName);
      if (queue === undefined) return;
      waiters.delete(packageName);
      for (const waiter of queue.splice(0)) {
        queueMicrotask(() => waiter.run());
      }
    });
    return fn(...args);
  };
  return mount;
}

// #endregion

// #region Plugin Apply Implementation

/**
 * Run `fn` outside the HMR transaction's async context.
 *
 * dsh-hmr marks a running transaction with an AsyncLocalStorage store, and
 * this plugin's apply() runs inside the install/enable transaction. Timers
 * created there inherit that store forever, so every later settings write
 * from them fails with "HMR transactions cannot be nested". Creating the
 * timers under `executing.exit()` — what dsh-hmr does for its own watchers —
 * gives them a clean context.
 */
function outsideHmrTransaction(ctx, fn) {
  try {
    const executing = ctx.get?.("hmr")?.executing;
    if (typeof executing?.exit === "function") return executing.exit(fn);
  } catch {}
  return fn();
}

function renderAccountStatus(account) {
  const { config: cfg, credential: keyInfo, status } = account;
  const selectedMode =
    cfg.selectionSaved === false
      ? "Selected Filter: not chosen yet (the first successful probe checks the newest model of each family)"
      : Array.isArray(cfg.selectedModels) && cfg.selectedModels.length > 0
      ? `Selected Filter: ${cfg.selectedModels.length} model(s) checked`
      : "Selected Filter: All models (no selection filter active)";
  const modelListPreview =
    Array.isArray(status.models) && status.models.length > 0
      ? `Active Models in Picker: ${status.models
          .slice(0, 12)
          .map((m) => m.id)
          .join(", ")}${status.models.length > 12 ? ` ... (+${status.models.length - 12} more)` : ""}`
      : undefined;
  const counts = status.protocolCounts ?? {};
  const protocolLine =
    cfg.protocolMode === "fixed"
      ? `Protocol: ${cfg.protocol} (fixed for every model)`
      : `Protocol: native per model (${PROTOCOLS.filter((p) => counts[p])
          .map((p) => `${p}: ${counts[p]}`)
          .join(", ") || "none synced yet"})`;
  const lines = [
    `Account "${cfg.displayName}" [id: ${account.id}] — ${cfg.enabled ? "enabled" : "disabled"}`,
    `CLIProxyAPI Status: ${status.state}`,
    `Provider Routes: ${(status.state === "connected" && status.routes ? status.routes : [cfg.provider]).join(", ")}`,
    protocolLine,
    `Configured Base URL: ${cfg.baseURL || "(auto-discover / inherited)"}`,
    ...(status.endpoint ? [`Active Endpoint: ${status.endpoint}`] : []),
    `API Key Reference: ${keyInfo.ref} (${keyInfo.configured ? "configured" : "not set"})`,
    selectedMode,
    `Synchronized Models: ${status.modelCount}${
      status.totalDiscovered ? ` (of ${status.totalDiscovered} discovered)` : ""
    }`,
    ...(modelListPreview ? [modelListPreview] : []),
    ...(status.refreshedAt ? [`Last Refreshed: ${status.refreshedAt}`] : []),
    ...(status.error ? [`Error: ${status.error}`] : []),
  ];
  return lines.join("\n");
}

/** One line per account: management key, quota state and what the picker models map to. Never includes keys. */
export function renderQuotaText(snapshot, onlyAccountId) {
  const accounts = (snapshot?.accounts ?? []).filter((a) => onlyAccountId === undefined || a.accountId === onlyAccountId);
  if (accounts.length === 0) return "";
  const lines = ["Quota (CPA management API):"];
  for (const a of accounts) {
    if (!a.keyConfigured) {
      lines.push(`- ${a.displayName} [${a.accountId}]: no management key (${a.keyRef})`);
      continue;
    }
    const creds = Array.isArray(a.credentials) ? a.credentials : [];
    const state = a.state + (a.errorCode ? ` (${a.errorCode}${a.errorStatus ? ` ${a.errorStatus}` : ""})` : "") + (a.refreshing ? ", refreshing" : "");
    lines.push(`- ${a.displayName} [${a.accountId}]: ${state}; ${creds.length} credential(s)${a.fetchedAt ? `; fetched ${a.fetchedAt}` : ""}; routes ${(a.routes ?? []).join(", ") || "none"}`);
    for (const m of a.pickerModels ?? []) {
      const ids = a.modelIndex?.[m.id] ?? [];
      const names = ids.map((id) => {
        const c = creds.find((x) => x.id === id);
        if (!c) return id;
        const pct = (c.windows ?? []).map((w) => w.remainingPercent).filter((v) => typeof v === "number");
        return `${c.provider}:${c.label || c.id}${pct.length ? ` ${Math.round(Math.min(...pct))}%` : ""}${c.status === "active" ? "" : ` (${c.status})`}`;
      });
      lines.push(`    ${m.route}/${m.id} -> ${names.length ? names.join(", ") : "no credential"} [${a.modelMatch?.[m.id] ?? "none"}]`);
    }
  }
  return lines.join("\n");
}

export function renderStatusText(payload, onlyAccountId) {
  const accounts = payload.accounts ?? [];
  if (accounts.length === 0) {
    return "No CLIProxyAPI account is configured. Add one with the cliproxyapi tool (action 'add_account') or in Settings → Built-in plugins → CLIProxyAPI.";
  }
  const shown =
    onlyAccountId === undefined ? accounts : accounts.filter((a) => a.id === onlyAccountId);
  const enabled = accounts.filter((a) => a.config.enabled).length;
  const header = `CLIProxyAPI accounts: ${accounts.length} (${enabled} enabled); auto refresh every ${payload.global?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS}s`;
  return [header, ...shown.map(renderAccountStatus)].join("\n\n");
}

function summarizeAccount(account) {
  const st = account.status;
  return {
    id: account.id,
    displayName: account.config.displayName,
    provider: account.config.provider,
    enabled: account.config.enabled,
    state: st.state,
    ...(st.endpoint ? { endpoint: st.endpoint } : {}),
    modelCount: st.modelCount ?? 0,
    totalDiscovered: st.totalDiscovered ?? 0,
    ...(st.error ? { error: st.error } : {}),
  };
}

/** Account fields the tool and the save route accept, besides key handling. */
function accountPatchFromInput(input) {
  const patch = {};
  for (const field of ["baseURL", "provider", "displayName", "protocol", "protocolMode", "includePrefix", "excludePrefix", "apiKeyEnv"]) {
    if (typeof input[field] === "string") patch[field] = input[field];
  }
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (Array.isArray(input.selectedModels)) patch.selectedModels = input.selectedModels;
  if (plainObject(input.modelOverrides) !== undefined) patch.modelOverrides = input.modelOverrides;
  if (typeof input.apiKey === "string" && input.apiKey.trim() !== "") patch.apiKey = input.apiKey.trim();
  if (input.clearApiKey === true) patch.clearApiKey = true;
  for (const field of GLOBAL_FIELDS) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  return patch;
}

function applyImpl(ctx, config) {
  const stateFilePath = resolveStateFilePath(ctx);
  const persisted = loadPersistedState(stateFilePath);

  const readExistingPiAiRoute = (provider) => {
    try {
      const descriptors = ctx.settings.describe();
      const piAi = descriptors.find((d) => d.ns === PI_AI_NS);
      return piAi?.value?.providers?.[provider];
    } catch {
      return undefined;
    }
  };

  const readDefaultModel = () => {
    try {
      const value = ctx.settings.describe().find((d) => d.ns === DEFAULT_MODEL_NS)?.value;
      return typeof value?.provider === "string" && typeof value?.model === "string"
        ? { provider: value.provider, model: value.model }
        : undefined;
    } catch {
      return undefined;
    }
  };

  // Seed a selection from every managed route, not just the base one, so a
  // restart after protocol routing keeps Messages / Responses models checked.
  const existingManagedIds = (provider) =>
    managedRouteKeys(provider).flatMap((key) => {
      const route = readExistingPiAiRoute(key);
      return Array.isArray(route?.models)
        ? route.models.map((m) => m?.id).filter((id) => typeof id === "string" && id.trim() !== "")
        : [];
    });

  // Migrate a legacy single-account file into `accounts[]`, keeping a copy.
  if (Object.keys(persisted).length > 0 && !Array.isArray(persisted.accounts)) {
    savePersistedState(stateFilePath.replace(/\.json$/, ".v1.json"), persisted);
  }

  // An account without a saved selection keeps the models already on its
  // pi-ai routes when that is a curated list (<= 35). Otherwise it stays
  // unset and its first successful probe seeds recommendModels().
  let memState = normalizeState(mergeHostConfig(persisted, config));
  memState = {
    ...memState,
    accounts: memState.accounts.map((account) => {
      if (account.selectedModels !== undefined) return account;
      const existingIds = existingManagedIds(account.provider);
      return existingIds.length > 0 && existingIds.length <= 35
        ? { ...account, selectedModels: existingIds }
        : account;
    }),
  };
  savePersistedState(stateFilePath, memState);

  // The state file is re-read on every access so hand edits take effect.
  const readState = () => {
    const fresh = loadPersistedState(stateFilePath);
    if (Object.keys(fresh).length > 0) memState = normalizeState(fresh);
    return memState;
  };
  const writeState = (state) => {
    memState = state;
    savePersistedState(stateFilePath, state);
  };

  // Update preferences and packages never share the account state or credentials.
  const updateDirectory = dirname(stateFilePath);
  const updateSettingsPath = join(updateDirectory, "update-settings.json");
  let profile;
  try { profile = ctx.get?.("profileContext"); } catch {}
  const source = typeof profile?.dir === "string"
    ? loadPersistedState(join(profile.dir, "package.json")).dependencies?.[PACKAGE_NAME]
    : undefined;
  const linkedInstall = typeof source === "string" &&
    (/^(?:link:|workspace:)/.test(source) || /^(?:file:)?(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/])/.test(source) && !/\.(?:tgz|tar\.gz)$/i.test(source) || source.startsWith("file:") && !/\.(?:tgz|tar\.gz)$/i.test(source));
  const currentVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  let updateTimer;
  let updateStartup;
  const scheduleUpdates = (preferences) => {
    clearInterval(updateTimer);
    clearTimeout(updateStartup);
    if (!preferences.autoCheck) return;
    outsideHmrTransaction(ctx, () => {
      const run = () => { void Promise.resolve().then(() => updater.check({ automatic: true })).catch(() => {}); };
      updateStartup = setTimeout(run, 3000);
      updateTimer = setInterval(run, UPDATE_INTERVAL_MS);
    });
  };
  const updater = createPluginUpdater({
    currentVersion,
    linkedInstall,
    profileName: profile?.name ?? profile?.profile ?? getEnvValue(ctx, "DSH_PROFILE"),
    readSettings: () => loadUpdateSettings(updateSettingsPath),
    writeSettings: (preferences) => saveUpdateSettings(updateSettingsPath, preferences),
    storePackage: (version, bytes) => storeUpdatePackage(join(updateDirectory, "updates"), version, bytes),
    onSettingsChanged: scheduleUpdates,
  });
  ctx.effect(() => {
    scheduleUpdates(updater.status());
    return () => {
      clearInterval(updateTimer);
      clearTimeout(updateStartup);
      updater.dispose();
    };
  }, "cpa: plugin update checks");

  let timer;
  let startupTimeout;

  const resolveApiKey = async (refName) => {
    try {
      const ref = toCredentialRef(refName);
      const credentials = ctx.get("credentials");
      const stored = credentials === undefined ? undefined : await credentials.resolve(ref);
      const raw = stored?.value ?? getEnvValue(ctx, ref);
      const value = raw?.trim();
      return value === undefined || value === "" ? undefined : value;
    } catch {
      return undefined;
    }
  };

  const describeApiKey = async (refName) => {
    try {
      const ref = toCredentialRef(refName);
      const credentials = ctx.get("credentials");
      if (credentials !== undefined) {
        return await credentials.describe(ref);
      }
      const envVal = getEnvValue(ctx, ref);
      return {
        configured: envVal !== undefined && envVal.length > 0,
        writable: false,
      };
    } catch {
      return { configured: false, writable: true };
    }
  };

  const reschedule = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = outsideHmrTransaction(ctx, () =>
      setInterval(() => {
        void controller.refreshAll();
      }, readState().refreshIntervalSeconds * 1000)
    );
  };

  const controller = createCpaController({
    settings: ctx.settings,
    readState,
    writeState,
    resolveApiKey,
    describeApiKey,
    setCredential: async (ref, value) => {
      const credentials = ctx.get("credentials");
      if (credentials === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await credentials.set(ref, value);
    },
    unsetCredential: async (ref) => {
      await ctx.get("credentials")?.unset(ref);
    },
    readExistingPiAiRoute,
    readDefaultModel,
    setTimeout: (fn, ms) => outsideHmrTransaction(ctx, () => setTimeout(fn, ms)),
    environmentBaseURL: () => getEnvValue(ctx, "CLIPROXYAPI_BASE_URL"),
    logger: ctx.logger,
    onGlobalsChanged: () => reschedule(),
  });

  // Quota ("额度" tab + composer badge): management keys live in the
  // credentials service under their own refs, never in account state.
  const quota = createQuotaController({
    listAccounts: () => controller.quotaAccounts(),
    resolveKey: (ref) => resolveApiKey(ref),
    describeKey: (ref) => describeApiKey(ref),
    setKey: async (ref, value) => {
      const credentials = ctx.get("credentials");
      if (credentials === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await credentials.set(ref, value);
    },
    unsetKey: async (ref) => {
      await ctx.get("credentials")?.unset(ref);
    },
    logger: ctx.logger,
  });
  ctx.effect(() => () => quota.dispose(), "cpa: quota");

  reschedule();
  startupTimeout = outsideHmrTransaction(ctx, () =>
    setTimeout(() => {
      startupTimeout = undefined;
      void controller.refreshAll();
    }, 600)
  );

  ctx.on("credentials/reference-updated", (ref) => {
    for (const id of controller.accountsUsingKey(ref)) {
      void controller.refreshAccount(id);
    }
  });

  ctx.effect(
    () => () => {
      if (timer !== undefined) clearInterval(timer);
      if (startupTimeout !== undefined) clearTimeout(startupTimeout);
      controller.dispose();
    },
    "cpa: refresh loop"
  );

  // Register slash commands (/cpa-status, /cpa-refresh)
  ctx.inject(["commands"], (cmdCtx) => {
    cmdCtx.effect(() => {
      const offStatus = cmdCtx.commands.register({
        name: "cpa-status",
        description: "Show CLIProxyAPI discovery and model synchronization status of every account.",
        handler: async () => {
          const payload = await controller.statusPayload();
          const quotaText = renderQuotaText(await quota.snapshot());
          return { kind: "success", text: [renderStatusText(payload), quotaText].filter(Boolean).join("\n\n") };
        },
      });
      const offRefresh = cmdCtx.commands.register({
        name: "cpa-refresh",
        description: "Probe every CLIProxyAPI account now and refresh the synchronized DSH model catalog.",
        handler: async () => {
          const payload = await controller.refresh(undefined);
          const failed = payload.accounts.some((a) => a.status.state === "error");
          return { kind: failed ? "error" : "success", text: renderStatusText(payload) };
        },
      });
      return () => {
        offStatus?.();
        offRefresh?.();
      };
    }, "cpa: commands");
  });

  // Register Agent Tool (cliproxyapi) directly via ctx.tools.register
  ctx.inject(["tools"], (toolCtx) => {
    toolCtx.effect(() => {
      return toolCtx.tools.register({
        name: "cliproxyapi",
        description:
          "Inspect, refresh, or configure CLIProxyAPI accounts (each one a CPA server + API key synchronized into its own DSH provider routes), add or remove accounts, enable or disable them, and filter which models each one shows in the DSH model selector.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: {
              type: "string",
              enum: ["status", "refresh", "configure", "add_account", "remove_account"],
              description:
                "'status' reads every account (or only `account`), 'refresh' probes and syncs now, 'configure' updates one account, 'add_account' creates an account from the other fields, 'remove_account' deletes `account` and its model routes.",
            },
            account: {
              type: "string",
              description:
                "Target account id (or its provider route ID / display name) for status, refresh, configure and remove_account. Defaults to the first account; refresh without it refreshes all.",
            },
            enabled: {
              type: "boolean",
              description:
                "Enable or disable the account. A disabled account keeps its settings but its models leave the picker. add_account defaults to enabled when baseURL is given.",
            },
            baseURL: {
              type: "string",
              description:
                "CLIProxyAPI base URL (e.g. http://127.0.0.1:8317). Empty means auto-discover locally.",
            },
            provider: {
              type: "string",
              description:
                "Provider route ID in llm-pi-ai; must be unique per account (default: cli-proxy, then cli-proxy-2, ...).",
            },
            displayName: {
              type: "string",
              description: "Account name shown in the DSH model picker.",
            },
            protocolMode: {
              type: "string",
              enum: ["auto", "fixed"],
              description:
                "'auto' (default) sends each model over its own family's protocol: Claude via Anthropic Messages, GPT/Codex/Grok via OpenAI Responses, others (incl. Gemini) via OpenAI Chat. 'fixed' sends every model over `protocol`.",
            },
            protocol: {
              type: "string",
              enum: ["openai-completions", "openai-responses", "anthropic-messages"],
              description: "Wire protocol used for every model when protocolMode is 'fixed'.",
            },
            selectedModels: {
              type: "array",
              items: { type: "string" },
              description:
                "Exact model IDs to show in the DSH model picker. Pass an empty array [] to show all discovered models.",
            },
            includePrefix: {
              type: "string",
              description: "Comma-separated model ID substrings/prefixes to include.",
            },
            excludePrefix: {
              type: "string",
              description: "Comma-separated model ID substrings/prefixes to exclude.",
            },
            apiKey: {
              type: "string",
              description:
                "CLIProxyAPI Bearer key, stored in the DSH credentials service under the account's apiKeyEnv.",
            },
            apiKeyEnv: {
              type: "string",
              description:
                "Credential reference name holding the account's key (default: CLI_PROXY_API_KEY, then CLI_PROXY_API_KEY_2, ...).",
            },
            modelOverrides: {
              type: "object",
              description:
                "Per-model overrides keyed by model ID, replacing the account's whole map: { [modelId]: { contextWindow?: number, maxTokens?: number, image?: boolean, reasoningLevels?: string[], protocol?: 'openai-completions' | 'openai-responses' | 'anthropic-messages' } }.",
            },
          },
        },
        output: {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["accounts", "summary"],
            properties: {
              account: { type: "string" },
              accounts: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "displayName", "provider", "enabled", "state", "modelCount", "totalDiscovered"],
                  properties: {
                    id: { type: "string" },
                    displayName: { type: "string" },
                    provider: { type: "string" },
                    enabled: { type: "boolean" },
                    state: { type: "string" },
                    endpoint: { type: "string" },
                    modelCount: { type: "integer" },
                    totalDiscovered: { type: "integer" },
                    error: { type: "string" },
                  },
                },
              },
              summary: { type: "string" },
            },
          },
          render: (_args, value) => [{ type: "text", text: value.summary }],
        },
        async execute(args) {
          const input = args ?? {};
          const ref = typeof input.account === "string" && input.account.trim() !== "" ? input.account.trim() : undefined;
          let target;
          if (input.action === "refresh") {
            target = (await controller.refresh(ref)).account;
          } else if (input.action === "configure") {
            target = (await controller.updateAccount(ref, accountPatchFromInput(input))).account;
          } else if (input.action === "add_account") {
            const patch = accountPatchFromInput(input);
            if (patch.enabled === undefined) {
              patch.enabled = typeof patch.baseURL === "string" && patch.baseURL.trim() !== "";
            }
            target = (await controller.addAccount(patch)).createdId;
          } else if (input.action === "remove_account") {
            if (ref === undefined) throw new Error("remove_account needs `account`");
            await controller.removeAccount(ref);
          } else if (ref !== undefined) {
            target = controller.findAccount(ref).id;
          }
          const payload = await controller.statusPayload();
          const only = input.action === "status" ? target : undefined;
          const quotaText = input.action === "status" ? renderQuotaText(await quota.snapshot(), only) : "";
          return {
            ...(target === undefined ? {} : { account: target }),
            accounts: payload.accounts.map(summarizeAccount),
            summary: [renderStatusText(payload, only), quotaText].filter(Boolean).join("\n\n"),
          };
        },
        presentCall: (args) => ({
          card: "generic",
          title: `CLIProxyAPI: ${args?.action ?? "status"}${args?.account ? ` (${args.account})` : ""}`,
          kind: args?.action === "status" ? "read" : "execute",
          rawInput: args,
        }),
      });
    }, "cpa: tool");
  });

  // Register HTTP API Routes on webServer for the Web UI
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const route = (path, method, run, errorStatus = 500) =>
        webCtx.webServer.register({
          kind: "exact",
          path,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, method)) return;
            try {
              const body = method === "POST" ? (await readJsonBody(req)) ?? {} : {};
              sendJson(res, 200, await run(body));
            } catch (error) {
              sendJson(res, errorStatus, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      const updateRoute = (path, method, run) => webCtx.webServer.register({
        kind: "exact", path,
        handler: async (req, res) => {
          if (!admitUpdateRequest(ctx, req, res, method)) return;
          try {
            const body = method === "POST" ? await readJsonBody(req, 8192) : {};
            if (!plainObject(body)) throw new UpdateError("invalid-settings");
            if (path === ROUTES.updateDownload && (Object.keys(body).some((key) => key !== "version") || typeof body.version !== "string")) {
              throw new UpdateError("stale-version");
            }
            if (path === ROUTES.updateCheck && Object.keys(body).length) throw new UpdateError("invalid-settings");
            const update = await run(body);
            sendJson(res, 200, { ok: true, update });
          } catch (error) {
            const errorCode = error instanceof UpdateError ? error.code : "invalid-settings";
            sendJson(res, errorCode === "busy" ? 409 : 400, { ok: false, errorCode, error: errorCode, update: updater.status() });
          }
        },
      });
      const disposers = [
        updateRoute(ROUTES.updateStatus, "GET", () => updater.status()),
        updateRoute(ROUTES.updateCheck, "POST", () => updater.check()),
        updateRoute(ROUTES.updateSave, "POST", (body) => updater.save(body)),
        updateRoute(ROUTES.updateDownload, "POST", (body) => updater.download(body.version)),
        route(ROUTES.status, "GET", () => controller.statusPayload()),
        route(ROUTES.refresh, "POST", (body) => controller.refresh(body.accountId)),
        route(
          ROUTES.save,
          "POST",
          (body) => {
            const patch = accountPatchFromInput(body);
            const hasAccountFields = Object.keys(patch).some((k) => !GLOBAL_FIELDS.includes(k));
            return body.accountId === undefined && !hasAccountFields
              ? controller.updateGlobals(patch)
              : controller.updateAccount(body.accountId, patch);
          },
          400
        ),
        route(ROUTES.addAccount, "POST", (body) => controller.addAccount(accountPatchFromInput(body)), 400),
        route(ROUTES.removeAccount, "POST", (body) => controller.removeAccount(body.accountId), 400),
        route(ROUTES.quotaStatus, "GET", async () => ({ ok: true, quota: await quota.snapshot() })),
        route(ROUTES.quotaRefresh, "POST", async (body) => ({
          ok: true,
          quota: await quota.refresh(typeof body.accountId === "string" && body.accountId !== "" ? body.accountId : undefined, { wait: false }),
        })),
        route(
          ROUTES.quotaSave,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") {
              throw new Error("dsh-cliproxyapi: saving a management key needs accountId");
            }
            const managementKey = typeof body.managementKey === "string" ? body.managementKey.trim() : "";
            return {
              ok: true,
              quota: await quota.saveKey(body.accountId, {
                ...(managementKey === "" ? {} : { managementKey }),
                ...(body.clear === true ? { clear: true } : {}),
              }, { wait: false }),
            };
          },
          400
        ),
      ];
      return () => {
        for (const dispose of disposers) dispose?.();
      };
    }, "cpa: webserver routes");
  });
}

export const apply = mountOnce(PACKAGE_NAME, applyImpl);

// #endregion
