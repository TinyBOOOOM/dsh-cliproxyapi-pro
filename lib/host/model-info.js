// Optional online model facts from public catalogs: models.dev (lines, release
// dates, status, limits, prices) and OpenRouter (capability index, end dates).
//
// Download only: plain GETs of public JSON, no key, account, address or model
// list is ever sent. A compact index is cached in `model-info.json` next to the
// account state and refreshed at most daily; without it recommendations fall
// back to the catalog's own facts. Switched by the global `onlineModelInfo`.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { matchKeys } from "./model-names.js";

export const MODEL_INFO_SOURCES = {
  modelsDev: { url: "https://models.dev/api.json", maxBytes: 32 * 1024 * 1024 },
  openRouter: { url: "https://openrouter.ai/api/v1/models", maxBytes: 16 * 1024 * 1024 },
};
export const MODEL_INFO_TTL_MS = 24 * 60 * 60 * 1000;
export const MODEL_INFO_RETRY_MS = 60 * 60 * 1000;
export const MODEL_INFO_TIMEOUT_MS = 30_000;
export const MODEL_INFO_CACHE_VERSION = 1;
const MAX_ENTRIES = 20_000;

const text = (value, max = 80) => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : undefined);
const count = (value) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined);
const amount = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
const day = (value) => (typeof value === "string" && /^\d{4}-\d{2}(-\d{2})?/.test(value) ? value.slice(0, 10) : undefined);

function compact(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
}

/**
 * models.dev `api.json` → `[{ id, rank, family, released, status, context, output, costOutput }]`.
 * `rank` 0 = the model's canonical provider, 1 = another first-party
 * provider, 2 = a reseller; the best rank wins a duplicate id.
 */
export function parseModelsDev(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("models.dev: not an object");
  const providers = Object.entries(payload).filter(([, p]) => typeof p?.models === "object" && p.models !== null);
  const firstParty = new Set();
  for (const [, provider] of providers) {
    for (const model of Object.values(provider.models)) {
      const canonical = text(model?.canonical_model_id, 200);
      if (canonical?.includes("/")) firstParty.add(canonical.split("/")[0]);
    }
  }
  const out = [];
  for (const [providerId, provider] of providers) {
    for (const [id, model] of Object.entries(provider.models)) {
      if (typeof model !== "object" || model === null || out.length >= MAX_ENTRIES) continue;
      const canonical = text(model.canonical_model_id, 200);
      out.push(compact({
        id: text(model.id, 200) ?? id,
        rank: canonical?.startsWith(`${providerId}/`) ? 0 : firstParty.has(providerId) ? 1 : 2,
        family: text(model.family),
        released: day(model.release_date),
        status: text(model.status, 20),
        context: count(model.limit?.context),
        output: count(model.limit?.output),
        costOutput: amount(model.cost?.output),
      }));
    }
  }
  if (out.length === 0) throw new Error("models.dev: no models");
  // Resellers repeat first-party models; keep one entry per spelling (best rank first).
  const best = new Map();
  for (const entry of out) {
    const key = matchKeys(entry.id)?.exact ?? `id:${entry.id}`;
    const held = best.get(key);
    if (held === undefined || entry.rank < held.rank) best.set(key, entry);
  }
  return [...best.values()];
}

/** OpenRouter `/api/v1/models` → `[{ id, rank, released, expires, context, intelligence }]`. */
export function parseOpenRouter(payload) {
  if (!Array.isArray(payload?.data)) throw new Error("openrouter: no data array");
  const out = [];
  for (const model of payload.data) {
    const id = text(model?.id, 200);
    // `:batch`, `:free`... are billing variants of the same model.
    if (id === undefined || id.includes(":") || out.length >= MAX_ENTRIES) continue;
    const created = count(model.created);
    out.push(compact({
      id,
      rank: 0,
      released: created === undefined ? undefined : new Date(created * 1000).toISOString().slice(0, 10),
      expires: day(model.expiration_date),
      context: count(model.context_length),
      intelligence: amount(model.benchmarks?.artificial_analysis?.intelligence_index),
    }));
  }
  if (out.length === 0) throw new Error("openrouter: no models");
  return out;
}

/** Exact and loose lookup maps over one source's entries. */
export function buildIndex(entries = []) {
  const exact = new Map();
  const loose = new Map();
  for (const entry of entries) {
    const keys = matchKeys(entry.id);
    if (keys === undefined) continue;
    const rank = Number.isInteger(entry.rank) ? entry.rank : 2;
    const held = exact.get(keys.exact);
    if (held === undefined || rank < held.rank) exact.set(keys.exact, { entry, rank });
    // A loose key prefers the plain model over its variants, then the better source rank.
    const score = (keys.hasVariant ? 10 : 0) + rank;
    const looseHeld = loose.get(keys.loose);
    if (looseHeld === undefined || score < looseHeld.score) loose.set(keys.loose, { entry, score });
  }
  return { exact, loose };
}

