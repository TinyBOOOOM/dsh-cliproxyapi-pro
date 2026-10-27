// Owns account refresh cycles, credential quarantine, generation fencing, and safe snapshots.
import { QUOTA_TTL_MS, DEFAULT_QUOTA_TIMEOUT_MS, DEFAULT_QUOTA_CONCURRENCY } from "./constants.js";
import { QuotaError, isObj, text, firstText, flagOf, getPath, normalizeProvider, credentialStatus, extractPlan, entryClaims, shortMessage, parseRecent, sortWindows } from "./helpers.js";
import { managementKeyRef, managementOrigin, createManagement, createLimiter } from "./management.js";
import { buildModelIndex } from "./matching.js";
import { createOAuthProbes } from "./probes/oauth.js";
import { createGoogleProbes } from "./probes/google.js";
import { createBillingProbes } from "./probes/billing.js";
import { createPluginProbe } from "./probes/plugin.js";

//#region Quota Controller

/**
 * Owns the quota state of every plugin account: key lookups, management API
 * reads, upstream quota probes, TTL/lockout policy and the public snapshot.
 */
export function createQuotaController(deps) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const ttlMs = Number.isFinite(deps.ttlMs) && deps.ttlMs >= 0 ? deps.ttlMs : QUOTA_TTL_MS;
  const timeoutMs = Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0 ? deps.timeoutMs : DEFAULT_QUOTA_TIMEOUT_MS;
  const concurrency = Number.isInteger(deps.concurrency) && deps.concurrency > 0 ? deps.concurrency : DEFAULT_QUOTA_CONCURRENCY;
  const logger = deps.logger;
  const root = new AbortController();
  const pool = createLimiter(concurrency);
  const states = new Map();
  /** management origin → Antigravity endpoint that last returned usable rows. */
  const agPreferred = new Map();
  let disposed = false;

  const stateFor = (id) => {
    let st = states.get(id);
    if (st === undefined) {
      st = { gen: 0, inflight: null, result: null, data: null, lockedOut: false, pausedCredentials: new Map(), lastAttemptAt: undefined };
      states.set(id, st);
    }
    return st;
  };

  const log = (level, message) => {
    try {
      logger?.[level]?.(message);
    } catch {
      /* logging must never break a refresh */
    }
  };

  const listAccounts = () => {
    try {
      const list = deps.listAccounts();
      return Array.isArray(list) ? list.filter((a) => isObj(a) && text(a.id) !== "") : [];
    } catch {
      return [];
    }
  };

  const findAccount = (accountId) => {
    const account = listAccounts().find((a) => a.id === accountId);
    if (account === undefined) throw new Error(`dsh-cliproxyapi: unknown account ${JSON.stringify(String(accountId))}`);
    return account;
  };

  const keyConfigured = async (ref) => {
    try {
      return (await deps.describeKey(ref))?.configured === true;
    } catch {
      return false;
    }
  };

  const { management, apiCall, loadModels } = createManagement({ fetchImpl, timeoutMs });

  // --- Provider quota probes: each returns { windows, plan? } or throws QuotaError ---
  const PROBES = {
    ...createOAuthProbes({ apiCall, now }),
    ...createGoogleProbes({ apiCall, now, agPreferred }),
    ...createBillingProbes({ apiCall, management, now }),
  };
  PROBES.gemini = PROBES["gemini-cli"];
  const pluginProbe = createPluginProbe({ management });

  async function loadCredential(ctx, entry, previous) {
    const id = firstText(entry.name, entry.id);
    const provider = normalizeProvider(firstText(entry.provider, entry.type)) || "unknown";
    const prefix = text(firstText(entry.prefix, getPath(entry, ["attributes", "prefix"]), getPath(entry, ["metadata", "prefix"]))).replace(/^\/+|\/+$/g, "").toLowerCase();
    const status = credentialStatus(entry);
    const credential = {
      id,
      label: firstText(entry.label, entry.email, entry.account_email, typeof entry.account === "string" ? entry.account : ""),
      provider,
    };
    const plan = extractPlan(entry) || extractPlan(...entryClaims(entry)) || previous?.plan || "";
    credential.status = status;
    const statusMessage = shortMessage(firstText(entry.status_message, entry.statusMessage));
    if (statusMessage !== "") credential.statusMessage = statusMessage;
    if (prefix !== "") credential.prefix = prefix;
    const recent = parseRecent(entry);
    const paused = ctx.pausedCredentials.get(id);
    if (paused !== undefined) {
      // Keep the failure sticky even if CPA temporarily removes/re-adds the file.
      // No model read, token download or upstream probe for this credential.
      return {
        ...credential,
        ...(plan === "" ? {} : { plan }),
        models: paused.provider === provider && paused.prefix === prefix ? paused.models : null,
        quotaState: "error",
        quotaErrorCode: paused.quotaErrorCode,
        autoRefreshPaused: true,
        windows: [],
        ...(recent === undefined ? {} : { recent }),
      };
    }

    const authIndex = firstText(entry.auth_index, entry.authIndex);
    // Built-in probes win; any other credential CPA marks `supports_quota`
    // (a CPA quota plugin or a declarative quota_probe) goes through CPA's
    // own normalized route.
    const probe = PROBES[provider] ?? (flagOf(entry.supports_quota ?? entry.supportsQuota) === true ? pluginProbe : undefined);
    const [models, quota] = await Promise.all([
      loadModels(ctx, id, prefix, status),
      (async () => {
        if (probe === undefined) return { quotaState: "unsupported", windows: [] };
        if (authIndex === "") return { quotaState: "error", quotaErrorCode: "missing-auth-index", windows: [] };
        try {
          const result = await probe(ctx, entry, authIndex, plan);
          return { quotaState: "ok", windows: sortWindows(result.windows), plan: result.plan };
        } catch (error) {
          if (error?.code === "aborted") throw error;
          return { quotaState: "error", quotaErrorCode: error instanceof QuotaError ? error.code : "invalid-response", windows: [] };
        }
      })(),
    ]);
    const finalPlan = quota.plan || plan;
    if (quota.quotaState === "error") {
      ctx.pausedCredentials.set(id, { models, provider, prefix, quotaErrorCode: quota.quotaErrorCode });
    }
    return {
      ...credential,
      autoRefreshPaused: quota.quotaState === "error",
      ...(finalPlan === "" ? {} : { plan: finalPlan }),
      models,
      quotaState: quota.quotaState,
      ...(quota.quotaErrorCode === undefined ? {} : { quotaErrorCode: quota.quotaErrorCode }),
      windows: quota.windows,
      ...(recent === undefined ? {} : { recent }),
    };
  }

  async function runCycle(account, signal, retryPaused) {
    let key;
    try {
      key = await deps.resolveKey(managementKeyRef(account.id));
    } catch {
      key = undefined;
    }
    if (typeof key !== "string" || key.trim() === "") return { kind: "nokey" };
    const origin = managementOrigin(account.endpoint) ?? managementOrigin(account.baseURL);
    if (origin === undefined) throw new QuotaError("no-endpoint");
    // A cycle owns its copy: cancelled/obsolete work must not change lockouts.
    const pausedCredentials = retryPaused ? new Map() : new Map(stateFor(account.id).pausedCredentials);
    const ctx = { origin, key: key.trim(), signal, pausedCredentials };
    const files = await management(ctx, "/v0/management/auth-files");
    const entries = Array.isArray(files) ? files : Array.isArray(files?.files) ? files.files : null;
    if (entries === null) throw new QuotaError("invalid-response");
    const previous = new Map((stateFor(account.id).data?.credentials ?? []).map((c) => [c.id, c]));
    const seen = new Set();
    const unique = entries.filter((e) => {
      if (!isObj(e)) return false;
      const name = firstText(e.name, e.id);
      if (name === "" || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    const credentials = await Promise.all(unique.map((entry) => pool(() => loadCredential(ctx, entry, previous.get(firstText(entry.name, entry.id))), signal)));
    return { kind: "ok", credentials, pausedCredentials };
  }

  function startRefresh(account, retryPaused = false) {
    const st = stateFor(account.id);
    if (st.inflight !== null) {
      const active = st.inflight;
      // A manual recovery must not disappear into a background cycle that
      // skips quarantined credentials. Queue at most one recovery, never overlap.
      if (retryPaused && !active.retryPaused && st.pausedCredentials.size > 0) {
        active.recovery ??= active.promise.then(() => {
          if (disposed || st.gen !== active.gen) return;
          return startRefresh(account, true);
        });
        return active.recovery;
      }
      return active.promise;
    }
    const controller = new AbortController();
    const onRootAbort = () => controller.abort();
    root.signal.addEventListener("abort", onRootAbort, { once: true });
    const gen = ++st.gen;
    const current = () => !disposed && st.gen === gen;
    const promise = (async () => {
      try {
        const result = await runCycle(account, controller.signal, retryPaused);
        if (!current()) return;
        if (result.kind === "nokey") {
          st.result = { state: "nokey" };
        } else {
          const fetchedAt = new Date(now()).toISOString();
          st.data = { credentials: result.credentials, fetchedAt };
          st.pausedCredentials = result.pausedCredentials;
          st.result = { state: "ok" };
          st.lockedOut = false;
        }
      } catch (error) {
        if (!current()) return;
        const code = error instanceof QuotaError && error.code !== "aborted" ? error.code : error?.code === "aborted" ? null : "network";
        if (code === null) return;
        st.result = { state: "error", errorCode: code, ...(error?.status === undefined ? {} : { errorStatus: error.status }) };
        // Repeated quota probes can invalidate upstream sessions: fail closed
        // for every cycle error, not only rejected management keys.
        st.lockedOut = true;
        log("warn", `dsh-cliproxyapi: quota refresh failed for account ${account.id}: ${code}${error?.status === undefined ? "" : ` (${error.status})`}`);
      } finally {
        root.signal.removeEventListener("abort", onRootAbort);
        if (st.gen === gen) {
          st.inflight = null;
          if (!disposed) st.lastAttemptAt = now();
        }
      }
    })();
    st.inflight = { gen, controller, promise, retryPaused, recovery: null };
    return promise;
  }

  function cancelInflight(st) {
    if (st.inflight === null) return;
    st.inflight.controller.abort();
    st.inflight = null;
    st.gen += 1;
  }

  async function buildSnapshot(prepared) {
    const accounts = prepared ?? (await prepare());
    const out = [];
    for (const { account, keyRef, keyConfigured: configured } of accounts) {
      const st = stateFor(account.id);
      const refreshing = st.inflight !== null;
      let state;
      if (!configured) state = "nokey";
      else if (st.result === null || (st.result.state === "nokey")) state = refreshing ? "loading" : "idle";
      else state = st.result.state;
      const pickerModels = (Array.isArray(account.pickerModels) ? account.pickerModels : [])
        .filter((m) => isObj(m) && text(m.id) !== "")
        .map((m) => ({ id: text(m.id), route: text(m.route), ...(text(m.ownedBy) === "" ? {} : { ownedBy: text(m.ownedBy) }) }));
      const entry = {
        accountId: account.id,
        displayName: text(account.displayName) || account.id,
        provider: text(account.provider),
        routes: Array.isArray(account.routes) ? account.routes.filter((r) => typeof r === "string") : [],
        enabled: account.enabled === true,
        keyRef,
        keyConfigured: configured,
        state,
        ...(state === "error" ? { errorCode: st.result.errorCode, ...(st.result.errorStatus === undefined ? {} : { errorStatus: st.result.errorStatus }) } : {}),
        ...(configured && st.data !== null ? { fetchedAt: st.data.fetchedAt } : {}),
        refreshing,
        autoRefreshPaused: configured && st.lockedOut,
        credentials: configured && st.data !== null ? structuredClone(st.data.credentials) : [],
        pickerModels,
      };
      Object.assign(entry, buildModelIndex(entry));
      out.push(entry);
    }
    return {
      generatedAt: new Date(now()).toISOString(),
      refreshing: out.some((a) => a.refreshing),
      accounts: out,
    };
  }

  async function prepare() {
    const accounts = listAccounts();
    const known = new Set(accounts.map((a) => a.id));
    for (const [id, st] of states) {
      if (!known.has(id)) {
        cancelInflight(st);
        states.delete(id);
      }
    }
    return Promise.all(accounts.map(async (account) => {
      const keyRef = managementKeyRef(account.id);
      return { account, keyRef, keyConfigured: await keyConfigured(keyRef) };
    }));
  }

  return {
    async snapshot() {
      const prepared = await prepare();
      if (!disposed) {
        const at = now();
        for (const { account, keyConfigured: configured } of prepared) {
          if (account.enabled !== true || !configured) continue;
          const st = stateFor(account.id);
          if (st.inflight !== null || st.lockedOut) continue;
          if (st.lastAttemptAt !== undefined && at - st.lastAttemptAt < ttlMs) continue;
          startRefresh(account);
        }
      }
      return buildSnapshot(prepared);
    },

    /** `options.wait === false` starts the refresh and returns at once (snapshot shows `refreshing`). */
    async refresh(accountId, options = {}) {
      const wait = options?.wait !== false;
      if (accountId !== undefined && accountId !== null && accountId !== "") {
        const account = findAccount(accountId);
        if (!disposed) {
          const st = stateFor(account.id);
          if (await keyConfigured(managementKeyRef(account.id))) {
            st.lockedOut = false;
            const running = startRefresh(account, true);
            if (wait) await running;
          }
        }
        return buildSnapshot();
      }
      const prepared = await prepare();
      if (!disposed) {
        // Refresh-all never retries a locked-out account; only refresh(id) or saveKey clears a lockout.
        await Promise.all(prepared
          .filter(({ account, keyConfigured: configured }) => account.enabled === true && configured && !stateFor(account.id).lockedOut)
          .map(({ account }) => (wait ? startRefresh(account) : (startRefresh(account), undefined))));
      }
      return buildSnapshot(prepared);
    },

    async saveKey(accountId, input = {}, options = {}) {
      const wait = options?.wait !== false;
      const account = findAccount(accountId);
      const ref = managementKeyRef(account.id);
      const st = stateFor(account.id);
      if (input?.clear === true) {
        cancelInflight(st);
        await deps.unsetKey(ref);
        st.data = null;
        st.pausedCredentials.clear();
        st.result = null;
        st.lockedOut = false;
        st.lastAttemptAt = undefined;
        return buildSnapshot();
      }
      const value = typeof input?.managementKey === "string" ? input.managementKey.trim() : "";
      if (value !== "") {
        if (/\s/.test(value)) throw new Error("dsh-cliproxyapi: management key must not contain whitespace");
        cancelInflight(st);
        await deps.setKey(ref, value);
        st.result = null;
        st.lockedOut = false;
      }
      if (!disposed && (await keyConfigured(ref))) {
        st.lockedOut = false;
        const running = startRefresh(account, true);
        if (wait) await running;
      }
      return buildSnapshot();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      root.abort();
      for (const st of states.values()) {
        st.inflight?.controller.abort();
        st.inflight = null;
      }
    },
  };
}

//#endregion
