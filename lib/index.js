// Zero-external-dependency host plugin for DSH CLIProxyAPI auto-discovery, model selection & sync.
// Uses only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.webServer`).
// It deliberately registers no agent tool: accounts are managed in the Settings
// page, HTTP routes and slash commands, so nothing adds to model context.
// Image / video models (lib/media.js) are classified and kept out of the
// chat routes; their preferences live in media-settings.json.

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import {
  createPluginUpdater, loadUpdateSettings, saveUpdateSettings, storeUpdatePackage,
  UPDATE_INTERVAL_MS, UpdateError,
} from "./updater.js";
import { createQuotaController } from "./quota.js";
import {
  accountKindOverrides, applyMediaPatch, chooseMediaModel, createMediaSessionStore, detectMediaKind,
  diagnoseMedia, effectiveKind, generateImages, IMAGE_ASPECTS, loadMediaSettings, MAX_REFERENCE_IMAGES,
  mediaAliasTarget, MediaError, mediaModelEnabled, mediaOptions, normalizeMediaSettings, outputDirectory,
  outputStem, parseImageCommand, recentEntry, saveMediaSettings, validCommandId, validSessionId, writeOutputFiles,
  createMediaJobStore, downloadVideo, MAX_VIDEO_BYTES, parseVideoCommand, retrieveVideo, submitVideo, VIDEO_ASPECTS, VIDEO_JOB_TTL_MS,
  fitReferenceImage, REFERENCE_MAX_EDGE,
} from "./media.js";

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
 * Apply an account patch from the UI. `selectedModels` and
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
    const outputModalities = stringArray(
      item.supportedOutputModalities ?? item.output_modalities ?? item.outputModalities
    ).map((v) => v.toLowerCase());
    const catalogType = typeof item.type === "string" && item.type.trim() !== "" ? item.type.trim() : undefined;
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
      ...(outputModalities.length === 0 ? {} : { outputModalities }),
      ...(catalogType === undefined ? {} : { catalogType }),
      reasoning: item.reasoning === true || levels.some((level) => level !== "off"),
      reasoningLevels: levels,
      ...(Object.keys(reasoningWire).length === 0 ? {} : { reasoningWire }),
      // chat | image | video, before user overrides (see lib/media.js).
      detectedKind: detectMediaKind({ id, catalogType, outputModalities }),
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

/** The plain `/v1/models` listing, parsed, by id (empty when unavailable). */
async function fetchListing(fetchImpl, rootURL, options, signal) {
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
    if (!response.ok) return new Map();
    return new Map(parseCatalog(await readBoundedJson(response)).map((m) => [m.id, m]));
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    return new Map();
  }
}

/**
 * Fill catalog gaps from the plain listing: `owned_by` (native protocol),
 * the registry `type` and output modalities (media kind). A media model that
 * only the plain listing carries is added; plain-only chat models are not.
 */