function find(index, texts) {
  const parsed = texts.map((value) => matchKeys(value)).filter(Boolean);
  for (const keys of parsed) {
    const hit = index.exact.get(keys.exact);
    if (hit !== undefined) return { entry: hit.entry, exact: true };
  }
  for (const keys of parsed) {
    const hit = index.loose.get(keys.loose);
    if (hit !== undefined) return { entry: hit.entry, exact: false };
  }
  return undefined;
}

/**
 * Facts about one catalog model from both sources, or undefined.
 * `exact` is true when the id matched without dropping variant words, the
 * only case in which limits may be used for the model itself.
 */
export function lookupModel(indexes, model) {
  const texts = [model.id, ...(typeof model.name === "string" ? [model.name] : [])];
  const md = indexes.modelsDev === undefined ? undefined : find(indexes.modelsDev, texts);
  const or = indexes.openRouter === undefined ? undefined : find(indexes.openRouter, texts);
  if (md === undefined && or === undefined) return undefined;
  const a = md?.entry ?? {};
  const b = or?.entry ?? {};
  return compact({
    family: a.family,
    released: a.released ?? b.released,
    status: a.status,
    expires: b.expires,
    context: a.context ?? b.context,
    output: a.output,
    costOutput: a.costOutput,
    intelligence: b.intelligence,
    exact: md !== undefined ? md.exact : or.exact,
  });
}

/** Upper bound for an output limit taken from online info (channels often cap lower). */
export const ONLINE_MAX_TOKENS_CAP = 128_000;

/**
 * Fill limits the CPA catalog left out from an exact online match. Catalog
 * values always win; the filled fields are listed in `onlineLimits`.
 */
export function withOnlineLimits(model, info) {
  if (info?.exact !== true) return model;
  const filled = [];
  const next = { ...model };
  if (next.contextWindow === undefined && info.context !== undefined) {
    next.contextWindow = Math.min(info.context, 10_000_000);
    filled.push("contextWindow");
  }
  if (next.maxTokens === undefined && info.output !== undefined) {
    next.maxTokens = Math.min(info.output, ONLINE_MAX_TOKENS_CAP, next.contextWindow ?? Infinity);
    filled.push("maxTokens");
  }
  return filled.length === 0 ? model : { ...next, onlineLimits: filled };
}

export async function fetchSource(fetchImpl, source, options = {}) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? MODEL_INFO_TIMEOUT_MS);
  const response = await fetchImpl(source.url, {
    method: "GET",
    headers: { Accept: "application/json", ...(options.etag ? { "If-None-Match": options.etag } : {}) },
    signal: options.signal === undefined ? signal : AbortSignal.any([options.signal, signal]),
  });
  if (response.status === 304) return { notModified: true };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > source.maxBytes) throw new Error("response too large");
  const body = await response.text();
  if (Buffer.byteLength(body) > source.maxBytes) throw new Error("response too large");
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("not valid JSON");
  }
  return { json, etag: text(response.headers?.get?.("etag"), 200) };
}

export function loadModelInfoCache(path) {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw?.version !== MODEL_INFO_CACHE_VERSION || typeof raw.sources !== "object" || raw.sources === null) return { sources: {} };
    const sources = {};
    for (const name of Object.keys(MODEL_INFO_SOURCES)) {
      const s = raw.sources[name];
      if (typeof s !== "object" || s === null) continue;
      sources[name] = {
        ...(Number.isFinite(s.fetchedAt) ? { fetchedAt: s.fetchedAt } : {}),
        ...(Number.isFinite(s.attemptedAt) ? { attemptedAt: s.attemptedAt } : {}),
        ...(typeof s.etag === "string" ? { etag: s.etag } : {}),
        ...(typeof s.error === "string" ? { error: s.error.slice(0, 200) } : {}),
        models: Array.isArray(s.models) ? s.models.filter((m) => typeof m?.id === "string").slice(0, MAX_ENTRIES) : [],
      };
    }
    return { sources };
  } catch {
    return { sources: {} };
  }
}

export function saveModelInfoCache(path, cache) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: MODEL_INFO_CACHE_VERSION, sources: cache.sources }), "utf8");
    renameSync(tmp, path);
  } catch {}
}

const PARSERS = { modelsDev: parseModelsDev, openRouter: parseOpenRouter };

