// Natural option extraction and image, video and edit command parsing.
import { MediaError, intIn } from "../util.js";
import { IMAGE_ASPECTS, IMAGE_COUNT, VIDEO_ASPECTS, VIDEO_SECONDS, VIDEO_RESOLUTIONS, EXTEND_SECONDS } from "../constants.js";
import { validCommandId } from "../session-store.js";

// Plain-language options at the start or end of a prompt, written as their
// own words ("10 秒 480p 竖屏 …", "… 16:9 2张"): a token counts only when a
// space, comma or the end follows it, so "3 秒后爆炸" stays prompt text.
const WORD_END = "(?=[\\s,，、;；]|$)";
const NATURAL_TOKENS = [
  { key: "seconds", kinds: ["video"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  // "edit" / "extend": words xAI's edit and extension routes cannot use (the
  // output keeps the source's resolution and ratio; an edit keeps its length).
  { key: "seconds", kinds: ["edit"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  { key: "resolution", kinds: ["video", "edit", "extend"], re: new RegExp(`^(480|720|1080)\\s*p${WORD_END}`, "i"), value: (m) => `${m[1]}p` },
  { key: "count", kinds: ["image"], re: new RegExp(`^(\\d{1,2})\\s*(?:张|幅|images?|pics?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(\\d{1,2})\\s*[:：]\\s*(\\d{1,2})${WORD_END}`), value: (m) => `${m[1]}:${m[2]}` },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:竖屏|竖版|portrait)${WORD_END}`, "i"), value: () => "9:16" },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:横屏|横版|landscape)${WORD_END}`, "i"), value: () => "16:9" },
  { key: "aspect", kinds: ["image", "video", "edit", "extend"], re: new RegExp(`^(?:方形|正方形|square)${WORD_END}`, "i"), value: () => "1:1" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:参考图|参考图模式|references?)${WORD_END}`, "i"), value: () => "reference" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:首尾帧|首帧尾帧|first-last)${WORD_END}`, "i"), value: () => "first-last" },
  { key: "frames", kinds: ["video"], re: new RegExp(`^(?:尾帧|last-frame)${WORD_END}`, "i"), value: () => "last" },
  { key: "seconds", kinds: ["extend"], re: new RegExp(`^(\\d{1,3})\\s*(?:秒钟?|s|secs?|seconds?)${WORD_END}`, "i"), value: (m) => Number(m[1]) },
];
const SEPARATORS = /^[\s,，、;；]+/;

/**
 * Take plain-language options from the start and the end of `text`.
 * Explicit flags already in `out` win; a recognized token is removed either way.
 * @returns the remaining prompt; values land in `out` (validated by the caller).
 */
function takeNaturalOptions(text, kind, out) {
  const tokens = NATURAL_TOKENS.filter((t) => t.kinds.includes(kind));
  const take = (match, token) => {
    if (out[token.key] === undefined) out[token.key] = token.value(match);
  };
  let rest = text;
  for (let guard = 0; guard < 8; guard += 1) {
    const hit = tokens.map((token) => [token, token.re.exec(rest)]).find(([, m]) => m !== null);
    if (hit === undefined) break;
    take(hit[1], hit[0]);
    rest = rest.slice(hit[1][0].length).replace(SEPARATORS, "");
  }
  // The end: peel whole words off the tail while they are options.
  for (let guard = 0; guard < 8; guard += 1) {
    const words = rest.split(/([\s,，、;；]+)/);
    let matched = false;
    for (let n = Math.min(3, words.length); n >= 1 && !matched; n -= 1) {
      const tail = words.slice(-(2 * n - 1)).join("");
      for (const token of tokens) {
        const m = token.re.exec(tail);
        if (m !== null && m[0].length === tail.length) {
          take(m, token);
          rest = words.slice(0, words.length - (2 * n - 1)).join("").replace(/[\s,，、;；]+$/, "");
          matched = true;
          break;
        }
      }
    }
    if (!matched) break;
  }
  return rest.trim();
}

/**
 * Parse `/cpa-image` input: leading options, then the prompt verbatim.
 * Options: `-m|--model <id>`, `--aspect <ratio>`, `-n|--count <1-4>`; `--`
 * ends options.
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-aspect` / `invalid-count`.
 */
