// CPA video submission, retrieval, state mapping and streamed downloads.
import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import { VIDEO_REQUEST_TIMEOUT_MS, VIDEO_DOWNLOAD_TIMEOUT_MS, MAX_VIDEO_JSON_BYTES, MAX_VIDEO_BYTES, VIDEO_GENERATION_BODY_MAX_BYTES, VIDEO_UPLOAD_BODY_MAX_BYTES, VIDEO_EDIT_MODEL, REQUEST_ID_PATTERN } from "./constants.js";
import { mediaAliasTarget } from "./classify.js";
import { MediaError, readBoundedText, upstreamMessage } from "./util.js";

// #region Video generation

/**
 * Raw bytes each of `count` attached images may take so that a
 * `/v1/videos/generations` body with this prompt stays within
 * {@link VIDEO_GENERATION_BODY_MAX_BYTES} once base64-encoded.
 */
export function videoImageBudget(prompt, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  const fixed = 1024 + Buffer.byteLength(JSON.stringify(String(prompt ?? "")));
  const room = VIDEO_GENERATION_BODY_MAX_BYTES - fixed - 64 * count;
  return Math.max(0, Math.floor(room / count / 4) * 3);
}

/** The model id CPA's native video route accepts: `sora-2*` is an alias of Grok's video model there. */
export function videoRequestModel(modelId) {
  return mediaAliasTarget(modelId) ?? modelId;
}

