// Multi-account operations and serialized writes to the shared settings service.

import { join } from "node:path";
import { diagnoseMedia, mediaAliasTarget, MediaError } from "../media.js";
import { name, DEFAULT_API_KEY_ENV, GLOBAL_FIELDS, toCredentialRef, resolveConfig } from "./config.js";
import { recommendModels } from "./models.js";
import { isChatModel, managedRouteKeys } from "./routes.js";
import { pickFields, normalizeState, accountConflicts, assertNoConflicts, newAccountDefaults, patchAccount } from "./accounts.js";
import { normalizeCpaRoot, discoverCpa } from "./discovery.js";
import { CpaRuntime } from "./runtime.js";

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
          listingOk: runtime.listingOk !== false,
          catalogIncomplete: runtime.listingOk === false,
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
