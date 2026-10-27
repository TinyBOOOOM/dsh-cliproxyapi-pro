// Catalog media classification and CPA model aliases.
// #region Classification

export const MEDIA_KINDS = ["chat", "image", "video"];

// Families CLIProxyAPI routes to its image / video handlers
// (sdk/api/handlers/openai/openai_{images,videos}_handlers.go), matched by
// prefix: a catalog may list variants CPA does not accept yet (BCPA lists
// `grok-imagine-video-1.5-lite`; CPA 9e79552 accepts only the base, `-1.5`
// and `-1.5-preview`). Such a model still cannot chat, so it is a media
// model, and CPA's own error explains a refused generation. Compare against
// those handlers when CPA adds a family.
const CPA_IMAGE_PREFIXES = ["grok-imagine-image", "gpt-image-"];
const CPA_VIDEO_PREFIXES = ["grok-imagine-video"];
const SORA_ALIAS_TARGET = "grok-imagine-video";

/** The model id without an account / vendor prefix, lower-cased. */
export function bareModelId(id) {
  return String(id ?? "").trim().toLowerCase().split("/").pop() ?? "";
}

function isSoraAlias(bare) {
  return bare === "sora-2" || bare.startsWith("sora-2-");
}

function lowerList(value) {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === "string").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : [];
}

/**
 * Kind of a parsed catalog model, from catalog fields first and CPA's own
 * model families second. `catalogType` is the CPA registry `type`
 * (`openai-image` marks image endpoints); `outputModalities` the declared
 * output modalities.
 * @returns one of {@link MEDIA_KINDS}.
 */
export function detectMediaKind(model) {
  const type = String(model?.catalogType ?? "").trim().toLowerCase();
  if (type === "openai-image" || /(^|[-_])image($|[-_])/.test(type)) return "image";
  if (/(^|[-_])video($|[-_])/.test(type)) return "video";
  const out = lowerList(model?.outputModalities);
  if (out.includes("video")) return "video";
  if (out.includes("image") && !out.includes("text")) return "image";
  const bare = bareModelId(model?.id);
  if (CPA_VIDEO_PREFIXES.some((p) => bare.startsWith(p)) || isSoraAlias(bare)) return "video";
  if (CPA_IMAGE_PREFIXES.some((p) => bare.startsWith(p))) return "image";
  return "chat";
}

/** The model CPA really calls for an alias id (`sora-2*` → Grok video), or undefined. */
export function mediaAliasTarget(id) {
  return isSoraAlias(bareModelId(id)) ? SORA_ALIAS_TARGET : undefined;
}

/** Effective kind: a valid user override wins over detection. */
export function effectiveKind(model, overrides) {
  const forced = overrides?.[model?.id];
  if (MEDIA_KINDS.includes(forced)) return forced;
  if (MEDIA_KINDS.includes(model?.detectedKind)) return model.detectedKind;
  return detectMediaKind(model);
}

// #endregion
