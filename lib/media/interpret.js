// Chat-model parameter questions, validated answers and deletion-only prompts.
import { IMAGE_ASPECTS, VIDEO_ASPECTS, IMAGE_COUNT, VIDEO_SECONDS, VIDEO_RESOLUTIONS, EXTEND_SECONDS } from "./constants.js";
import { intIn } from "./util.js";

// #region Parameter interpretation by the session's chat model
//
// The rule parsers read flags and a few whole words; anything else written in
// plain language ("十秒钟", "竖版的", "第二张当结尾") is handed to the session's
// own chat model, which returns the parameters as JSON. Explicit flags always
// win, every value is validated here, and the prompt may only lose words
// (never be rewritten): `interpretedPrompt()` keeps the original otherwise.

const INTERPRET_FIELDS = {
  image: ["aspect", "count"],
  video: ["seconds", "resolution", "aspect", "frames"],
  edit: [],
  extend: ["seconds"],
};

/**
 * The system and user text asking a chat model to read parameters out of a
 * generation request.
 * @param command - `image` / `video` / `edit` / `extend`.
 * @param text - the prompt as the rule parser left it.
 * @param images - attached image count.
 * @param fixed - field names already set by explicit options (not to be read again).
 */
export function interpretationRequest({ command, text, images = 0, fixed = [] }) {
  const fields = INTERPRET_FIELDS[command] ?? [];
  const lines = {
    seconds: command === "extend" ? "seconds: integer 2-10, how many seconds to ADD to the video" : "seconds: integer 1-15, video length",
    resolution: 'resolution: "480p" or "720p" (high definition / 高清 = "720p")',
    aspect: `aspect: one of ${(command === "image" ? IMAGE_ASPECTS : VIDEO_ASPECTS).join(", ")} (portrait / 竖屏 = "9:16", landscape / 横屏 = "16:9", square = "1:1")`,
    count: "count: integer 1-4, number of images",
    frames:
      'frames: how the attached images are used — "first-frame" (one image starts the video), "reference" (images show people / objects to include, no fixed frame), "first-last" (image 1 starts, image 2 ends the video), "last-frame" (the video ends on the image)',
  };
  const wanted = fields.filter((f) => !fixed.includes(f) && (f !== "frames" || images > 0));
  const system = [
    "You read generation parameters out of a user's request to an image / video generator.",
    "Reply with exactly one JSON object and nothing else.",
    wanted.length > 0 ? `Fields (omit a field the request does not state):\n- ${wanted.map((f) => lines[f]).join("\n- ")}` : "There are no parameter fields to read.",
    '- prompt: the request text with ONLY the words that state these parameters removed. Copy every other character exactly as written: do not translate, rephrase, fix, shorten or add anything. If no such words exist, return the text unchanged.',
  ].join("\n");
  const user = `${images > 0 ? `Attached images: ${images}.\n` : ""}Request:\n${text}`;
  return { system, user, fields: wanted };
}

/** Whether `short` can be made from `long` by deleting characters (order kept). */
function isSubsequence(short, long) {
  let at = 0;
  for (const ch of long) if (at < short.length && ch === short[at]) at += 1;
  return at === short.length;
}

/**
 * The model's prompt when it only removed characters and kept a fair part of
 * the text (at least 30 %, unless it removed 12 characters or fewer),
 * otherwise the original.
 */
export function interpretedPrompt(candidate, original) {
  if (typeof candidate !== "string") return original;
  const prompt = candidate.replace(/\s+/g, " ").trim();
  const base = original.replace(/\s+/g, " ").trim();
  if (prompt === "" || !isSubsequence(prompt, base)) return original;
  if (prompt.length < base.length * 0.3 && base.length - prompt.length > 12) return original;
  return prompt;
}

/**
 * Validate a chat model's JSON answer against the command's fields.
 * @returns `{ values, prompt }`: only valid, wanted fields; the prompt checked by
 *   {@link interpretedPrompt}. Undefined when the answer holds no JSON object.
 */
export function parseInterpretation(answer, { command, text, fields, images = 0 }) {
  const raw = String(answer ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return undefined;
  const values = {};
  const allowed = new Set(fields ?? INTERPRET_FIELDS[command] ?? []);
  const int = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
  if (allowed.has("seconds")) {
    const range = command === "extend" ? EXTEND_SECONDS : VIDEO_SECONDS;
    const seconds = intIn(int(data.seconds), range);
    if (seconds !== undefined) values.seconds = seconds;
  }
  if (allowed.has("resolution") && typeof data.resolution === "string") {
    const resolution = data.resolution.trim().toLowerCase();
    if (VIDEO_RESOLUTIONS.includes(resolution)) values.resolution = resolution;
  }
  if (allowed.has("aspect") && typeof data.aspect === "string") {
    const aspect = data.aspect.replace(/[：\s]/g, (c) => (c === "：" ? ":" : ""));
    if ((command === "image" ? IMAGE_ASPECTS : VIDEO_ASPECTS).includes(aspect)) values.aspect = aspect;
  }
  if (allowed.has("count")) {
    const count = intIn(int(data.count), IMAGE_COUNT);
    if (count !== undefined) values.count = count;
  }
  if (allowed.has("frames") && images > 0) {
    // The parser's words: undefined = default (first frame for one image, references for more).
    const frames = { "first-frame": images === 1 ? "first" : undefined, reference: "reference", "first-last": "first-last", "last-frame": "last" }[data.frames];
    if (frames !== undefined) values.frames = frames;
  }
  return { values, prompt: interpretedPrompt(data.prompt, text) };
}

/** Short labels of interpreted values for the chat row ("10s", "720p", "9:16", "2 images", "reference"). */
export function interpretationLabels(values) {
  return [
    ...(values.seconds !== undefined ? [`${values.seconds}s`] : []),
    ...(values.resolution !== undefined ? [values.resolution] : []),
    ...(values.aspect !== undefined ? [values.aspect] : []),
    ...(values.count !== undefined ? [`×${values.count}`] : []),
    ...(values.frames !== undefined ? [values.frames] : []),
  ];
}

// #endregion
