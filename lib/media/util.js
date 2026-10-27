// Shared validation, bounded response reading and safe media errors.
export class MediaError extends Error {
  constructor(code, detail) {
    super(code);
    this.name = "MediaError";
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

function plain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function intIn(value, range) {
  return Number.isInteger(value) && value >= range.min && value <= range.max ? value : undefined;
}

const DIAG_MAX_BYTES = 8 * 1024 * 1024;

async function readBoundedText(response, max = DIAG_MAX_BYTES) {
  const declared = Number(response.headers?.get?.("content-length"));
  const limit = `response is larger than ${Math.round(max / 1024 / 1024)} MiB`;
  if (Number.isFinite(declared) && declared > max) throw new Error(limit);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > max) throw new Error(limit);
  return text;
}

const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");

/** A short, URL-free upstream error message (never a body dump). */
export function upstreamMessage(text, status) {
  let message = "";
  try {
    const payload = JSON.parse(text);
    message = payload?.error?.message ?? payload?.message ?? (typeof payload?.error === "string" ? payload.error : "");
  } catch {
    message = text;
  }
  message = String(message ?? "").replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
  return message === "" ? `HTTP ${status}` : `HTTP ${status}: ${message}`;
}

export { plain, intIn, readBoundedText, clip };