function mergeListing(models, listing) {
  const merged = models.map((m) => {
    const plainEntry = listing.get(m.id);
    if (plainEntry === undefined) return m;
    const next = { ...m };
    for (const field of ["ownedBy", "catalogType", "outputModalities"]) {
      if (next[field] === undefined && plainEntry[field] !== undefined) next[field] = plainEntry[field];
    }
    next.detectedKind = detectMediaKind(next);
    return next;
  });
  const known = new Set(merged.map((m) => m.id));
  for (const entry of listing.values()) {
    if (!known.has(entry.id) && entry.detectedKind !== "chat") merged.push(entry);
  }
  return merged;
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
      // model family each upstream reports, which decides its native protocol,
      // and the registry type that marks image models.
      const listing = await fetchListing(fetchImpl, rootURL, options, signal);
      return { rootURL, modelsURL, models: mergeListing(models, listing) };
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
    kind: m.kind ?? m.detectedKind ?? "chat",
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

  /**
   * Models with their effective `kind` under the account's current kind
   * overrides (read fresh, so an override applies without a new probe).
   */
  withKinds(models = this.allDiscoveredModels) {
    let overrides = {};
    try {
      overrides = this.options.kindOverrides?.() ?? {};
    } catch {}
    return models.map((m) => ({ ...m, kind: effectiveKind(m, overrides) }));
  }

  /** Discovered chat models (what the picker, recommendations and seeding use). */
  chatModels(models = this.allDiscoveredModels) {
    return this.withKinds(models).filter(isChatModel);
  }

  status() {
    const syncedSet = new Set(this.syncedModels.map((m) => m.id));
    const config = this.options.config();
    const kinded = this.withKinds();
    const byId = new Map(kinded.map((m) => [m.id, m]));
    return {
      ...this.currentStatus,
      models: this.syncedModels.map((m) => ({
        ...formatModelView(byId.get(m.id) ?? m, syncedSet, config),
        route: m.route,
      })),
      allModels: kinded.map((m) => formatModelView(m, syncedSet, config)),
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
          this.seedSelection(config, this.chatModels(result.models));
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
    const seeded = this.seedSelection(config, this.chatModels(result.models));

    const effectiveConfig = {
      ...config,
      ...(seeded === undefined ? {} : { selectedModels: seeded }),
      apiKeyEnv: effectiveApiKeyEnv,
    };

    const built = buildPiAiRoutes(
      effectiveConfig,
      { ...result, models: this.withKinds(result.models) },
      apiKey !== undefined
    );
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
      // User reclassifications (chat / image / video) from media-settings.json.
      kindOverrides: () => deps.mediaKindOverrides?.(id) ?? {},
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
      recommendedModels: recommendModels(runtime.chatModels()),
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

    /**
     * Probe a CPA address with unsaved form values, without saving or writing
     * routes. A blank `apiKey` uses the account's stored key; a blank
     * `baseURL` follows the usual fallbacks. Never returns the key.
     */
    async testConnection(ref, input = {}) {
      const state = deps.readState();
      const account = ref === undefined || ref === null || String(ref).trim() === "" ? undefined : findAccount(state, ref);
      const config = account === undefined ? undefined : accountConfig(state, account.id);
      const draftKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
      const apiKey = draftKey !== "" ? draftKey : config === undefined ? undefined : await deps.resolveApiKey(effectiveKeyEnv(config));
      const baseURL = typeof input.baseURL === "string" ? input.baseURL.trim() : "";
      try {
        const result = await discoverCpa({
          baseURL,
          autoDiscover: baseURL === "",
          fallbackBaseURL: config === undefined ? undefined : deps.readExistingPiAiRoute?.(config.provider)?.baseURL,
          environmentBaseURL: deps.environmentBaseURL?.(),
          apiKey,
          timeoutMs: state.probeTimeoutMs,
          ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        });
        return { ok: true, test: { ok: true, endpoint: result.rootURL, modelCount: result.models.length } };
      } catch (error) {
        return { ok: true, test: { ok: false, error: error instanceof Error ? error.message : String(error) } };
      }
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

    /**
     * Media models per account, from the last catalog each runtime saw, with
     * their effective and detected kind. `chatModelIds` lets the panel mark a
     * chat model as media by hand. No network access.
     */
    mediaAccounts() {
      const state = deps.readState();
      return state.accounts.map((account) => {
        const config = accountConfig(state, account.id);
        const runtime = ensureRuntime(account.id);
        const st = runtime.currentStatus ?? {};
        const kinded = runtime.withKinds();
        return {
          id: account.id,
          displayName: config.displayName,
          enabled: config.enabled === true,
          state: config.enabled === true ? st.state ?? "idle" : "disabled",
          endpoint: st.endpoint || "",
          discovered: kinded.length,
          models: kinded
            .filter((m) => !isChatModel(m))
            .map((m) => ({
              id: m.id,
              ...(m.name === undefined ? {} : { name: m.name }),
              kind: m.kind,
              detectedKind: m.detectedKind ?? "chat",
              ...(mediaAliasTarget(m.id) === undefined ? {} : { aliasOf: mediaAliasTarget(m.id) }),
            })),
          chatModelIds: kinded.filter(isChatModel).map((m) => m.id),
        };
      });
    },

    /**
     * Read-only media diagnostic for one account (see diagnoseMedia in
     * lib/media.js). Uses the account's key on the host; never returns it.
     */
    /**
     * The CPA root and key a media request of this account uses: the address
     * the last sync connected to, else the configured or route address.
     * Host-only; the key is never returned to a page.
     * @throws MediaError `no-endpoint`.
     */
    async mediaEndpoint(accountId) {
      const state = deps.readState();
      const account = state.accounts.find((a) => a.id === accountId);
      if (account === undefined) throw new MediaError("invalid-account");
      const config = accountConfig(state, account.id);
      const runtime = ensureRuntime(account.id);
      const known = runtime.currentStatus?.endpoint || config.baseURL || deps.readExistingPiAiRoute?.(config.provider)?.baseURL || "";
      let rootURL;
      try {
        rootURL = normalizeCpaRoot(known);
      } catch {
        throw new MediaError("no-endpoint");
      }
      return { rootURL, apiKey: await deps.resolveApiKey(effectiveKeyEnv(config)), probeTimeoutMs: state.probeTimeoutMs };
    },

    async diagnoseMedia(ref) {
      const state = deps.readState();
      const account = findAccount(state, ref);
      const { rootURL, apiKey } = await this.mediaEndpoint(account.id);
      const diagnostic = await diagnoseMedia({
        rootURL,
        apiKey,
        timeoutMs: Math.max(state.probeTimeoutMs, 8000),
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      });
      return { accountId: account.id, keyConfigured: apiKey !== undefined, ...diagnostic };
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
  testAccount: "/api/dsh-cliproxyapi/accounts/test",
  updateStatus: "/api/dsh-cliproxyapi/updates/status",
  updateCheck: "/api/dsh-cliproxyapi/updates/check",
  updateSave: "/api/dsh-cliproxyapi/updates/save",
  updateDownload: "/api/dsh-cliproxyapi/updates/download",
  quotaStatus: "/api/dsh-cliproxyapi/quota/status",
  quotaRefresh: "/api/dsh-cliproxyapi/quota/refresh",
  quotaSave: "/api/dsh-cliproxyapi/quota/save",
  mediaStatus: "/api/dsh-cliproxyapi/media/status",
  mediaSave: "/api/dsh-cliproxyapi/media/save",
  mediaDiagnose: "/api/dsh-cliproxyapi/media/diagnose",
  mediaSession: "/api/dsh-cliproxyapi/media/session",
  mediaSessionSave: "/api/dsh-cliproxyapi/media/session/save",
  mediaFile: "/api/dsh-cliproxyapi/media/file",
  mediaCommand: "/api/dsh-cliproxyapi/media/command",
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
  const media = (status.allModels ?? []).filter((m) => m.kind === "image" || m.kind === "video");
  const mediaLine =
    media.length > 0
      ? `Media Models (not in the picker): ${media.filter((m) => m.kind === "image").length} image, ${media.filter((m) => m.kind === "video").length} video`
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
    ...(mediaLine ? [mediaLine] : []),
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
    return "No CLIProxyAPI account is configured. Add one in Settings → CLIProxyAPI.";
  }
  const shown =
    onlyAccountId === undefined ? accounts : accounts.filter((a) => a.id === onlyAccountId);
  const enabled = accounts.filter((a) => a.config.enabled).length;
  const header = `CLIProxyAPI accounts: ${accounts.length} (${enabled} enabled); auto refresh every ${payload.global?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS}s`;
  return [header, ...shown.map(renderAccountStatus)].join("\n\n");
}

/** Account fields the save and add routes accept, besides key handling. */
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
    logger: ctx.logger,
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

  // Media preferences (lib/media.js) live in their own file next to the
  // account state, never inside it, so no state migration is involved.
  const mediaSettingsPath = join(updateDirectory, "media-settings.json");
  let mediaWarned = false;
  const readMedia = () => {
    const loaded = loadMediaSettings(mediaSettingsPath);
    if (loaded.error === undefined) {
      mediaWarned = false;
    } else if (!mediaWarned) {
      mediaWarned = true;
      ctx.logger?.warn?.(
        `dsh-cliproxyapi: ${mediaSettingsPath} is unreadable; default media settings apply until it is saved again (the damaged file is then kept as *.corrupt-*.json)`
      );
    }
    return loaded;
  };

  const controller = createCpaController({
    settings: ctx.settings,
    readState,
    writeState,
    mediaKindOverrides: (id) => accountKindOverrides(readMedia().settings, id),
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

  /** Media page payload: preferences (without per-account maps) and each account's media models. */
  const mediaStatus = () => {
    const { settings, error } = readMedia();
    const { accounts: perAccount, ...global } = settings;
    return {
      settings: global,
      ...(error === undefined ? {} : { settingsError: error }),
      accounts: controller.mediaAccounts().map((account) => {
        const overrides = accountKindOverrides(settings, account.id);
        return {
          ...account,
          disabledModels: perAccount[account.id]?.disabledModels ?? [],
          kindOverrides: overrides,
          models: account.models.map((m) => ({
            ...m,
            enabled: mediaModelEnabled(settings, account.id, m.id),
            overridden: overrides[m.id] !== undefined,
          })),
        };
      }),
    };
  };

  const saveMedia = async (body) => {
    const accountId = body?.account?.accountId;
    if (accountId !== undefined && !controller.mediaAccounts().some((a) => a.id === accountId)) {
      throw new MediaError("invalid-account");
    }
    const { settings, kindsChanged } = applyMediaPatch(readMedia().settings, body);
    saveMediaSettings(mediaSettingsPath, settings);
    // A reclassified model enters or leaves the chat routes on the next sync.
    if (kindsChanged === undefined) return { ok: true, media: mediaStatus() };
    await controller.refreshAccount(kindsChanged);
    return { ok: true, media: mediaStatus(), status: await controller.statusPayload() };
  };

  // Per-session model picks and recent outputs, in their own file.
  const mediaSessions = createMediaSessionStore(join(updateDirectory, "media-sessions.json"));

  const mediaChoices = () => {
    const { settings } = readMedia();
    const accounts = controller.mediaAccounts();
    return {
      settings,
      accounts,
      options: { image: mediaOptions(accounts, settings, "image"), video: mediaOptions(accounts, settings, "video") },
    };
  };

  /**
   * Choices for a generation command. When nothing of `kind` is offered but
   * an enabled account has not read its catalog yet (just after a start or
   * reload), sync once and look again instead of failing on a timing race.
   */
  const mediaChoicesFor = async (kind) => {
    let choices = mediaChoices();
    const empty = kind === "any" ? choices.options.image.length + choices.options.video.length === 0 : choices.options[kind].length === 0;
    if (empty && choices.accounts.some((a) => a.enabled && a.discovered === 0)) {
      await controller.refreshAll();
      choices = mediaChoices();
    }
    return choices;
  };

  /** One line per account for an empty choice: state and catalog counts, never keys or URLs. */
  const mediaAccountsSummary = (accounts, kind) =>
    accounts
      .map((a) => `${a.displayName || a.id}: ${a.enabled ? a.state : "disabled"}, ${a.discovered} model(s), ${a.models.filter((m) => m.kind === kind).length} ${kind}`)
      .join("; ") || "no account";

  /** What the composer button shows for one session (no network access). */
  const sessionView = (sessionId) => {
    const { settings, options } = mediaChoices();
    const entry = sessionId === undefined ? { recent: [] } : mediaSessions.get(sessionId);
    const current = {};
    for (const kind of ["image", "video"]) {
      try {
        const { option, source } = chooseMediaModel({
          options: options[kind],
          sessionRef: entry[kind],
          lastRef: settings.lastSelection[kind],
        });
        current[kind] = { ref: option.ref, source };
      } catch {
        current[kind] = null;
      }
    }
    return {
      sessionId: sessionId ?? null,
      options,
      current,
      recent: entry.recent
        .filter((r) => existsSync(r.file))
        .slice(0, 12)
        .map((r) => ({ id: r.id, kind: r.kind, name: basename(r.file), model: r.model, createdAt: r.createdAt })),
    };
  };

  /** Pick a model for one session (and remember it as the last pick); `ref: null` clears the session's pick. */
  const saveSessionPick = (body) => {
    const kind = body?.kind;
    if (kind !== "image" && kind !== "video") throw new MediaError("invalid-request");
    const sessionId = body.sessionId === undefined || body.sessionId === null ? undefined : validSessionId(body.sessionId);
    if (body.sessionId !== undefined && body.sessionId !== null && sessionId === undefined) throw new MediaError("invalid-session");
    const ref = body.ref === null ? null : typeof body.ref === "string" ? body.ref : undefined;
    if (ref === undefined) throw new MediaError("invalid-model");
    const { settings, options } = mediaChoices();
    if (ref !== null && !options[kind].some((o) => o.ref === ref)) throw new MediaError("invalid-model");
    if (sessionId !== undefined) {
      mediaSessions.update(sessionId, (entry) => {
        if (ref === null) delete entry[kind];
        else entry[kind] = ref;
      });
    }
    if (ref !== null && settings.lastSelection[kind] !== ref) {
      saveMediaSettings(mediaSettingsPath, normalizeMediaSettings({ ...settings, lastSelection: { ...settings.lastSelection, [kind]: ref } }));
    }
    return { ok: true, session: sessionView(sessionId) };
  };

  const MEDIA_FILE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  };

  /**
   * One `Range: bytes=a-b` request against a file of `size` bytes: `[start, end]`,
   * `undefined` without a (usable single) range, `null` when unsatisfiable.
   */
  const byteRange = (header, size) => {
    if (typeof header !== "string" || header === "") return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (match === null || (match[1] === "" && match[2] === "")) return undefined;
    let start;
    let end;
    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (suffix === 0) return null;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
    return [start, end];
  };
  // Request bodies carry references base64-encoded; upstreams cap the body
  // near 2 MiB (xAI: "Failed to read request body: length limit exceeded").
  const FIRST_FRAME_MAX_BYTES = 1_000_000;
  const REFERENCES_MAX_BYTES = 1_400_000;

  /**
   * One attached image within `maxBytes`: as stored when it fits; a PNG is
   * re-encoded here (JPEG on white, long edge ≤ 1280); another format asks
   * DSH's attachment store for a smaller request version.
   * @throws MediaError `reference-too-large`.
   */
  const readReference = async (store, block, maxBytes, signal) => {
    const stored = await store.readImage(block.attachment, signal);
    const image = { mediaType: stored.ref?.mediaType ?? block.attachment?.mediaType, data: stored.data };
    const fitted = fitReferenceImage(image, maxBytes);
    if (fitted !== undefined) return { mediaType: fitted.mediaType, data: fitted.data };
    const width = Number(stored.ref?.width ?? block.attachment?.width);
    const height = Number(stored.ref?.height ?? block.attachment?.height);
    if (typeof store.readImageRequest === "function" && width > 0 && height > 0) {
      const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(width, height));
      try {
        const smaller = await store.readImageRequest(
          block.attachment,
          { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), maxBytes },
          signal
        );
        if (smaller?.data?.byteLength <= maxBytes) return { mediaType: smaller.mediaType, data: smaller.data };
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    throw new MediaError("reference-too-large", String(Math.round(maxBytes / 1000)));
  };

  /** Plain-English host text for a media failure (slash command output and run records). */
  const mediaFailureText = (error, kind = "image") => {
    if (!(error instanceof MediaError)) return error instanceof Error ? error.message : String(error);
    const detail = error.detail;
    const video = kind === "video";
    const noun = video ? "video" : "image";
    switch (error.code) {
      case "missing-prompt": return video ? "add a prompt, for example: /cpa-video waves rolling onto a beach at sunset" : "add a prompt, for example: /cpa-image a red fox in the snow";
      case "invalid-option": return video
        ? `unknown option ${detail}; use -m <model>, --aspect <ratio>, -s <1-15>, -r <480p|720p>`
        : `unknown option ${detail}; use -m <model>, --aspect <ratio>, -n <1-4>`;
      case "invalid-aspect": return `--aspect must be one of ${(video ? VIDEO_ASPECTS : IMAGE_ASPECTS).join(", ")}`;
      case "invalid-count": return "-n must be 1 to 4";
      case "invalid-video-seconds": return "-s / --seconds must be a whole number from 1 to 15";
      case "invalid-video-resolution": return "-r / --resolution must be 480p or 720p";
      case "no-media-model": return `no ${noun} model is available (${detail || "no account"}); check Settings → CLIProxyAPI → Generation, or run /cpa-refresh if a catalog has not been read yet`;
      case "choose-model": return `several ${noun} models are available (${detail}); pick one with the button next to the composer or pass -m <model>`;
      case "model-not-found": return `no enabled ${noun} model matches; available: ${detail || "none"}`;
      case "model-ambiguous": return `several ${noun} models match (${detail}); be more specific`;
      case "workspace-not-local": return `the session's working directory is not a local folder, so the ${noun} cannot be saved`;
      case "unsupported-attachment": return video ? "only an image attachment can be used as the first frame" : "only image attachments can be used as references";
      case "too-many-references": return video ? "attach at most one image (the first frame)" : `attach at most ${MAX_REFERENCE_IMAGES} reference images`;
      case "reference-too-large": return `an attached image could not be made smaller than ${detail ?? "1000"} KB; attach a smaller image`;
      case "upstream-error": return `CPA rejected the request (${detail})`;
      case "timeout": return video ? "CPA did not answer in time" : "CPA did not answer within 3 minutes";
      case "network": return "could not reach CPA";
      case "no-image": return "CPA returned no image";
      case "invalid-image":
      case "invalid-response": return video ? "CPA returned an answer this plugin does not understand" : "CPA returned data that is not a PNG, JPEG, WebP or GIF image";
      case "image-too-large": return "an image is larger than 32 MiB";
      case "video-too-large": return `the video is larger than ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MiB`;
      case "invalid-video": return "CPA returned data that is not an MP4, MOV or WebM video";
      case "video-failed": return `the video could not be generated${detail ? ` (${detail})` : ""}`;
      case "expired": return "CPA no longer knows this video: more than 3 hours have passed since it was submitted";
      case "download-failed": return `could not download the generated ${noun}`;
      case "write-failed": return `could not write the ${noun} file${detail ? ` (${detail})` : ""}`;
      case "no-endpoint": return "this account has no usable server address yet";
      case "invalid-account": return "the model's account no longer exists";
      case "interrupted": return "stopped because the plugin was reloaded or DSH closed";
      default: return error.code;
    }
  };
  // #region Background generation jobs and the session's "running" state
  //
  // `/cpa-image` returns as soon as the request is admitted, so the composer
  // clears the draft at once; the generation continues here and its chat row
  // follows it through `media/command`. DSH counts only agent turns as
  // running, so while a job runs this plugin publishes the host's own
  // `api-session/status` event for that session (the workspace list shows it
  // as running, then completed). It is republished every few seconds and
  // after the agent itself goes idle, because those reset it to idle.

  const mediaJobs = new Map(); // job key → { sessionId, abort }
  let mediaJobSeq = 0;
  let mediaHeartbeat;
  const MEDIA_HEARTBEAT_MS = 5000;
  const jobSessions = () => new Set([...mediaJobs.values()].map((job) => job.sessionId).filter(Boolean));
  const agentRunning = (sessionId) => {
    try {
      return ctx.get?.("agents")?.get?.(sessionId)?.status === "running";
    } catch {
      return false;
    }
  };
  const publishSessionStatus = (sessionId, running) => {
    if (typeof ctx.emit !== "function") return;
    try {
      ctx.emit("api-session/status", sessionId, running);
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not publish the session status: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const settleSessionStatus = (sessionId) => {
    if (sessionId === undefined || jobSessions().has(sessionId) || agentRunning(sessionId)) return;
    publishSessionStatus(sessionId, false);
  };
  const syncHeartbeat = () => {
    if (mediaJobs.size > 0 && mediaHeartbeat === undefined) {
      mediaHeartbeat = setInterval(() => {
        for (const sessionId of jobSessions()) publishSessionStatus(sessionId, true);
      }, MEDIA_HEARTBEAT_MS);
      mediaHeartbeat.unref?.();
    } else if (mediaJobs.size === 0 && mediaHeartbeat !== undefined) {
      clearInterval(mediaHeartbeat);
      mediaHeartbeat = undefined;
    }
  };
  ctx.on?.("agent/status", (event) => {
    const sessionId = event?.agent?.id;
    if (event?.status === "running" || !jobSessions().has(sessionId)) return;
    // After the host's own idle notice for this transition.
    setTimeout(() => {
      if (jobSessions().has(sessionId)) publishSessionStatus(sessionId, true);
    }, 0);
  });
  ctx.effect(
    () => () => {
      const sessions = jobSessions();
      for (const job of mediaJobs.values()) job.abort.abort(new MediaError("interrupted"));
      mediaJobs.clear();
      syncHeartbeat();
      for (const sessionId of sessions) settleSessionStatus(sessionId);
    },
    "cpa: generation jobs"
  );

  /** Update one run record (and prepend new recent outputs) in the session store; never throws. */
  const recordRun = (sessionId, commandId, patch, recent = []) => {
    if (sessionId === undefined) return;
    try {
      mediaSessions.update(sessionId, (entry) => {
        if (recent.length > 0) entry.recent = [...recent, ...entry.recent];
        if (commandId === undefined) return;
        const index = entry.runs.findIndex((run) => run.commandId === commandId);
        if (index >= 0) entry.runs[index] = { ...entry.runs[index], ...patch };
        else entry.runs = [{ commandId, ...patch }, ...entry.runs];
      });
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not record a generation result: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** How the chat row names the save folder: relative to the working directory when inside it. */
  const folderLabel = (cwd, dir) => {
    const rel = relative(cwd, dir);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : basename(dir);
  };

  /** Run one admitted image request in the background; resolves when it has settled and been recorded. */
  const startImageJob = ({ sessionId, commandId, option, args, references, cwd, outputDir, endpoint }) => {
    const key = commandId ?? `job-${++mediaJobSeq}`;
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    const started = Date.now();
    return (async () => {
      try {
        const images = await generateImages({
          rootURL: endpoint.rootURL,
          apiKey: endpoint.apiKey,
          model: option.modelId,
          prompt: args.prompt,
          ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
          count: args.count ?? 1,
          references,
          signal: abort.signal,
        });
        const dir = outputDirectory(cwd, outputDir);
        const paths = writeOutputFiles(dir, outputStem(option.modelId, args.prompt), images);
        const revised = images.find((image) => image.revisedPrompt !== undefined)?.revisedPrompt;
        recordRun(
          sessionId,
          commandId,
          {
            status: "done",
            files: paths.length,
            folder: folderLabel(cwd, dir),
            finishedAt: new Date().toISOString(),
            ...(revised === undefined ? {} : { revisedPrompt: revised }),
          },
          paths.map((p) => recentEntry("image", p, option.ref, new Date(), commandId))
        );
        ctx.logger?.info?.(`cpa: /cpa-image wrote ${paths.length} image(s) with ${option.modelId} in ${Math.round((Date.now() - started) / 1000)} s`);
      } catch (thrown) {
        const error = abort.signal.aborted ? new MediaError("interrupted") : thrown;
        recordRun(sessionId, commandId, {
          status: "error",
          errorCode: error instanceof MediaError ? error.code : "failed",
          error: mediaFailureText(error),
          finishedAt: new Date().toISOString(),
        });
        ctx.logger?.warn?.(`cpa: /cpa-image failed: ${mediaFailureText(error)}`);
      } finally {
        mediaJobs.delete(key);
        syncHeartbeat();
        settleSessionStatus(sessionId);
      }
    })();
  };

  // #endregion

  /**
   * `/cpa-image`: generate or (with attached images) edit, save into the
   * session's folder. Checks everything it can up front (options, model,
   * folder, references, endpoint), then returns while the generation runs as
   * a background job; the chat row shows its progress and result.
   */
  const runImageCommand = async ({ agent, rawInput, attachments = [], signal, commandId }) => {
    try {
      const args = parseImageCommand(rawInput);
      const blocks = Array.isArray(attachments) ? attachments : [];
      if (blocks.some((block) => block?.type !== "image")) throw new MediaError("unsupported-attachment");
      if (blocks.length > MAX_REFERENCE_IMAGES) throw new MediaError("too-many-references");
      const { settings, options, accounts } = await mediaChoicesFor("image");
      const sessionId = validSessionId(agent?.id);
      const entry = sessionId === undefined ? {} : mediaSessions.get(sessionId);
      let option;
      try {
        ({ option } = chooseMediaModel({
          options: options.image,
          requested: args.model,
          sessionRef: entry.image,
          lastRef: settings.lastSelection.image,
        }));
      } catch (error) {
        if (error instanceof MediaError && error.code === "no-media-model") {
          throw new MediaError("no-media-model", mediaAccountsSummary(accounts, "image"));
        }
        throw error;
      }
      const workingDirectory = ctx.get?.("workingDirectory");
      const cwd = agent !== undefined && workingDirectory !== undefined ? await workingDirectory.ensure(agent, signal) : undefined;
      if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new MediaError("workspace-not-local");
      const references = [];
      if (blocks.length > 0) {
        const store = ctx.get?.("attachments");
        if (store === undefined) throw new MediaError("unsupported-attachment");
        const each = Math.floor(REFERENCES_MAX_BYTES / blocks.length);
        for (const block of blocks) references.push(await readReference(store, block, each, signal));
      }
      const endpoint = await controller.mediaEndpoint(option.accountId);
      const id = validCommandId(commandId);
      const count = args.count ?? 1;
      recordRun(sessionId, id, {
        kind: "image",
        status: "running",
        model: option.ref,
        modelName: option.name || option.modelId,
        accountName: option.accountName,
        prompt: args.prompt,
        ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
        count,
        references: references.length,
        files: 0,
        startedAt: new Date().toISOString(),
      });
      void startImageJob({ sessionId, commandId: id, option, args, references, cwd, outputDir: settings.outputDir, endpoint });
      const dir = outputDirectory(cwd, settings.outputDir);
      return {
        kind: "success",
        text: `${references.length > 0 ? "Editing" : "Generating"} ${count} image(s) with ${option.modelId} (${option.accountName}); files go to ${dir}`,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { kind: "error", text: `/cpa-image: ${mediaFailureText(error)}` };
    }
  };

  // #region Video jobs (/cpa-video)
  //
  // A video is submitted once and cannot be cancelled (CPA and xAI have no
  // cancel route). The job is stored in media-jobs.json as soon as CPA
  // returns its request id, polled (5 s, then 10 s, then 15 s) and downloaded
  // through CPA into the session's folder. A reload or restart only pauses
  // the polling: the next activation resumes every stored job younger than
  // CPA's 3-hour request binding, and marks older ones expired.

  const mediaJobStore = createMediaJobStore(join(updateDirectory, "media-jobs.json"));
  // commandId → { phase: "submitting" | "queued" | "running" | "downloading", progress? } for the chat row.
  const videoLive = new Map();

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      timer.unref?.();
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });

  const pollDelay = (elapsedMs) => (elapsedMs < 60_000 ? 5000 : elapsedMs < 180_000 ? 10_000 : 15_000);
  const MAX_POLL_FAILURES = 12;

  /** Poll, download and record one submitted video; a dispose abort leaves it stored for the next activation. */
  const followVideoJob = async (job, abort) => {
    const live = (patch) => {
      if (job.commandId !== undefined) videoLive.set(job.commandId, { ...(videoLive.get(job.commandId) ?? {}), ...patch });
    };
    const finish = (state, runPatch, recent = []) => {
      mediaJobStore.put({ ...job, state, finishedAt: new Date().toISOString() });
      recordRun(job.sessionId, job.commandId, { ...runPatch, finishedAt: new Date().toISOString() }, recent);
    };
    const fail = (error) => {
      const code = error instanceof MediaError ? error.code : "failed";
      finish(code === "expired" ? "expired" : "failed", { status: "error", errorCode: code, error: mediaFailureText(error, "video") });
      ctx.logger?.warn?.(`cpa: /cpa-video ${job.id} failed: ${mediaFailureText(error, "video")}`);
    };
    const submitted = Date.parse(job.submittedAt);
    let failures = 0;
    live({ phase: "queued" });
    try {
      for (;;) {
        if (Date.now() - submitted > VIDEO_JOB_TTL_MS) throw new MediaError("expired");
        let endpoint;
        let status;
        try {
          endpoint = await controller.mediaEndpoint(job.accountId);
          status = await retrieveVideo({ rootURL: endpoint.rootURL, apiKey: endpoint.apiKey, requestId: job.id, signal: abort.signal });
          failures = 0;
        } catch (error) {
          if (abort.signal.aborted) throw error;
          // A missing account or a refusal that keeps coming back ends the job;
          // network trouble and short CPA hiccups are retried.
          if (error instanceof MediaError && error.code === "invalid-account") throw error;
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) throw error;
          await sleep(pollDelay(Date.now() - submitted), abort.signal);
          continue;
        }
        if (status.state === "failed") throw new MediaError("video-failed", status.error);
        if (status.state === "done") {
          live({ phase: "downloading", progress: 100 });
          const dir = outputDirectory(job.cwd, job.outputDir);
          const path = await downloadVideo({
            rootURL: endpoint.rootURL,
            apiKey: endpoint.apiKey,
            requestId: job.id,
            dir,
            stem: outputStem(job.modelId, job.prompt),
            signal: abort.signal,
          });
          finish("done", { status: "done", files: 1, folder: folderLabel(job.cwd, dir) }, [recentEntry("video", path, job.ref, new Date(), job.commandId)]);
          ctx.logger?.info?.(`cpa: /cpa-video ${job.id} saved after ${Math.round((Date.now() - submitted) / 1000)} s`);
          return;
        }
        live({ phase: status.state, ...(status.progress === undefined ? {} : { progress: status.progress }) });
        await sleep(pollDelay(Date.now() - submitted), abort.signal);
      }
    } catch (error) {
      if (abort.signal.aborted) return; // paused by a reload; resumed by the next activation
      fail(error);
    }
  };

  /** Track one job in the session's running state until it settles. */
  const trackVideoJob = (key, sessionId, run) => {
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    return (async () => {
      try {
        await run(abort);
      } finally {
        if (mediaJobs.get(key)?.abort === abort) mediaJobs.delete(key);
        videoLive.delete(key);
        syncHeartbeat();
        settleSessionStatus(sessionId);
      }
    })();
  };

  /** Submit one admitted video, store the job, then follow it. */
  const startVideoJob = ({ sessionId, commandId, option, args, image, cwd, outputDir, endpoint }) => {
    const key = commandId ?? `job-${++mediaJobSeq}`;
    if (commandId !== undefined) videoLive.set(commandId, { phase: "submitting" });
    return trackVideoJob(key, sessionId, async (abort) => {
      let requestId;
      try {
        ({ requestId } = await submitVideo({
          rootURL: endpoint.rootURL,
          apiKey: endpoint.apiKey,
          model: option.modelId,
          prompt: args.prompt,
          seconds: args.seconds,
          ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
          resolution: args.resolution,
          ...(image === undefined ? {} : { image }),
          signal: abort.signal,
        }));
      } catch (thrown) {
        // Cut off before CPA answered: whether it was submitted is unknown.
        const error = abort.signal.aborted ? new MediaError("interrupted") : thrown;
        recordRun(sessionId, commandId, {
          status: "error",
          errorCode: error instanceof MediaError ? error.code : "failed",
          error: mediaFailureText(error, "video"),
          finishedAt: new Date().toISOString(),
        });
        ctx.logger?.warn?.(`cpa: /cpa-video was not submitted: ${mediaFailureText(error, "video")}`);
        return;
      }
      const job = mediaJobStore.put({
        id: requestId,
        state: "submitted",
        accountId: option.accountId,
        modelId: option.modelId,
        ref: option.ref,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(commandId === undefined ? {} : { commandId }),
        cwd,
        outputDir,
        prompt: args.prompt,
        seconds: args.seconds,
        submittedAt: new Date().toISOString(),
      });
      recordRun(sessionId, commandId, { videoId: requestId });
      ctx.logger?.info?.(`cpa: /cpa-video submitted ${requestId} (${option.modelId}, ${args.seconds} s, ${args.resolution})`);
      await followVideoJob(job, abort);
    });
  };

  /** Resume every stored job that is still running (after a reload or restart). */
  const resumeVideoJobs = () => {
    let jobs;
    try {
      jobs = mediaJobStore.list().filter((job) => job.state === "submitted");
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not read media-jobs.json: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const job of jobs) {
      const key = job.commandId ?? `video-${job.id}`;
      if (mediaJobs.has(key)) continue;
      void trackVideoJob(key, job.sessionId, (abort) => followVideoJob(job, abort));
    }
  };

  /**
   * `/cpa-video`: submit a video (optionally from one attached first-frame
   * image) and return at once; the chat row follows the background job.
   */
  const runVideoCommand = async ({ agent, rawInput, attachments = [], signal, commandId }) => {
    try {
      const parsed = parseVideoCommand(rawInput);
      const blocks = Array.isArray(attachments) ? attachments : [];
      if (blocks.some((block) => block?.type !== "image")) throw new MediaError("unsupported-attachment");
      if (blocks.length > 1) throw new MediaError("too-many-references");
      const { settings, options, accounts } = await mediaChoicesFor("video");
      const sessionId = validSessionId(agent?.id);
      const entry = sessionId === undefined ? {} : mediaSessions.get(sessionId);
      let option;
      try {
        ({ option } = chooseMediaModel({ options: options.video, requested: parsed.model, sessionRef: entry.video, lastRef: settings.lastSelection.video }));
      } catch (error) {
        if (error instanceof MediaError && error.code === "no-media-model") throw new MediaError("no-media-model", mediaAccountsSummary(accounts, "video"));
        throw error;
      }
      const workingDirectory = ctx.get?.("workingDirectory");
      const cwd = agent !== undefined && workingDirectory !== undefined ? await workingDirectory.ensure(agent, signal) : undefined;
      if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new MediaError("workspace-not-local");
      let image;
      if (blocks.length === 1) {
        const store = ctx.get?.("attachments");
        if (store === undefined) throw new MediaError("unsupported-attachment");
        image = await readReference(store, blocks[0], FIRST_FRAME_MAX_BYTES, signal);
      }
      const endpoint = await controller.mediaEndpoint(option.accountId);
      const args = { ...parsed, seconds: parsed.seconds ?? settings.defaultVideoSeconds, resolution: parsed.resolution ?? settings.defaultVideoResolution };
      const id = validCommandId(commandId);
      recordRun(sessionId, id, {
        kind: "video",
        status: "running",
        model: option.ref,
        modelName: option.name || option.modelId,
        accountName: option.accountName,
        prompt: args.prompt,
        ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
        seconds: args.seconds,
        resolution: args.resolution,
        count: 1,
        references: image === undefined ? 0 : 1,
        files: 0,
        startedAt: new Date().toISOString(),
      });
      void startVideoJob({ sessionId, commandId: id, option, args, image, cwd, outputDir: settings.outputDir, endpoint });
      return {
        kind: "success",
        text: `Submitting a ${args.seconds} s ${args.resolution} video to ${option.modelId} (${option.accountName}); a submitted video cannot be cancelled. Files go to ${outputDirectory(cwd, settings.outputDir)}`,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { kind: "error", text: `/cpa-video: ${mediaFailureText(error, "video")}` };
    }
  };

  /** `/cpa-video-status`: this session's video jobs, newest first (text). */
  const runVideoStatusCommand = async ({ agent }) => {
    const sessionId = validSessionId(agent?.id);
    const jobs = mediaJobStore.list().filter((job) => job.sessionId !== undefined && job.sessionId === sessionId).slice(0, 20);
    if (jobs.length === 0) return { kind: "success", text: "No video jobs in this session." };
    const lines = jobs.map((job) => {
      const live = job.commandId === undefined ? undefined : videoLive.get(job.commandId);
      const state = job.state === "submitted" ? (live?.phase ?? "waiting") + (live?.progress === undefined ? "" : ` ${live.progress}%`) : job.state;
      const prompt = job.prompt.length > 40 ? `${job.prompt.slice(0, 40)}…` : job.prompt;
      return `${job.submittedAt.slice(0, 19).replace("T", " ")}  ${state.padEnd(14)} ${job.modelId}, ${job.seconds} s  ${prompt}  (${job.id})`;
    });
    return { kind: "success", text: lines.join("\n") };
  };

  // #endregion
  reschedule();
  resumeVideoJobs();
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
      const offVideo = cmdCtx.commands.register({
        name: "cpa-video",
        description: "Generate a video with a CLIProxyAPI video model; attach one image to use it as the first frame. A submitted video cannot be cancelled.",
        input: { hint: "[-m <model>] [--aspect 16:9] [-s 1-15] [-r 480p|720p] <prompt>", attachments: true },
        handler: runVideoCommand,
      });
      const offVideoStatus = cmdCtx.commands.register({
        name: "cpa-video-status",
        description: "List this session's CLIProxyAPI video jobs and their state.",
        handler: runVideoStatusCommand,
      });
      const offImage = cmdCtx.commands.register({
        name: "cpa-image",
        description: "Generate an image with a CLIProxyAPI image model; attach images to edit them. Files go to the session's working directory.",
        input: { hint: "[-m <model>] [--aspect 16:9] [-n 1-4] <prompt>", attachments: true },
        handler: runImageCommand,
      });
      return () => {
        offStatus?.();
        offRefresh?.();
        offImage?.();
        offVideo?.();
        offVideoStatus?.();
      };
    }, "cpa: commands");
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
              sendJson(res, 200, await run(body, req));
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
        route(ROUTES.testAccount, "POST", (body) => controller.testConnection(body.accountId, { baseURL: body.baseURL, apiKey: body.apiKey }), 400),
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
        route(ROUTES.mediaStatus, "GET", async () => ({ ok: true, media: mediaStatus() })),
        route(ROUTES.mediaSave, "POST", saveMedia, 400),
        route(
          ROUTES.mediaDiagnose,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") throw new MediaError("invalid-account");
            return { ok: true, diagnostic: await controller.diagnoseMedia(body.accountId) };
          },
          400
        ),
        route(
          ROUTES.mediaSession,
          "GET",
          async (_body, req) => {
            const raw = new URL(req.url ?? "/", "http://host").searchParams.get("sessionId");
            const sessionId = raw === null || raw === "" ? undefined : validSessionId(raw);
            if (raw !== null && raw !== "" && sessionId === undefined) throw new MediaError("invalid-session");
            // Right after a start the catalogs may not be read yet; sync once
            // instead of letting the composer button wait for its next retry.
            await mediaChoicesFor("any");
            return { ok: true, session: sessionView(sessionId) };
          },
          400
        ),
        route(ROUTES.mediaSessionSave, "POST", async (body) => saveSessionPick(body), 400),
        // One slash-command run's record and files (its chat row shows them).
        // The absolute paths let the page open or reveal a file through DSH's
        // own Session Remote (`session.openWorkspacePath`), which re-verifies
        // them on the Host.
        route(
          ROUTES.mediaCommand,
          "GET",
          async (_body, req) => {
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const commandId = validCommandId(params.get("commandId") ?? "");
            if (sessionId === undefined || commandId === undefined) throw new MediaError("invalid-request");
            const entry = mediaSessions.get(sessionId);
            const files = entry.recent
              .filter((r) => r.commandId === commandId && existsSync(r.file))
              .map((r) => ({ id: r.id, kind: r.kind, name: basename(r.file), path: r.file }));
            let run = entry.runs.find((r) => r.commandId === commandId) ?? null;
            // A run recorded as running that no job of this activation owns was
            // cut off by a reload or a restart.
            if (run?.status === "running" && !mediaJobs.has(commandId)) {
              run = { ...run, status: "error", errorCode: "interrupted", error: mediaFailureText(new MediaError("interrupted"), run.kind) };
            } else if (run?.status === "running" && videoLive.has(commandId)) {
              // A video's phase (submitting / queued / running / downloading) and CPA's progress, if it reports one.
              run = { ...run, ...videoLive.get(commandId) };
            }
            // Which file manager "show in folder" opens, to name the menu item.
            const desktop = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "finder" : "filemanager";
            return { ok: true, run, files, desktop, ...(files.length > 0 ? { folderPath: dirname(files[0].path) } : {}) };
          },
          400
        ),
        // Serves only files this plugin wrote and recorded for that session.
        webCtx.webServer.register({
          kind: "exact",
          path: ROUTES.mediaFile,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, "GET")) return;
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const record = sessionId === undefined ? undefined : mediaSessions.get(sessionId).recent.find((r) => r.id === params.get("id"));
            const type = record === undefined ? undefined : MEDIA_FILE_TYPES[extname(record.file).toLowerCase()];
            if (record === undefined || type === undefined || !existsSync(record.file)) {
              sendJson(res, 404, { ok: false, error: "not-found" });
              return;
            }
            try {
              if (!type.startsWith("video/")) {
                const bytes = readFileSync(record.file);
                res.writeHead(200, {
                  "cache-control": "no-store",
                  "content-type": type,
                  "content-length": String(bytes.byteLength),
                  "x-content-type-options": "nosniff",
                });
                res.end(bytes);
                return;
              }
              // Videos are streamed, with single byte ranges so <video> can seek.
              const size = statSync(record.file).size;
              const range = byteRange(req.headers?.range, size);
              if (range === null) {
                res.writeHead(416, { "content-range": `bytes */${size}` });
                res.end();
                return;
              }
              const [start, end] = range ?? [0, size - 1];
              res.writeHead(range === undefined ? 200 : 206, {
                "cache-control": "no-store",
                "content-type": type,
                "accept-ranges": "bytes",
                "content-length": String(size === 0 ? 0 : end - start + 1),
                ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${size}` }),
                "x-content-type-options": "nosniff",
              });
              if (size === 0) {
                res.end();
                return;
              }
              const stream = createReadStream(record.file, { start, end });
              stream.on("error", () => res.destroy?.());
              res.on?.("close", () => stream.destroy());
              stream.pipe(res);
            } catch {
              sendJson(res, 404, { ok: false, error: "not-found" });
            }
          },
        }),
      ];
      return () => {
        for (const dispose of disposers) dispose?.();
      };
    }, "cpa: webserver routes");
  });
}

export const apply = mountOnce(PACKAGE_NAME, applyImpl);

// #endregion
