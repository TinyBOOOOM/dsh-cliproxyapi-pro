// Read-only catalog summaries and unauthenticated route probes.
import { detectMediaKind } from "./classify.js";
import { plain, readBoundedText } from "./util.js";

// #region Read-only diagnostic

const DIAG_FIELDS = [
  "type",
  "object",
  "owned_by",
  "supportedOutputModalities",
  "output_modalities",
  "outputModalities",
  "input_modalities",
  "supportedInputModalities",
  "display_name",
];
const MEDIA_HINT = /(image|imagine|video|sora|veo|dall-?e)/i;
const DIAG_PROBE_ID = "dsh-diagnostic-probe";

function short(value) {
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").slice(0, 12).map((v) => v.slice(0, 40));
  return undefined;
}

function catalogEntries(payload) {
  if (Array.isArray(payload?.models)) return payload.models;
  if (Array.isArray(payload?.data)) return payload.data;
  return undefined;
}

/** Media-looking catalog entries with a fixed set of descriptive fields (no other values). */
export function summarizeCatalogForMedia(payload) {
  const entries = catalogEntries(payload);
  if (entries === undefined) return undefined;
  const media = [];
  for (const item of entries) {
    if (plain(item) === undefined) continue;
    const id = typeof (item.slug ?? item.id) === "string" ? String(item.slug ?? item.id).trim() : "";
    if (id === "") continue;
    const kind = detectMediaKind({
      id,
      catalogType: item.type,
      outputModalities: item.supportedOutputModalities ?? item.output_modalities ?? item.outputModalities,
    });
    if (kind === "chat" && !MEDIA_HINT.test(id)) continue;
    const fields = {};
    for (const field of DIAG_FIELDS) {
      const value = short(item[field]);
      if (value !== undefined) fields[field] = value;
    }
    media.push({ id, kind, keys: Object.keys(item).sort().slice(0, 40), fields });
    if (media.length >= 50) break;
  }
  return { count: entries.length, media };
}

/**
 * Read-only CPA check for media support. Sends only GET requests:
 *  - the enriched (`?client_version=pi`) and plain `/v1/models` catalogs,
 *    with the account key, reporting media-looking entries and their fields;
 *  - two route probes **without** the key, so CPA answers 401 for a route
 *    that exists and its router's plain-text 404 for one that does not,
 *    without selecting a credential or contacting an upstream.
 * Never returns the key, response bodies or upstream URLs.
 */
export async function diagnoseMedia({ fetch: fetchImpl = fetch, rootURL, apiKey, timeoutMs = 8000, signal }) {
  const timed = () => {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  };
  const authHeaders = {
    Accept: "application/json",
    ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const catalog = async (path) => {
    try {
      const response = await fetchImpl(`${rootURL}${path}`, { method: "GET", headers: authHeaders, signal: timed() });
      if (!response.ok) return { ok: false, status: response.status };
      let payload;
      try {
        payload = JSON.parse(await readBoundedText(response));
      } catch {
        return { ok: false, status: response.status, error: "invalid-json" };
      }
      const summary = summarizeCatalogForMedia(payload);
      return summary === undefined
        ? { ok: false, status: response.status, error: "no-model-list" }
        : { ok: true, status: response.status, ...summary };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return { ok: false, error: error?.name === "TimeoutError" ? "timeout" : "network" };
    }
  };
  const probe = async (label, path) => {
    try {
      const response = await fetchImpl(`${rootURL}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: timed(),
      });
      let text = "";
      try {
        text = (await readBoundedText(response)).trim();
      } catch {}
      const verdict =
        response.status === 401 || response.status === 403
          ? "present"
          : response.status === 404 && /^404 page not found$/i.test(text)
          ? "missing"
          : "unknown";
      return { route: label, status: response.status, verdict };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return { route: label, verdict: "unreachable", error: error?.name === "TimeoutError" ? "timeout" : "network" };
    }
  };
  const [enriched, listing, nativeVideo, videoContent] = await Promise.all([
    catalog("/v1/models?client_version=pi"),
    catalog("/v1/models"),
    probe("GET /v1/videos/{id}", `/v1/videos/${DIAG_PROBE_ID}`),
    probe("GET /openai/v1/videos/{id}/content", `/openai/v1/videos/${DIAG_PROBE_ID}/content`),
  ]);
  return {
    endpoint: rootURL,
    checkedAt: new Date().toISOString(),
    catalogs: { enriched, listing },
    routes: [nativeVideo, videoContent],
  };
}

// #endregion
