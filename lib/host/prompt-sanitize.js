// System-prompt sanitizing: the `system-prompt/assemble` waterfall hook that
// removes text some upstreams reject before a request leaves DSH — the brand
// phrase (replaced) and known trigger sentences (removed).

/**
 * Default text substituted for every "DeepSeek Harness" phrase, used when the
 * account leaves its replacement blank. The phrase is used as a proper noun
 * throughout the prompt ("powered by ___.", "the ___ implementation
 * checkout", "the ___ Web GUI"), so the default is an article-free proper
 * noun that reads grammatically in every position and is free of the brand
 * words the upstream blocks.
 */
export const DEFAULT_SANITIZE_REPLACEMENT = "Custom Harness";

/**
 * The phrase some upstream gateways refuse in the system prompt. Antigravity
 * Gemini accounts reject requests whose system text contains "DeepSeek
 * Harness" (any letter case, across whitespace) with an unexplained 429, so
 * every occurrence is replaced as one whole phrase — wherever it appears,
 * including inside the fixed identity opener.
 */
export const PROMPT_PHRASE_PATTERN = /deepseek\s+harness/gi;

/**
 * The replacement text one account configured: its trimmed value, or the
 * default when blank/missing.
 */
export function sanitizeReplacement(configured) {
  return typeof configured === "string" && configured.trim() !== ""
    ? configured.trim()
    : DEFAULT_SANITIZE_REPLACEMENT;
}

/**
 * Build a sentence matcher that tolerates any whitespace between words, in
 * any letter case, and also consumes the horizontal whitespace around it.
 */
function sentencePattern(sentence) {
  const words = sentence.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`[ \\t]*${words.join("\\s+")}[ \\t]*`, "gi");
}

/**
 * Whole sentences removed from the prompt because upstream content screening
 * rejects them in context. Google is not a plain keyword filter here: this
 * sentence of DSH's Web GUI orientation (`app:web-surface`, also in its
 * frozen legacy paragraph) passes on its own but 429s together with its
 * neighbours ("…they mean this GUI. … The client-plugin…"); the full prompt
 * passes once it is removed. Losing it only drops the hint that the browser
 * supplies no implicit page context.
 */
export const PROMPT_SENTENCE_REMOVALS = [
  sentencePattern("The browser provides no implicit DOM, route, or screenshot context."),
];

/**
 * Drop one matched sentence, keeping a single space only where it sat between
 * two pieces of text on the same line (no doubled or dangling spaces).
 */
function removeSentence(match, offset, whole) {
  const before = whole[offset - 1];
  const after = whole[offset + match.length];
  const textBefore = before !== undefined && before !== "\n" && before !== "\r";
  const textAfter = after !== undefined && after !== "\n" && after !== "\r";
  return textBefore && textAfter ? " " : "";
}

/**
 * Sanitize one string: remove every known trigger sentence, then replace each
 * "DeepSeek Harness" phrase with `replacement`, verbatim — a function replacer
 * keeps `$`-sequences in custom text literal. Returns the input when nothing
 * matched.
 */
export function sanitizePromptText(text, replacement = DEFAULT_SANITIZE_REPLACEMENT) {
  const target = sanitizeReplacement(replacement);
  let out = text;
  for (const pattern of PROMPT_SENTENCE_REMOVALS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, removeSentence);
  }
  PROMPT_PHRASE_PATTERN.lastIndex = 0;
  return out.replace(PROMPT_PHRASE_PATTERN, () => target);
}

/**
 * Rewrite every text value the assembled prompt contributes to the request:
 * ordered sections, dynamic runtime contexts and interpolation variables.
 * Section/context objects are shallow-copied; the input assembly is never
 * mutated. Returns the original assembly reference when nothing matched, so
 * listeners downstream see one identical value.
 */
export function sanitizeAssembly(assembly, replacement = DEFAULT_SANITIZE_REPLACEMENT) {
  if (assembly === null || typeof assembly !== "object") return assembly;
  let changed = false;
  const mapText = (entry) => {
    if (entry === null || typeof entry !== "object" || typeof entry.text !== "string") return entry;
    const text = sanitizePromptText(entry.text, replacement);
    if (text === entry.text) return entry;
    changed = true;
    return { ...entry, text };
  };
  const sections = Array.isArray(assembly.sections) ? assembly.sections.map(mapText) : assembly.sections;
  const contexts = Array.isArray(assembly.contexts) ? assembly.contexts.map(mapText) : assembly.contexts;
  let variables = assembly.variables;
  if (variables !== null && typeof variables === "object") {
    const next = {};
    let varsChanged = false;
    for (const [name, value] of Object.entries(variables)) {
      const rewritten = typeof value === "string" ? sanitizePromptText(value, replacement) : value;
      if (rewritten !== value) varsChanged = true;
      next[name] = rewritten;
    }
    if (varsChanged) {
      variables = next;
      changed = true;
    }
  }
  return changed ? { ...assembly, sections, contexts, variables } : assembly;
}
