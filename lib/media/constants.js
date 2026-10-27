// Shared media limits, option domains and identifier patterns.
export const MEDIA_SETTINGS_VERSION = 1;
export const VIDEO_SECONDS = { min: 1, max: 15 };
export const VIDEO_RESOLUTIONS = ["480p", "720p"];
export const BUDGET_SECONDS = { min: 1, max: 3600 };
export const CONFIRM_MODES = ["ask", "auto"];
const MAX_OUTPUT_DIR = 260;
const MAX_LIST = 500;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const MAX_RUNS = 48;
export const VIDEO_MODES = ["text", "first-frame", "reference", "first-last", "last-frame", "edit", "extend"];

export const IMAGE_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "9:20", "20:9"];
export const IMAGE_COUNT = { min: 1, max: 4 };
export const MAX_REFERENCE_IMAGES = 4;

export const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_REQUEST_TIMEOUT_MS = 60_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const MAX_VIDEO_JSON_BYTES = 1024 * 1024;
/** CPA keeps the request → credential binding this long (`defaultVideoAuthBindingTTL`). */
export const VIDEO_JOB_TTL_MS = 3 * 60 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/**
 * Request body limits measured on a live CPA → xAI path (Oct 2026, with
 * requests that fail validation, so nothing was generated):
 * `POST /v1/videos/generations` read 1 MiB but refused 1.2 MiB ("Failed to
 * read request body: length limit exceeded"); `/v1/videos/edits` read 20 MiB.
 */
export const VIDEO_GENERATION_BODY_MAX_BYTES = 1024 * 1024;
export const VIDEO_UPLOAD_BODY_MAX_BYTES = 20 * 1024 * 1024;
/** Largest local video sent inline as a data URI (base64 adds a third). */
export const VIDEO_UPLOAD_MAX_BYTES = 14 * 1024 * 1024;

export const EXTEND_SECONDS = { min: 2, max: 10 };
/** xAI's limits on a source video: edits take at most 8.7 s, extensions 2–15 s. */
export const EDIT_SOURCE_MAX_SECONDS = 8.7;
export const EXTEND_SOURCE_SECONDS = { min: 2, max: 15 };
/** xAI runs edits and extensions only on this model. */
export const VIDEO_EDIT_MODEL = "grok-imagine-video";

export const REFERENCE_MAX_EDGE = 1280;

export { MAX_LIST, MAX_OUTPUT_DIR, ACCOUNT_ID_PATTERN, REQUEST_ID_PATTERN, VIDEO_REQUEST_TIMEOUT_MS, VIDEO_DOWNLOAD_TIMEOUT_MS, MAX_VIDEO_JSON_BYTES };
