// Static generate_media schema, argument validation, commands and approval text.
import { IMAGE_ASPECTS, VIDEO_ASPECTS, MAX_REFERENCE_IMAGES } from "./constants.js";
import { plain } from "./util.js";
import { validCommandId } from "./session-store.js";

// #region Agent tool (generate_media)
//
// Pure parts of the optional agent tool: its static definition (no model
// lists), argument checks, the command line it runs through the slash-command
// handlers, the run id derived from the tool call id, and the approval text.

export const GENERATE_MEDIA = "generate_media";

const MEDIA_ASPECTS_ALL = [...new Set([...IMAGE_ASPECTS, ...VIDEO_ASPECTS])];

// Responses strict schemas may require every property: null keeps optional and
// inapplicable arguments expressible without inventing a model, source or mode.
const optionalMediaArg = (schema, description) => ({
  oneOf: [schema, { type: "null" }],
  ...(description === undefined ? {} : { description }),
});

/** The tool's model-facing description and parameter schema (raw JSON Schema subset). */
export const GENERATE_MEDIA_TOOL = {
  name: GENERATE_MEDIA,
  description:
    "Generate an image or video with the user's CLIProxyAPI media models, or edit / extend a video; saves the files under the working directory and returns their paths. Pass the user's prompt in their own words and level of detail: never expand it into a longer scene description or add camera, lighting, style, character or environment details they did not ask for. Videos are billed, cannot be cancelled and may need the user's approval; never retry one that was declined or over budget.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["image", "video"] },
      prompt: { type: "string", description: "The user's prompt, verbatim: their own words and level of detail. Do not rewrite, expand, translate or add style/camera/scene details." },
      mode: optionalMediaArg({ type: "string", enum: ["generate", "edit", "extend"] }, "Video only; null = generate."),
      model: optionalMediaArg({ type: "string" }, "Model id or unique part; null = user's pick."),
      images: optionalMediaArg({ type: "array", items: { type: "string" } }, "Image paths, or null. Image: up to 4 to edit/combine. Video: 1 = first frame, 2+ = references."),
      frames: optionalMediaArg({ type: "string", enum: ["first-frame", "reference", "first-last", "last-frame"] }, "Video images only; otherwise null. Pinned first-last/last-frame need grok-imagine-video-1.5."),
      video: optionalMediaArg({ type: "string" }, "Edit/extend source: MP4 path or public URL; null = session's newest video. Other modes: null."),
      aspect: optionalMediaArg({ type: "string", enum: MEDIA_ASPECTS_ALL }, "Image/video generation ratio, or null for default; edit/extend: null."),
      seconds: optionalMediaArg({ type: "integer" }, "Video length 1–15, extend adds 2–10; null = default. Image/edit: null."),
      resolution: optionalMediaArg({ type: "string", enum: ["480p", "720p"] }, "Video generation only; null = default or unused."),
      count: optionalMediaArg({ type: "integer" }, "Images 1–4; null = 1. Video: null."),
    },
    required: ["kind", "prompt"],
  },
};

/** The tool's result value schema (validated by DSH's tool registry). */
export const GENERATE_MEDIA_OUTPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["done", "running"] },
    kind: { type: "string" },
    mode: { type: "string" },
    model: { type: "string" },
    account: { type: "string" },
    run: { type: "string" },
    files: { type: "array", items: { type: "string" } },
    folder: { type: "string" },
    seconds: { type: "integer" },
    resolution: { type: "string" },
    aspect: { type: "string" },
    revisedPrompt: { type: "string" },
    note: { type: "string" },
    commandRow: { type: "boolean" },
    previews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          attachmentId: { type: "string" },
          mediaType: { type: "string" },
          bytes: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          name: { type: "string" },
          originalDimensions: {
            type: "object",
            additionalProperties: false,
            properties: { width: { type: "integer" }, height: { type: "integer" } },
            required: ["width", "height"],
          },
        },
        required: ["attachmentId", "mediaType", "bytes", "width", "height"],
      },
    },
  },
  required: ["status", "kind", "model", "run", "files"],
};

/**
 * Check one `generate_media` call's arguments.
 * @returns the normalized arguments.
 * @throws Error with a model-facing message.
 */