export function parseImageCommand(rawInput, { literal = false } = {}) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const match = rest.match(/^(-m|--model|--aspect|-n|--count)(?:=|\s+)(\S+)(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, value] = match;
    if (flag === "-m" || flag === "--model") out.model = value;
    else if (flag === "--aspect") {
      if (!IMAGE_ASPECTS.includes(value)) throw new MediaError("invalid-aspect", value);
      out.aspect = value;
    } else {
      const count = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(count, IMAGE_COUNT) === undefined) throw new MediaError("invalid-count", value);
      out.count = count;
    }
    rest = rest.slice(whole.length).trim();
  }
  // `literal` (agent tool calls): the prompt is taken as written.
  const natural = {};
  if (!literal) rest = takeNaturalOptions(rest, "image", natural);
  if (out.aspect === undefined && natural.aspect !== undefined) {
    if (!IMAGE_ASPECTS.includes(natural.aspect)) throw new MediaError("invalid-aspect", natural.aspect);
    out.aspect = natural.aspect;
  }
  if (out.count === undefined && natural.count !== undefined) {
    if (intIn(natural.count, IMAGE_COUNT) === undefined) throw new MediaError("invalid-count", String(natural.count));
    out.count = natural.count;
  }
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

/**
 * Parse `/cpa-video` input: leading options, then the prompt verbatim.
 * Options: `-m|--model <id>`, `--aspect <ratio>`, `-s|--seconds <1-15>`,
 * `-r|--resolution <480p|720p>`; `--` ends options.
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-aspect` /
 *   `invalid-video-seconds` / `invalid-video-resolution`.
 */
export function parseVideoCommand(rawInput, { literal = false } = {}) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const toggle = rest.match(/^(--ref|--first-last|--last)(?:\s+|$)/);
    if (toggle !== null) {
      out.frames = { "--ref": "reference", "--first-last": "first-last", "--last": "last" }[toggle[1]];
      rest = rest.slice(toggle[0].length).trim();
      continue;
    }
    const match = rest.match(/^(-m|--model|--aspect|-s|--seconds|-r|--resolution)(?:=|\s+)(\S+)(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, value] = match;
    if (flag === "-m" || flag === "--model") out.model = value;
    else if (flag === "--aspect") {
      if (!VIDEO_ASPECTS.includes(value)) throw new MediaError("invalid-aspect", value);
      out.aspect = value;
    } else if (flag === "-s" || flag === "--seconds") {
      const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(seconds, VIDEO_SECONDS) === undefined) throw new MediaError("invalid-video-seconds", value);
      out.seconds = seconds;
    } else {
      const resolution = value.toLowerCase();
      if (!VIDEO_RESOLUTIONS.includes(resolution)) throw new MediaError("invalid-video-resolution", value);
      out.resolution = resolution;
    }
    rest = rest.slice(whole.length).trim();
  }
  const natural = {};
  if (!literal) rest = takeNaturalOptions(rest, "video", natural);
  if (out.seconds === undefined && natural.seconds !== undefined) {
    if (intIn(natural.seconds, VIDEO_SECONDS) === undefined) throw new MediaError("invalid-video-seconds", String(natural.seconds));
    out.seconds = natural.seconds;
  }
  if (out.resolution === undefined && natural.resolution !== undefined) {
    if (!VIDEO_RESOLUTIONS.includes(natural.resolution)) throw new MediaError("invalid-video-resolution", natural.resolution);
    out.resolution = natural.resolution;
  }
  if (out.aspect === undefined && natural.aspect !== undefined) {
    if (!VIDEO_ASPECTS.includes(natural.aspect)) throw new MediaError("invalid-aspect", natural.aspect);
    out.aspect = natural.aspect;
  }
  if (out.frames === undefined && natural.frames !== undefined) out.frames = natural.frames;
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

/**
 * Parse `/cpa-video-edit` and `/cpa-video-extend` input. One source at most:
 * `--from <command id>` (a video this plugin made in the session),
 * `--video <path>` (a local MP4; quote a path with spaces), `--url <http(s) URL>`
 * (a public video xAI downloads itself) — or an attached MP4, or by default the
 * session's newest video. `-m|--model <id>` picks the account for a local or
 * URL source; extensions take `-s|--seconds <2-10>` (also as a plain word).
 * @throws MediaError `missing-prompt` / `invalid-option` / `invalid-extend-seconds` /
 *   `invalid-video-url` / `one-video-source`.
 */
