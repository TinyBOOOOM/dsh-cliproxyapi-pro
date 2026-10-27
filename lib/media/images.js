// Image generation, reference requests and bounded result downloads.
import { MAX_REFERENCE_IMAGES } from "./constants.js";
import { MediaError, readBoundedText, upstreamMessage } from "./util.js";

// #region Image generation

const IMAGE_TIMEOUT_MS = 180_000;
const MAX_IMAGE_RESPONSE_BYTES = 96 * 1024 * 1024;
const MAX_IMAGE_DOWNLOAD_BYTES = 32 * 1024 * 1024;
// gpt-image accepts only these sizes; xAI reads `aspect_ratio` instead.
const GPT_IMAGE_SIZES = { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536" };
const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** Media type from magic bytes (PNG, JPEG, WebP, GIF), or undefined. */
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "image/webp";
  if (b.length >= 6 && String.fromCharCode(...b.subarray(0, 4)) === "GIF8") return "image/gif";
  return undefined;
}

async function readBoundedBytes(response, max) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > max) throw new MediaError("image-too-large");
  if (typeof response.body?.getReader !== "function") {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > max) throw new MediaError("image-too-large");
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new MediaError("image-too-large");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** Bytes behind a result `url`: a data URL, or an HTTPS download without credentials. */
async function imageFromUrl(fetchImpl, url, signal) {
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (dataMatch !== null) {
    if (dataMatch[2] === undefined) throw new MediaError("invalid-image");
    const bytes = new Uint8Array(Buffer.from(dataMatch[3], "base64"));
    if (bytes.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) throw new MediaError("image-too-large");
    return bytes;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new MediaError("invalid-image");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new MediaError("invalid-image");
  const response = await fetchImpl(parsed.toString(), { method: "GET", headers: { Accept: "image/*" }, signal });
  if (!response.ok) throw new MediaError("download-failed", `HTTP ${response.status}`);
  return readBoundedBytes(response, MAX_IMAGE_DOWNLOAD_BYTES);
}

/**
 * Generate (no references) or edit (with references) images through CPA's
 * OpenAI-compatible endpoints. Asks for `b64_json`; a result that carries a
 * URL instead is fetched (data URL or HTTPS only, size-bounded, no key).
 * @param references - `[{ mediaType, data: Uint8Array }]`, at most 4.
 * @returns `[{ bytes, mediaType, ext, revisedPrompt? }]`.
 * @throws MediaError `upstream-error` (detail: short message), `invalid-response`,
 *   `no-image`, `invalid-image`, `image-too-large`, `download-failed`, `timeout`.
 */
export async function generateImages({
  fetch: fetchImpl = fetch,
  rootURL,
  apiKey,
  model,
  prompt,
  aspect,
  count = 1,
  references = [],
  signal,
  timeoutMs = IMAGE_TIMEOUT_MS,
}) {
  if (references.length > MAX_REFERENCE_IMAGES) throw new MediaError("too-many-references");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  const edit = references.length > 0;
  const body = { model, prompt, n: count, response_format: "b64_json" };
  if (aspect !== undefined) {
    body.aspect_ratio = aspect;
    if (GPT_IMAGE_SIZES[aspect] !== undefined) body.size = GPT_IMAGE_SIZES[aspect];
  }
  if (edit) {
    body.images = references.map((ref) => ({
      image_url: `data:${ref.mediaType};base64,${Buffer.from(ref.data).toString("base64")}`,
    }));
  }
  let response;
  let text;
  try {
    response = await fetchImpl(`${rootURL}${edit ? "/v1/images/edits" : "/v1/images/generations"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: combined,
    });
    text = await readBoundedText(response, MAX_IMAGE_RESPONSE_BYTES);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  if (!response.ok) throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new MediaError("invalid-response");
  }
  const items = Array.isArray(payload?.data) ? payload.data : [];
  const out = [];
  for (const item of items) {
    let bytes;
    if (typeof item?.b64_json === "string" && item.b64_json !== "") {
      bytes = new Uint8Array(Buffer.from(item.b64_json, "base64"));
      if (bytes.byteLength > MAX_IMAGE_DOWNLOAD_BYTES) throw new MediaError("image-too-large");
    } else if (typeof item?.url === "string" && item.url !== "") {
      try {
        bytes = await imageFromUrl(fetchImpl, item.url, combined);
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (timeout.aborted) throw new MediaError("timeout");
        if (error instanceof MediaError) throw error;
        throw new MediaError("download-failed");
      }
    } else {
      continue;
    }
    const mediaType = sniffImageType(bytes);
    if (mediaType === undefined) throw new MediaError("invalid-image");
    out.push({
      bytes,
      mediaType,
      ext: IMAGE_EXTENSIONS[mediaType],
      ...(typeof item.revised_prompt === "string" && item.revised_prompt.trim() !== ""
        ? { revisedPrompt: item.revised_prompt.trim().slice(0, 500) }
        : {}),
    });
  }
  if (out.length === 0) throw new MediaError("no-image");
  return out;
}

// #endregion