export function parseToolArgs(args) {
  const input = plain(args);
  if (input === undefined) throw new Error("arguments must be an object");
  const known = new Set(Object.keys(GENERATE_MEDIA_TOOL.parameters.properties));
  for (const key of Object.keys(input)) if (!known.has(key)) throw new Error(`unknown argument "${key}"`);
  // Canonical strict-schema calls use null for absent optional fields. Also
  // accept empty strings from older all-fields calls, without changing prompt.
  const a = Object.fromEntries(Object.entries(input).filter(([key, value]) =>
    key === "kind" || key === "prompt" || (value !== null && value !== undefined && !(typeof value === "string" && value.trim() === ""))
  ));
  if (a.kind !== "image" && a.kind !== "video") throw new Error('kind must be "image" or "video"');
  if (typeof a.prompt !== "string" || a.prompt.trim() === "") throw new Error("prompt must be a non-empty string");
  if (a.prompt.length > 4000) throw new Error("prompt is longer than 4000 characters");
  const str = (key) => {
    if (a[key] === undefined) return undefined;
    if (typeof a[key] !== "string" || a[key].trim() === "") throw new Error(`${key} must be a non-empty string`);
    return a[key].trim();
  };
  const int = (key) => {
    if (a[key] === undefined) return undefined;
    if (!Number.isInteger(a[key])) throw new Error(`${key} must be an integer`);
    return a[key];
  };
  const out = { kind: a.kind, prompt: a.prompt.trim() };
  const model = str("model");
  if (model !== undefined) {
    if (/\s/.test(model)) throw new Error("model must not contain spaces");
    out.model = model;
  }
  if (a.images !== undefined) {
    if (!Array.isArray(a.images) || a.images.some((p) => typeof p !== "string" || p.trim() === "")) throw new Error("images must be an array of paths");
    if (a.images.length > 14) throw new Error("at most 14 images");
    if (a.images.length > 0) out.images = a.images.map((p) => p.trim());
  }
  const aspect = str("aspect");
  if (aspect !== undefined) out.aspect = aspect;
  if (a.kind === "image") {
    // Older strict calls supplied these neutral defaults even for images.
    if (a.mode === "generate") delete a.mode;
    if (a.frames === "first-frame") delete a.frames;
    for (const key of ["mode", "frames", "video", "seconds", "resolution"]) if (a[key] !== undefined) throw new Error(`${key} is for videos only`);
    const count = int("count");
    if (count !== undefined && (count < 1 || count > 4)) throw new Error("count must be 1–4 for images");
    if (count !== undefined) out.count = count;
    if (aspect !== undefined && !IMAGE_ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${IMAGE_ASPECTS.join(", ")} for images`);
    if ((out.images?.length ?? 0) > MAX_REFERENCE_IMAGES) throw new Error(`at most ${MAX_REFERENCE_IMAGES} images for an image`);
    return out;
  }
  // One video is already the only supported behavior: legacy count: 1 is a
  // harmless default, but an actual request for multiple videos is rejected.
  if (a.count !== undefined && a.count !== 1) throw new Error("count is for images only; use null for a video (one video per call)");
  const mode = str("mode") ?? "generate";
  if (!["generate", "edit", "extend"].includes(mode)) throw new Error('mode must be "generate", "edit" or "extend"');
  out.mode = mode;
  const seconds = int("seconds");
  if (seconds !== undefined) out.seconds = seconds;
  if (mode === "generate") {
    if (a.video !== undefined) throw new Error("video is for mode edit / extend");
    if (seconds !== undefined && (seconds < 1 || seconds > 15)) throw new Error("seconds must be 1–15 for video generation");
    if (aspect !== undefined && !VIDEO_ASPECTS.includes(aspect)) throw new Error(`aspect must be one of ${VIDEO_ASPECTS.join(", ")} for videos`);
    const resolution = str("resolution");
    if (resolution !== undefined && !["480p", "720p"].includes(resolution)) throw new Error("resolution must be 480p or 720p");
    if (resolution !== undefined) out.resolution = resolution;
    const frames = str("frames");
    if (frames !== undefined) {
      if (!["first-frame", "reference", "first-last", "last-frame"].includes(frames)) throw new Error("frames must be first-frame, reference, first-last or last-frame");
      const count = out.images?.length ?? 0;
      // A legacy all-fields text-video call supplied first-frame with no images.
      // It is still text-to-video, not an implicit image or a guessed reference.
      if (count === 0 && frames !== "first-frame") throw new Error("frames needs images; use null without images");
      if (count > 0) {
        if ((frames === "first-frame" || frames === "last-frame") && count !== 1) throw new Error(`${frames} needs exactly one image`);
        if (frames === "first-last" && count !== 2) throw new Error("first-last needs exactly two images");
        out.frames = frames;
      }
    }
    return out;
  }
  if (a.images?.length === 0) delete a.images;
  if (a.frames === "first-frame") delete a.frames;
  for (const key of ["images", "frames", "aspect", "resolution"]) if (a[key] !== undefined) throw new Error(`${key} is not used by mode ${mode} (the output keeps the source's format)`);
  if (mode === "edit" && seconds !== undefined) throw new Error("an edit keeps the source's length; seconds is for extend");
  if (mode === "extend" && seconds !== undefined && (seconds < 2 || seconds > 10)) throw new Error("seconds must be 2–10 for extend");
  const video = str("video");
  if (video !== undefined) out.video = video;
  return out;
}

/** The slash-command line (after the command name) that runs these arguments, taken literally. */
export function toolCommandLine(t) {
  const parts = [];
  if (t.model !== undefined) parts.push(`-m ${t.model}`);
  if (t.kind === "image") {
    if (t.aspect !== undefined) parts.push(`--aspect ${t.aspect}`);
    if (t.count !== undefined) parts.push(`-n ${t.count}`);
  } else if (t.mode === "generate") {
    if (t.aspect !== undefined) parts.push(`--aspect ${t.aspect}`);
    if (t.seconds !== undefined) parts.push(`-s ${t.seconds}`);
    if (t.resolution !== undefined) parts.push(`-r ${t.resolution}`);
    const flag = { reference: "--ref", "first-last": "--first-last", "last-frame": "--last" }[t.frames];
    if (flag !== undefined) parts.push(flag);
  } else {
    if (t.video !== undefined) {
      if (/^https?:\/\//i.test(t.video)) parts.push(`--url ${t.video.replace(/\s/g, "%20")}`);
      else {
        if (t.video.includes('"')) throw new Error("video path must not contain a double quote");
        parts.push(`--video "${t.video}"`);
      }
    }
    if (t.mode === "extend" && t.seconds !== undefined) parts.push(`-s ${t.seconds}`);
  }
  parts.push("--", t.prompt);
  return parts.join(" ");
}

/** The run id (a chat-row key) for one tool call: the call id with other characters replaced. */
export function toolRunId(callId) {
  const raw = String(callId ?? "").replace(/[^A-Za-z0-9._:-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 119);
  return validCommandId(raw);
}

/**
 * What the approval prompt says about one generation (both languages).
 * @param plan - from the command's gate: kind, mode, option, prompt, seconds, resolution, aspect, references, count, sourceName.
 * @param policy - `agentPolicy()` of the root session (videos show the budget).
 */
export function approvalText(plan, policy) {
  const prompt = plan.prompt.length > 80 ? `${plan.prompt.slice(0, 80)}…` : plan.prompt;
  const model = `${plan.option.modelId} (${plan.option.accountName})`;
  const modelZh = `${plan.option.modelId}（${plan.option.accountName}）`;
  if (plan.kind === "image") {
    const n = plan.count ?? 1;
    return {
      reason: `generate ${n} image(s) with ${plan.option.ref}`,
      en: `${plan.references > 0 ? `Edit ${plan.references} image(s) into` : "Generate"} ${n} image(s) with ${model}: "${prompt}".`,
      zh: `用 ${modelZh}${plan.references > 0 ? `改 ${plan.references} 张图，` : ""}生成 ${n} 张图片：「${prompt}」。`,
    };
  }
  const used = policy.limit === undefined ? `${policy.used} s (no limit)` : `${policy.used} of ${policy.limit} s`;
  const usedZh = policy.limit === undefined ? `${policy.used} 秒（不限）` : `${policy.used} / ${policy.limit} 秒`;
  const shape = [plan.resolution, plan.aspect].filter(Boolean).join(", ");
  const what =
    plan.mode === "edit" ? `Edit the video${plan.sourceName ? ` ${plan.sourceName}` : ""}`
    : plan.mode === "extend" ? `Extend the video${plan.sourceName ? ` ${plan.sourceName}` : ""} by ${plan.seconds} s`
    : `Generate a ${plan.seconds} s video${shape ? ` (${shape})` : ""}`;
  const whatZh =
    plan.mode === "edit" ? `编辑视频${plan.sourceName ? ` ${plan.sourceName}` : ""}`
    : plan.mode === "extend" ? `把视频${plan.sourceName ? ` ${plan.sourceName}` : ""}延长 ${plan.seconds} 秒`
    : `生成 ${plan.seconds} 秒视频${shape ? `（${shape}）` : ""}`;
  const refs = plan.references > 0 ? ` with ${plan.references} attached image(s)` : "";
  const refsZh = plan.references > 0 ? `，附 ${plan.references} 张图` : "";
  return {
    reason: `${plan.mode ?? "generate"} a ${plan.seconds} s video with ${plan.option.ref}`,
    en: `${what} with ${model}${refs}: "${prompt}". It is billed and cannot be cancelled once submitted. Agent videos in this session so far: ${used}.`,
    zh: `用 ${modelZh}${whatZh}${refsZh}：「${prompt}」。提交后无法取消，会照常计费。本会话 agent 已用视频 ${usedZh}。`,
  };
}

// #endregion
