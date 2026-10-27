// CPA candidate probing, bounded catalog parsing and plain-listing enrichment.

import { detectMediaKind } from "../media/index.js";
import { DEFAULT_PROBE_TIMEOUT_MS, LOCAL_CANDIDATES, MAX_CATALOG_BYTES, REASONING_LEVELS } from "./config.js";

export function positiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function firstPositiveInteger(source, fields) {
  for (const field of fields) {
    const value = positiveInteger(source[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function stringArray(value) {
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

export function catalogArray(payload) {
  if (typeof payload !== "object" || payload === null) return undefined;
  if (Array.isArray(payload.models)) return payload.models;
  if (Array.isArray(payload.data)) return payload.data;
  return undefined;
}

export function rawReasoningEfforts(value) {
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

export function parseReasoningLevels(value) {
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
export function parseReasoningWire(value) {
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
      // chat | image | video, before user overrides (see lib/media/classify.js).
      detectedKind: detectMediaKind({ id, catalogType, outputModalities }),
    });
  }
  return [...models.values()];
}

export async function readBoundedJson(response) {
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

/**
 * The plain `/v1/models` listing, parsed, by id. It carries models the
 * enriched catalog omits (the registry `type` that marks image models, and
 * media models only this listing knows), so it gets its own deadline instead
 * of the enriched request's remaining time and one retry: a slow first
 * response must never silently hide every image model until the next
 * five-minute refresh.
 * @returns `{ models, ok }`; `ok` is false when the listing could not be read.
 */
export async function fetchListing(fetchImpl, rootURL, options) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const attempt = async () => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
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
    if (!response.ok) return { models: new Map(), ok: false };
    return { models: new Map(parseCatalog(await readBoundedJson(response)).map((m) => [m.id, m])), ok: true };
  };
  try {
    return await attempt();
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (error instanceof Error && /catalog is larger|not valid JSON|does not contain/.test(error.message)) {
      return { models: new Map(), ok: false };
    }
    try {
      return await attempt();
    } catch (retryError) {
      if (options.signal?.aborted) throw options.signal.reason;
      return { models: new Map(), ok: false };
    }
  }
}

/**
 * Fill catalog gaps from the plain listing: `owned_by` (native protocol),
 * the registry `type` and output modalities (media kind). A media model that
 * only the plain listing carries is added; plain-only chat models are not.
 */
export function mergeListing(models, listing) {
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
    // Start the plain listing together with the enriched catalog; both carry
    // different fields, and the listing alone knows some image models.
    const listingPromise = fetchListing(fetchImpl, rootURL, options);
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
        void listingPromise.catch(() => {});
        failures.push(`${rootURL}: HTTP ${response.status}`);
        continue;
      }
      const models = parseCatalog(await readBoundedJson(response));
      // The enriched catalog omits `owned_by`; the plain listing carries the
      // model family each upstream reports, which decides its native protocol,
      // and the registry type that marks image models.
      const listing = await listingPromise;
      return { rootURL, modelsURL, models: mergeListing(models, listing.models), listingOk: listing.ok };
    } catch (error) {
      void listingPromise.catch(() => {});
      if (options.signal?.aborted) throw options.signal.reason;
      failures.push(`${rootURL}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`dsh-cliproxyapi: no usable CPA service found (${failures.join("; ")})`);
}