export function parseVideoEditCommand(rawInput, mode, { literal = false } = {}) {
  let rest = String(rawInput ?? "").trim();
  const out = {};
  for (;;) {
    if (rest.startsWith("-- ") || rest === "--") {
      rest = rest.slice(2).trim();
      break;
    }
    const match = rest.match(/^(--from|--video|--url|-m|--model|-s|--seconds)(?:=|\s+)(?:"([^"]+)"|(\S+))(?:\s+|$)/);
    if (match === null) {
      if (/^--?[A-Za-z]/.test(rest)) throw new MediaError("invalid-option", rest.split(/\s/, 1)[0]);
      break;
    }
    const [whole, flag, quoted, bare] = match;
    const value = quoted ?? bare;
    if (flag === "--from" || flag === "--video" || flag === "--url") {
      if (out.from !== undefined || out.video !== undefined || out.url !== undefined) throw new MediaError("one-video-source");
    }
    if (flag === "--from") {
      if (validCommandId(value) === undefined) throw new MediaError("invalid-option", `--from ${value}`);
      out.from = value;
    } else if (flag === "--video") {
      out.video = value;
    } else if (flag === "--url") {
      let url;
      try {
        url = new URL(value);
      } catch {
        throw new MediaError("invalid-video-url");
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") throw new MediaError("invalid-video-url");
      out.url = url.href;
    } else if (flag === "-m" || flag === "--model") {
      out.model = value;
    } else {
      if (mode !== "extend") throw new MediaError("invalid-option", flag);
      const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
      if (intIn(seconds, EXTEND_SECONDS) === undefined) throw new MediaError("invalid-extend-seconds", value);
      out.seconds = seconds;
    }
    rest = rest.slice(whole.length).trim();
  }
  // A video path written straight into the prompt (with or without quotes or
  // DSH's `@` file mention) is the source, as if passed with --video.
  const named = () => out.from !== undefined || out.video !== undefined || out.url !== undefined;
  const takePath = (re) => {
    if (named()) return;
    const m = re.exec(rest);
    if (m === null) return;
    out.video = m[1] ?? m[2] ?? m[3];
    rest = (rest.slice(0, m.index) + rest.slice(m.index + m[0].length)).replace(SEPARATORS, "").replace(/[\s,，、;；]+$/, "");
  };
  const natural = {};
  const kind = mode === "extend" ? "extend" : "edit";
  if (!literal) {
    takePath(VIDEO_PATH_HEAD);
    rest = takeNaturalOptions(rest, kind, natural);
    takePath(VIDEO_PATH_HEAD);
    takePath(VIDEO_PATH_TAIL);
    rest = takeNaturalOptions(rest, kind, natural);
  }
  if (mode === "extend" && out.seconds === undefined && natural.seconds !== undefined) {
    if (intIn(natural.seconds, EXTEND_SECONDS) === undefined) throw new MediaError("invalid-extend-seconds", String(natural.seconds));
    out.seconds = natural.seconds;
  }
  // Words the edit / extension routes cannot use are taken out of the prompt and reported.
  const ignored = [
    ...(mode === "edit" && natural.seconds !== undefined ? [`${natural.seconds}s`] : []),
    ...(natural.resolution !== undefined ? [natural.resolution] : []),
    ...(natural.aspect !== undefined ? [natural.aspect] : []),
  ];
  if (ignored.length > 0) out.ignored = ignored;
  if (rest === "") throw new MediaError("missing-prompt");
  return { ...out, prompt: rest };
}

const VIDEO_EXT = "(?:mp4|m4v|mov)";
// Quoted path; unquoted absolute path (may hold spaces, up to the first `.mp4`
// followed by a space); or one unquoted word ending in a video extension.
const VIDEO_PATH_HEAD = new RegExp(
  `^@?(?:"([^"]+\\.${VIDEO_EXT})"|((?:[A-Za-z]:[\\\\/]|\\\\\\\\|/)[^\\n]*?\\.${VIDEO_EXT})|([^\\s"]+\\.${VIDEO_EXT}))(?=[\\s,，、;；]|$)`,
  "i"
);
const VIDEO_PATH_TAIL = new RegExp(
  `(?:^|[\\s,，、;；])@?(?:"([^"]+\\.${VIDEO_EXT})"|((?:[A-Za-z]:[\\\\/]|\\\\\\\\)[^\\n"]*?\\.${VIDEO_EXT})|([^\\s"]+\\.${VIDEO_EXT}))$`,
  "i"
);
