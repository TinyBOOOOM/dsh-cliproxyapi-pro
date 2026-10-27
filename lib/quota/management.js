// Owns management origin/key refs, bounded HTTP transport, and management API reads.
import { MANAGEMENT_KEY_REF, MAX_QUOTA_RESPONSE_BYTES } from "./constants.js";
import { QuotaError, isObj, text, firstText, numberOrNull } from "./helpers.js";

//#region Management Origin & Key Ref

/** Credential ref for an account's CPA management key. */
export function managementKeyRef(accountId) {
  const id = text(accountId);
  if (id === "" || id === "default") return MANAGEMENT_KEY_REF;
  return `${MANAGEMENT_KEY_REF}_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/** Management API base of an account endpoint: trailing slashes and a trailing `/v1` removed. */
export function managementOrigin(baseURL) {
  let raw = text(baseURL);
  if (raw === "") return undefined;
  raw = raw.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/\/v1$/i, "").replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

//#endregion

//#region HTTP

async function readBounded(response, limit) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new QuotaError("invalid-response");
  const body = response.body;
  if (body !== null && body !== undefined && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        reader.cancel().catch(() => {});
        throw new QuotaError("invalid-response");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(all);
  }
  const raw = typeof response.text === "function" ? await response.text() : "";
  if (Buffer.byteLength(raw, "utf8") > limit) throw new QuotaError("invalid-response");
  return raw;
}

function parseJsonLoose(raw) {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s === "") return null;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Unwraps the occasional `{body|data|result}` wrapper or JSON-string nesting around an upstream payload. */
function unwrapNested(value) {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current === "string") {
      const parsed = parseJsonLoose(current);
      if (parsed === undefined || parsed === null) return current;
      current = parsed;
    }
    if (!isObj(current)) return current;
    if (["groups", "models", "currentTier", "paidTier", "cloudaicompanionProject", "config", "limits", "usage", "rate_limit", "rateLimit", "five_hour", "seven_day", "buckets", "account", "organization", "plan_type"].some((k) => Object.hasOwn(current, k))) return current;
    const nested = current.body ?? current.data ?? current.result;
    if (nested === undefined || nested === null || nested === current) return current;
    current = nested;
  }
  return current;
}

function upstreamErrorCode(status) {
  if (status === 401) return "upstream-unauthorized";
  if (status === 403) return "upstream-forbidden";
  if (status === 404) return "upstream-not-found";
  if (status === 429) return "upstream-rate-limited";
  return "upstream-http";
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < limit && queue.length > 0) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          next();
        });
    }
  };
  return (fn, signal) => new Promise((resolve, reject) => {
    const job = {
      fn: () => {
        if (signal?.aborted) throw new QuotaError("aborted");
        return fn();
      },
      resolve,
      reject,
    };
    queue.push(job);
    next();
  });
}

//#endregion

export function createManagement({ fetchImpl, timeoutMs }) {
  // --- HTTP with per-request timeout, linked to the cycle signal ---
  async function request(url, init, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
    // Settles even if the fetch implementation ignores the signal.
    const aborted = new Promise((_, reject) => {
      const fail = () => reject(new QuotaError(timedOut ? "timeout" : "aborted"));
      if (controller.signal.aborted) fail();
      else controller.signal.addEventListener("abort", fail, { once: true });
    });
    aborted.catch(() => {});
    try {
      const response = await Promise.race([fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" }), aborted]);
      const body = await Promise.race([readBounded(response, MAX_QUOTA_RESPONSE_BYTES), aborted]);
      return { status: response.status, ok: response.ok, body };
    } catch (error) {
      if (timedOut) throw new QuotaError("timeout");
      if (signal.aborted) throw new QuotaError("aborted");
      if (error instanceof QuotaError) throw error;
      throw new QuotaError("network");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  async function management(ctx, path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json", Authorization: `Bearer ${ctx.key}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await request(`${ctx.origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, ctx.signal);
    if (response.status === 401) throw new QuotaError("unauthorized", 401);
    if (response.status === 403) throw new QuotaError("forbidden", 403);
    if (!response.ok) throw new QuotaError("http", response.status);
    const json = parseJsonLoose(response.body);
    if (json === undefined) throw new QuotaError("invalid-response");
    return json;
  }

  /** POST /v0/management/api-call; returns the upstream JSON object or throws an upstream code. */
  async function apiCall(ctx, payload) {
    const response = await management(ctx, "/v0/management/api-call", { method: "POST", body: payload });
    if (!isObj(response)) throw new QuotaError("invalid-response");
    const status = numberOrNull(response.status_code ?? response.statusCode ?? response.status);
    if (status === null) throw new QuotaError("invalid-response");
    if (status < 200 || status >= 300) throw new QuotaError(upstreamErrorCode(status), status);
    const body = unwrapNested(response.body ?? response.data);
    if (!isObj(body)) throw new QuotaError("invalid-response");
    return body;
  }

  async function loadModels(ctx, name, prefix, status) {
    try {
      const payload = await management(ctx, `/v0/management/auth-files/models?name=${encodeURIComponent(name)}`);
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.models) ? payload.models : null;
      if (rows === null) return null;
      const ids = [];
      for (const row of rows) {
        const id = typeof row === "string" ? text(row) : firstText(row?.id, row?.name);
        if (id === "") continue;
        const full = prefix !== "" && !id.toLowerCase().startsWith(`${prefix}/`) ? `${prefix}/${id}` : id;
        if (!ids.includes(full)) ids.push(full);
      }
      // CPA drops inactive credentials from its model registry; an empty list then means "unknown".
      if (ids.length === 0 && status !== "active") return null;
      return ids;
    } catch (error) {
      if (error?.code === "aborted") throw error;
      return null;
    }
  }

  return { management, apiCall, loadModels };
}

export { createLimiter };
