// Persisted account normalization, migration, conflicts and account patches.

import { DEFAULT_ACCOUNT_ID, DEFAULT_PROVIDER, DEFAULT_DISPLAY_NAME, DEFAULT_API_KEY_ENV, STATE_VERSION, ACCOUNT_FIELDS, GLOBAL_FIELDS, normalizeStringList, normalizeModelOverrides, resolveConfig, normalizeAccountId } from "./config.js";
import { managedRouteKeys } from "./routes.js";

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

export function pickFields(source, fields) {
  const out = {};
  if (typeof source !== "object" || source === null) return out;
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field];
  return out;
}

export function plainObject(value) {
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