function authHeaders(apiKey, accept = "application/json") {
  return {
    Accept: accept,
    ...(typeof apiKey === "string" && apiKey !== "" ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function videoJson(fetchImpl, url, init, signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  let text;
  try {
    response = await fetchImpl(url, { ...init, signal: combined });
    text = await readBoundedText(response, MAX_VIDEO_JSON_BYTES);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  return { response, text, payload };
}

/**
 * Submit one video through CPA's native xAI route `POST /v1/videos/generations`
 * (fields `model`, `prompt`, `duration`, `aspect_ratio`, `resolution`,
 * `image.url`; CPA passes them to xAI). An omitted ratio lets xAI choose
 * (16:9, or the first frame's ratio). A submitted video cannot be cancelled.
 * @param image - optional first frame `{ mediaType, data }`.
 * @returns `{ requestId }`.
 * @throws MediaError `upstream-error` (CPA refused; nothing was submitted), `invalid-response`, `network`, `timeout`.
 */
const dataUrl = (image) => `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;

export async function submitVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, model, prompt, seconds, aspect, resolution, image, lastFrame, references, signal }) {
  const body = { model: videoRequestModel(model), prompt, duration: seconds };
  if (aspect !== undefined) body.aspect_ratio = aspect;
  if (resolution !== undefined) body.resolution = resolution;
  if (image !== undefined) body.image = { url: dataUrl(image) };
  if (lastFrame !== undefined) body.last_frame = { url: dataUrl(lastFrame) };
  if (Array.isArray(references) && references.length > 0) body.reference_images = references.map((ref) => ({ url: dataUrl(ref) }));
  return postVideoJob(fetchImpl, `${rootURL}/v1/videos/generations`, apiKey, body, signal, VIDEO_GENERATION_BODY_MAX_BYTES);
}

/**
 * Edit (`POST /v1/videos/edits`) or extend (`POST /v1/videos/extensions`) any
 * MP4: by URL (`sourceUrl` — xAI's own short-lived result link or a public
 * http(s) address; xAI downloads it) or inline (`sourceData`, the file's bytes
 * as a base64 data URI). Extensions take `duration` (2–10 s, the added part
 * only); edits keep the source's length.
 * @returns `{ requestId }`.
 * @throws MediaError `request-too-large`, `route-unsupported`, `upstream-error`, …
 */
export async function submitVideoEdit({ fetch: fetchImpl = fetch, rootURL, apiKey, mode, sourceUrl, sourceData, prompt, seconds, signal }) {
  const url = sourceData !== undefined ? dataUrl({ mediaType: "video/mp4", data: sourceData }) : sourceUrl;
  const body = { model: VIDEO_EDIT_MODEL, prompt, video: { url } };
  if (mode === "extend" && seconds !== undefined) body.duration = seconds;
  return postVideoJob(
    fetchImpl,
    `${rootURL}/v1/videos/${mode === "extend" ? "extensions" : "edits"}`,
    apiKey,
    body,
    signal,
    VIDEO_UPLOAD_BODY_MAX_BYTES,
    sourceData !== undefined ? VIDEO_UPLOAD_TIMEOUT_MS : VIDEO_REQUEST_TIMEOUT_MS
  );
}

const VIDEO_UPLOAD_TIMEOUT_MS = 5 * 60_000;

async function postVideoJob(fetchImpl, url, apiKey, body, signal, maxBodyBytes, timeoutMs = VIDEO_REQUEST_TIMEOUT_MS) {
  const json = JSON.stringify(body);
  const bytes = Buffer.byteLength(json);
  // Refused here rather than upstream: CPA cools the credential down after some upstream errors.
  if (maxBodyBytes !== undefined && bytes > maxBodyBytes) throw new MediaError("request-too-large", String(bytes));
  const { response, text, payload } = await videoJson(
    fetchImpl,
    url,
    { method: "POST", headers: { ...authHeaders(apiKey), "Content-Type": "application/json" }, body: json },
    signal,
    timeoutMs
  );
  // The upstream has no such route (seen for /v1/videos/extensions behind some CPA servers).
  if (response.status === 405) throw new MediaError("route-unsupported", url.slice(url.lastIndexOf("/") + 1));
  if ((response.status === 400 || response.status === 413) && /length limit exceeded|request body too large/i.test(text)) {
    throw new MediaError("request-too-large", String(bytes));
  }
  if (!response.ok) throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  const requestId = String(payload?.request_id ?? payload?.id ?? "").trim();
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new MediaError("invalid-response");
  return { requestId };
}

/** xAI / OpenAI video status words → `queued` / `running` / `done` / `failed`, or undefined. */
export function videoState(status) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "queued":
    case "pending":
      return "queued";
    case "in_progress":
    case "processing":
    case "running":
      return "running";
    case "completed":
    case "done":
    case "succeeded":
    case "success":
      return "done";
    case "failed":
    case "error":
    case "expired":
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      return undefined;
  }
}

function videoFailure(payload) {
  const error = payload?.error;
  const message = typeof error === "string" ? error : typeof error?.message === "string" ? error.message : typeof payload?.code === "string" ? payload.code : "";
  return String(message).replace(/https?:\/\/\S+/g, "[url]").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Ask CPA once about a submitted video (`GET /v1/videos/{request_id}`, the
 * native xAI shape; CPA routes it to the credential that accepted it while
 * its 3-hour binding lasts). A transient HTTP failure is reported as such so
 * the caller can retry. A finished video's own short-lived HTTPS URL comes
 * back as `sourceUrl` for edits / extensions only: the host keeps it in
 * memory and never stores, logs or returns it.
 * @returns `{ state, progress?, error?, seconds?, sourceUrl? }`; `state` is `queued` / `running` / `done` / `failed`.
 * @throws MediaError `upstream-error` (with `status`), `invalid-response`, `network`, `timeout`.
 */
export async function retrieveVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, requestId, signal }) {
  const { response, text, payload } = await videoJson(
    fetchImpl,
    `${rootURL}/v1/videos/${encodeURIComponent(requestId)}`,
    { method: "GET", headers: authHeaders(apiKey) },
    signal,
    VIDEO_REQUEST_TIMEOUT_MS
  );
  if (!response.ok) {
    const error = new MediaError("upstream-error", upstreamMessage(text, response.status));
    error.status = response.status;
    throw error;
  }
  if (payload === undefined || payload === null || typeof payload !== "object") throw new MediaError("invalid-response");
  const failure = videoFailure(payload);
  let state = videoState(payload.status);
  if (state === undefined && typeof payload.video?.url === "string") state = "done";
  if (failure !== "" && state !== "done") state = "failed";
  if (state === undefined) state = "queued";
  const progress = Number(payload.progress);
  const seconds = Number(payload.video?.duration ?? payload.seconds);
  let sourceUrl;
  if (state === "done" && typeof payload.video?.url === "string") {
    try {
      const parsed = new URL(payload.video.url);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) sourceUrl = parsed.toString();
    } catch {}
  }
  return {
    state,
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(Number.isFinite(progress) && progress >= 0 && progress <= 100 ? { progress: Math.round(progress) } : {}),
    ...(state === "failed" ? { error: failure || "the video could not be generated" } : {}),
    ...(Number.isFinite(seconds) && seconds > 0 ? { seconds: Math.round(seconds * 10) / 10 } : {}),
  };
}

/** Container from magic bytes: MP4 / MOV (`ftyp`) or WebM / Matroska (EBML), or undefined. */
export function sniffVideoType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length >= 12 && String.fromCharCode(...b.subarray(4, 8)) === "ftyp") {
    return String.fromCharCode(...b.subarray(8, 10)) === "qt" ? { mediaType: "video/quicktime", ext: "mov" } : { mediaType: "video/mp4", ext: "mp4" };
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mediaType: "video/webm", ext: "webm" };
  return undefined;
}

/**
 * Download a finished video through CPA (`GET /openai/v1/videos/{id}/content`,
 * which fetches xAI's file with the credential's own proxy; the plugin never
 * contacts the upstream host) and stream it into `dir` without replacing a
 * file. At most `maxBytes`; a partial file is removed.
 * @returns the absolute path.
 * @throws MediaError `upstream-error`, `video-too-large`, `invalid-video`, `write-failed`, `network`, `timeout`.
 */
export async function downloadVideo({ fetch: fetchImpl = fetch, rootURL, apiKey, requestId, dir, stem, signal, maxBytes = MAX_VIDEO_BYTES, timeoutMs = VIDEO_DOWNLOAD_TIMEOUT_MS }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
  let response;
  try {
    response = await fetchImpl(`${rootURL}/openai/v1/videos/${encodeURIComponent(requestId)}/content`, {
      method: "GET",
      headers: authHeaders(apiKey, "video/*, application/octet-stream"),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  if (!response.ok) {
    let text = "";
    try {
      text = await readBoundedText(response, 64 * 1024);
    } catch {}
    throw new MediaError("upstream-error", upstreamMessage(text, response.status));
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MediaError("video-too-large");
  mkdirSync(dir, { recursive: true });
  const reader = typeof response.body?.getReader === "function" ? response.body.getReader() : undefined;
  let first;
  let pending = [];
  try {
    if (reader === undefined) {
      first = new Uint8Array(await response.arrayBuffer());
    } else {
      // Read until the container header can be recognized.
      let size = 0;
      while (size < 16) {
        const { done, value } = await reader.read();
        if (done) break;
        pending.push(value);
        size += value.byteLength;
      }
      first = new Uint8Array(Buffer.concat(pending));
      pending = [];
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
  const type = sniffVideoType(first);
  if (type === undefined) {
    await reader?.cancel().catch(() => {});
    throw new MediaError("invalid-video");
  }
  let fd;
  let path;
  for (let attempt = 0; attempt < 100 && fd === undefined; attempt += 1) {
    path = join(dir, attempt === 0 ? `${stem}.${type.ext}` : `${stem}-${attempt + 1}.${type.ext}`);
    try {
      fd = openSync(path, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") {
        await reader?.cancel().catch(() => {});
        throw new MediaError("write-failed", error?.code ?? undefined);
      }
    }
  }
  if (fd === undefined) {
    await reader?.cancel().catch(() => {});
    throw new MediaError("write-failed", "EEXIST");
  }
  let size = 0;
  const write = (chunk) => {
    size += chunk.byteLength;
    if (size > maxBytes) throw new MediaError("video-too-large");
    writeSync(fd, chunk);
  };
  try {
    write(first);
    if (reader !== undefined) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        write(value);
      }
    }
    closeSync(fd);
    fd = undefined;
    return path;
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(path);
    } catch {}
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new MediaError("timeout");
    if (error instanceof MediaError) throw error;
    if (typeof error?.code === "string") throw new MediaError("write-failed", error.code);
    throw new MediaError("network", error instanceof Error ? error.message.slice(0, 200) : undefined);
  }
}

// #endregion
