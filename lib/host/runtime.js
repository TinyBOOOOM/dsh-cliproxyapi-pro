// One account runtime: discovery, route synchronization and default-model following.

import { effectiveKind } from "../media/index.js";
import { DEFAULT_API_KEY_ENV, PI_AI_NS, DEFAULT_MODEL_NS } from "./config.js";
import { modelFamily, recommendModels } from "./models.js";
import { nativeProtocol, modelProtocol, applyModelOverride, isChatModel, buildPiAiRoutes, managedRouteKeys } from "./routes.js";
import { discoverCpa } from "./discovery.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Fields this plugin writes; any stale copy is replaced, never merged. */
export const MANAGED_ROUTE_FIELDS = ["displayName", "api", "baseURL", "models", "apiKeyEnv", "headers"];

export function stripManagedFields(route) {
  const out = { ...route };
  for (const field of MANAGED_ROUTE_FIELDS) delete out[field];
  // An empty dict materialized by the schema is not a user choice.
  if (out.compat !== undefined && sameJson(out.compat, { chatTemplateKwargs: {}, chatTemplateArgs: {} })) {
    delete out.compat;
  }
  return out;
}

export async function mutateSettingsSafe(settings, ns, ops) {
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

export function formatModelView(m, selectedSet, config) {
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
    // Whether the last successful discovery could read the plain `/v1/models`
    // listing, which carries models the enriched catalog omits (image models
    // for some servers). A failed read is retried shortly, not in five minutes.
    this.listingOk = true;
    this.listingRetries = 0;
    this.listingRetryTimer = undefined;
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
      listingOk: this.listingOk,
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
    if (this.listingRetryTimer !== undefined) clearTimeout(this.listingRetryTimer);
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

  /**
   * A failed plain listing must not leave image models hidden until the next
   * five-minute refresh. Re-read soon, at most twice per failure streak.
   */
  scheduleListingRetry() {
    if (this.listingOk !== false) {
      this.listingRetries = 0;
      if (this.listingRetryTimer !== undefined) {
        clearTimeout(this.listingRetryTimer);
        this.listingRetryTimer = undefined;
      }
      return;
    }
    if (this.listingRetries >= 2 || this.controller.signal.aborted || this.listingRetryTimer !== undefined) return;
    this.listingRetries += 1;
    const schedule = this.options.setTimeout ?? setTimeout;
    this.listingRetryTimer = schedule(() => {
      this.listingRetryTimer = undefined;
      if (!this.controller.signal.aborted) void this.refresh();
    }, 4000);
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
          this.listingOk = result.listingOk !== false;
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
    this.listingOk = result.listingOk !== false;
    this.scheduleListingRetry();
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
