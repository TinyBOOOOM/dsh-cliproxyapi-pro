// Barrel preserving the internal media engine's public surface.

// Internal module: CPA image / video generation support.
//
// Classifies catalog models as chat / image / video, owns the independent
// `media-settings.json` preferences, `media-sessions.json` (per-session picks
// and run records) and `media-jobs.json` (video jobs that outlive a reload),
// runs a read-only diagnostic, and talks to CPA's image and video routes.
// Generation happens only when the host calls it for an explicit user action.
// Keys are passed in per call and never stored or returned.

export { MEDIA_SETTINGS_VERSION, VIDEO_SECONDS, VIDEO_RESOLUTIONS, BUDGET_SECONDS, CONFIRM_MODES, MAX_RUNS, VIDEO_MODES, IMAGE_ASPECTS, IMAGE_COUNT, MAX_REFERENCE_IMAGES, VIDEO_ASPECTS, MAX_VIDEO_BYTES, VIDEO_JOB_TTL_MS, VIDEO_GENERATION_BODY_MAX_BYTES, VIDEO_UPLOAD_BODY_MAX_BYTES, VIDEO_UPLOAD_MAX_BYTES, EXTEND_SECONDS, EDIT_SOURCE_MAX_SECONDS, EXTEND_SOURCE_SECONDS, VIDEO_EDIT_MODEL, REFERENCE_MAX_EDGE } from "./constants.js";
export { MediaError, upstreamMessage } from "./util.js";
export { MEDIA_KINDS, bareModelId, detectMediaKind, mediaAliasTarget, effectiveKind } from "./classify.js";
export { defaultMediaSettings, normalizeMediaSettings, loadMediaSettings, saveMediaSettings, applyMediaPatch, accountKindOverrides, mediaModelEnabled } from "./settings.js";
export { summarizeCatalogForMedia, diagnoseMedia } from "./diagnose.js";
export { mediaOptions, splitMediaRef, matchMediaModel, chooseMediaModel } from "./choice.js";
export { MEDIA_SESSIONS_VERSION, MAX_RECENT, validSessionId, validCommandId, normalizeRun, budgetKey, agentPolicy, applySessionPolicy, chargeSeconds, normalizeMediaSessions, createMediaSessionStore, recentEntry } from "./session-store.js";
export { parseImageCommand, parseVideoCommand, parseVideoEditCommand } from "./commands/parsing.js";
export { sniffImageType, generateImages } from "./images.js";
export { outputDirectory, outputStem, writeOutputFiles } from "./output-files.js";
export { isMp4, mp4Duration } from "./mp4.js";
export { videoImageBudget, videoRequestModel, submitVideo, submitVideoEdit, videoState, retrieveVideo, sniffVideoType, downloadVideo } from "./video.js";
export { interpretationRequest, interpretedPrompt, parseInterpretation, interpretationLabels } from "./interpret.js";
export { MEDIA_JOBS_VERSION, normalizeJob, normalizeMediaJobs, createMediaJobStore } from "./job-store.js";
export { decodePng } from "./codec/png.js";
export { encodeJpeg } from "./codec/jpeg.js";
export { fitRgb, fitReferenceImage } from "./codec/fit.js";
export { GENERATE_MEDIA, GENERATE_MEDIA_TOOL, GENERATE_MEDIA_OUTPUT, parseToolArgs, toolCommandLine, toolRunId, approvalText } from "./agent-tool.js";