/**
 * The online model-info service of one activation.
 * @param options.cachePath - `model-info.json`.
 * @param options.enabled - `() => boolean`, the global `onlineModelInfo`.
 * @param options.fetch / options.now - injectable for tests.
 * @param options.onChange - called after new data arrived.
 */
export function createModelInfo(options) {
  // Resolved per request so a proxy plugin's patched global fetch applies.
  const fetchImpl = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  let cache = loadModelInfoCache(options.cachePath);
  let indexes = {};
  const rebuild = () => {
    indexes = Object.fromEntries(
      Object.entries(cache.sources).filter(([, s]) => s.models.length > 0).map(([name, s]) => [name, buildIndex(s.models)])
    );
  };
  rebuild();
  let running;
  let lookups = new WeakMap();

  const enabled = () => {
    try {
      return options.enabled?.() !== false;
    } catch {
      return true;
    }
  };

  const due = (source, force) => {
    if (force) return true;
    const t = now();
    if (source?.fetchedAt !== undefined && t - source.fetchedAt < MODEL_INFO_TTL_MS) return false;
    return source?.attemptedAt === undefined || t - source.attemptedAt >= MODEL_INFO_RETRY_MS;
  };

  const runRefresh = async (force) => {
    let changed = false;
    for (const [name, source] of Object.entries(MODEL_INFO_SOURCES)) {
      const previous = cache.sources[name];
      if (!due(previous, force) || controller.signal.aborted) continue;
      const attemptedAt = now();
      try {
        const result = await fetchSource(fetchImpl, source, { etag: previous?.models.length ? previous.etag : undefined, signal: controller.signal });
        if (result.notModified) {
          const { error: _stale, ...kept } = previous;
          cache.sources[name] = { ...kept, fetchedAt: attemptedAt, attemptedAt };
        } else {
          cache.sources[name] = {
            fetchedAt: attemptedAt,
            attemptedAt,
            ...(result.etag === undefined ? {} : { etag: result.etag }),
            models: PARSERS[name](result.json),
          };
          changed = true;
        }
      } catch (error) {
        if (controller.signal.aborted) return changed;
        const message = error instanceof Error ? error.message : String(error);
        cache.sources[name] = { ...(previous ?? { models: [] }), attemptedAt, error: message.slice(0, 200) };
        options.logger?.warn?.(`dsh-cliproxyapi: online model info from ${source.url} unavailable (${message}); recommendations use the catalog`);
      }
      saveModelInfoCache(options.cachePath, cache);
    }
    if (changed) {
      rebuild();
      lookups = new WeakMap();
    }
    return changed;
  };

  const service = {
    /** Fetch the sources that are due (all with `force`); no-op while switched off. */
    refresh({ force = false } = {}) {
      if (!enabled() || controller.signal.aborted) return Promise.resolve(false);
      if (running !== undefined) return running;
      running = runRefresh(force)
        .then((changed) => {
          if (changed) options.onChange?.();
          return changed;
        })
        .finally(() => {
          running = undefined;
        });
      return running;
    },

    /** Resolve once some data is available, a first download finished, or after `timeoutMs`. */
    async ready(timeoutMs = 4000) {
      if (!enabled() || Object.keys(indexes).length > 0) return;
      const pending = running ?? service.refresh();
      let timer;
      await Promise.race([pending.catch(() => {}), new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); })]);
      clearTimeout(timer);
    },

    /** Online facts for one model (memoized per model object), or undefined while switched off. */
    lookup(model) {
      if (!enabled() || model === null || typeof model !== "object") return undefined;
      if (lookups.has(model)) return lookups.get(model);
      const info = lookupModel(indexes, model);
      lookups.set(model, info);
      return info;
    },

    status() {
      const on = enabled();
      const sources = {};
      for (const name of Object.keys(MODEL_INFO_SOURCES)) {
        const s = cache.sources[name];
        sources[name] = {
          models: s?.models.length ?? 0,
          ...(s?.fetchedAt === undefined ? {} : { fetchedAt: new Date(s.fetchedAt).toISOString() }),
          // A successful download replaces the record, so a kept error is the latest attempt's.
          ...(s?.error === undefined ? {} : { error: s.error }),
        };
      }
      const anyData = Object.values(sources).some((s) => s.models > 0);
      const anyError = Object.values(sources).some((s) => s.error !== undefined);
      return {
        enabled: on,
        state: !on ? "off" : running !== undefined ? "loading" : anyError && !anyData ? "error" : anyData ? (anyError ? "partial" : "ready") : "idle",
        sources,
      };
    },

    dispose() {
      controller.abort(new Error("dsh-cliproxyapi disposed"));
    },
  };
  return service;
}
