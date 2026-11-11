// Model id tokenization shared by recommendations and online model-info matching.
//
// An id such as `devin/claude-opus-4-6-thinking` reads as: an optional vendor
// prefix (`devin/`), product-line words (`claude`, `opus`), a version run
// (`4-6`) and variant words (`thinking`). The words are vocabulary, never model
// ids, so no catalog id is hard-coded here.

/** Words that select a variant of a model, not a different product line. */
export const VARIANT_WORDS = new Set([
  "thinking", "reasoning", "non", "nonreasoning", "fast", "slow", "preview", "latest", "exp",
  "experimental", "high", "medium", "low", "minimal", "batch", "highspeed", "free", "beta", "alpha",
  "online", "1m", "long", "context",
]);

/** Words that carry no identity (packaging words and vendor names in opaque ids). */
export const GENERIC_WORDS = new Set([
  "model", "models", "private", "chat", "the", "google", "anthropic", "openai", "xai", "meta",
]);

/** Words that mark a lighter tier; used only when no capability data is available. */
export const LIGHT_WORDS = new Set(["mini", "nano", "lite", "flash", "haiku", "small", "tiny", "air", "lightning"]);

/** Lowercase id without vendor prefix (`devin/`) or OpenRouter variant suffix (`:batch`). */
export function bareId(id) {
  const lower = String(id ?? "").trim().toLowerCase();
  const slash = lower.lastIndexOf("/");
  return (slash >= 0 ? lower.slice(slash + 1) : lower).replace(/:.*$/, "");
}

/** Whether an id carries a vendor prefix such as `devin/`. */
export function isPrefixed(id) {
  return String(id ?? "").includes("/");
}

function tokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Parse one id or display name.
 * @returns `{ words, variants, extras, version }`: line words in order,
 *   variant words, other digit-bearing tokens (`120b`) and the version as
 *   numbers (dates such as `20250514` or `0309` end it).
 */
export function parseName(text) {
  const words = [];
  const variants = [];
  const extras = [];
  let version;
  let inRun = false;
  for (const token of tokens(text)) {
    if (/^\d+$/.test(token)) {
      if (version === undefined) {
        version = [];
        inRun = true;
      }
      if (inRun) {
        if (token.length >= 4) inRun = false;
        else version.push(Number(token));
      }
      continue;
    }
    inRun = false;
    if (VARIANT_WORDS.has(token)) {
      variants.push(token);
      continue;
    }
    const alnum = token.match(/^([a-z]+)(\d+)$/);
    if (alnum !== null) {
      // `k3`, `v4`, `o3`: the letters name the line, the digits start the version.
      if (!GENERIC_WORDS.has(alnum[1])) words.push(alnum[1]);
      if (version === undefined) {
        version = [Number(alnum[2])];
        inRun = true;
      }
      continue;
    }
    if (/\d/.test(token)) {
      extras.push(token);
      continue;
    }
    if (!GENERIC_WORDS.has(token)) words.push(token);
  }
  return { words, variants, extras, version: trimVersion(version) };
}

function trimVersion(version) {
  if (version === undefined || version.length === 0) return undefined;
  const out = [...version];
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  return out;
}

/**
 * The product line of a model: its line words from the id, or from the
 * display name when the id is opaque (`model_private_12`).
 * @returns `{ key, label, parsed }` or undefined when neither names a line.
 */
export function modelLine(model) {
  for (const text of [bareId(model.id), model.name]) {
    const line = lineFromText(text);
    if (line !== undefined) return line;
  }
  return undefined;
}

/**
 * The line of one id, display name or online family name (`claude-fable`).
 * Single letters split off a version (`k` of `kimi-k3`, `v` of `deepseek-v4`)
 * only count when nothing else names the line (`o` of `o3`).
 */
export function lineFromText(text) {
  if (typeof text !== "string" || text.trim() === "") return undefined;
  const parsed = parseName(text);
  const unique = [...new Set(parsed.words)];
  const named = unique.filter((word) => word.length > 1);
  const words = named.length > 0 ? named : unique;
  if (words.length === 0) return undefined;
  return { key: [...words].sort().join("-"), label: words.join("-"), parsed };
}

/**
 * Lookup keys for matching an id against online catalogs: `exact` keeps
 * variant words (`claude-opus-4-6-1m`), `loose` drops them. Word order and
 * version separators are ignored (`claude-5-fable` = `claude-fable-5`,
 * `5.2` = `5-2`); version order is kept (`gpt-5.4` ≠ `gpt-4.5`).
 */
export function matchKeys(text) {
  const parsed = parseName(bareId(text));
  if (parsed.words.length === 0) return undefined;
  const base = [...new Set([...parsed.words, ...parsed.extras])].sort();
  const version = (parsed.version ?? []).join(".");
  const loose = `${base.join("-")}|${version}`;
  const exact = parsed.variants.length === 0 ? loose : `${[...new Set([...base, ...parsed.variants])].sort().join("-")}|${version}`;
  return { exact, loose, hasVariant: parsed.variants.length > 0 };
}

/** Compare version arrays, newest first (missing parts count as 0). */
export function compareVersionsDesc(a, b) {
  const left = a ?? [];
  const right = b ?? [];
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
