// HTTP route names, host/origin admission and bounded JSON request handling.


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
  mediaConfirm: "/api/dsh-cliproxyapi/media/confirm",
};

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

export function loopbackAuthority(host) {
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

export function admitRequest(ctx, req, res, expectedMethod) {
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
export function sameAuthorityOrigin(origin, host) {
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
export function admitUpdateRequest(ctx, req, res, method) {
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

export async function readJsonBody(req, maxBytes = 256 * 1024) {
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
