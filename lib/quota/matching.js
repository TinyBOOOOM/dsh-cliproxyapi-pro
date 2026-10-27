// Maps account model ids to credentials and builds snapshot lookup indexes.
import { isObj, text, normalizeProvider, prefixOf } from "./helpers.js";

//#region Model Matching

function modelFamily(modelId) {
  const s = text(modelId).toLowerCase();
  if (s === "") return "";
  if (/grok|xai/.test(s)) return "xai";
  if (/kimi|moonshot/.test(s)) return "kimi";
  if (/qwen|qwq/.test(s)) return "qwen";
  if (/iflow/.test(s)) return "iflow";
  if (/glm|chatglm|zhipu/.test(s)) return "glm";
  if (/deepseek/.test(s)) return "deepseek";
  if (/gemini|gemma/.test(s)) return "gemini";
  if (/claude|sonnet|opus|haiku/.test(s)) return "claude";
  if (/gpt|openai|codex/.test(s) || /(?:^|[-_:/.])o[1-9](?:$|[-_:/.])/.test(s)) return "gpt";
  return "";
}

/** CPA `owned_by` → family (or a provider type for families without a model-name pattern). */
function ownedByFamily(ownedBy) {
  const o = text(ownedBy).toLowerCase();
  if (o === "") return "";
  if (/anthropic|claude/.test(o)) return "claude";
  if (/openai|codex/.test(o)) return "gpt";
  if (/google|gemini|antigravity/.test(o)) return "gemini";
  if (/xai|grok/.test(o)) return "xai";
  if (/moonshot|kimi/.test(o)) return "kimi";
  return `provider:${normalizeProvider(o)}`;
}

function windowsMention(credential, word) {
  const rows = Array.isArray(credential.windows) ? credential.windows : [];
  return rows.some((w) =>
    (Array.isArray(w.modelPrefixes) && w.modelPrefixes.some((p) => text(p).toLowerCase().startsWith(word)))
    || (Array.isArray(w.modelIds) && w.modelIds.some((id) => text(id).toLowerCase().includes(word)))
    || text(w.group).toLowerCase().includes(word));
}

function servesFamily(credential, family) {
  if (family === "") return false;
  const provider = text(credential.provider).toLowerCase();
  if (family.startsWith("provider:")) return provider === family.slice("provider:".length);
  switch (provider) {
    case "claude": return family === "claude";
    case "codex":
    case "openai": return family === "gpt";
    case "gemini":
    case "gemini-cli":
    case "gemini-api":
    case "aistudio": return family === "gemini";
    case "vertex": return family === "gemini" || family === "claude";
    // Antigravity serves Gemini, and Claude/GPT only when its quota groups say so.
    case "antigravity": return family === "gemini" || ((family === "claude" || family === "gpt") && windowsMention(credential, family));
    case "kimi":
    case "xai":
    case "qwen":
    case "iflow":
    case "glm":
    case "deepseek": return family === provider;
    default: return false;
  }
}

const listHas = (credential, idLower) => Array.isArray(credential.models) && credential.models.some((m) => text(m).toLowerCase() === idLower);

function finishMatch(list, matchedBy) {
  const seen = new Set();
  const unique = list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  const rank = (c) => (c.status === "active" ? 0 : 1);
  const credentialIds = unique
    .map((c, index) => ({ c, index }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.index - b.index)
    .map(({ c }) => c.id);
  return { credentialIds, matchedBy: credentialIds.length === 0 ? "none" : matchedBy };
}

/** Credentials of one snapshot account entry that serve `modelId`. */
export function matchCredentials(accountEntry, modelId) {
  const credentials = (Array.isArray(accountEntry?.credentials) ? accountEntry.credentials : [])
    .filter((c) => isObj(c) && typeof c.id === "string" && c.id !== "");
  const id = text(modelId).toLowerCase();
  if (id === "" || credentials.length === 0) return { credentialIds: [], matchedBy: "none" };

  // Rule 1: "p/rest" routes only to credentials with prefix p.
  const slash = id.indexOf("/");
  if (slash > 0) {
    const prefix = id.slice(0, slash);
    const prefixed = credentials.filter((c) => prefixOf(c) === prefix);
    if (prefixed.length > 0) {
      const confirmed = prefixed.filter((c) => listHas(c, id));
      const unknown = prefixed.filter((c) => !Array.isArray(c.models));
      if (confirmed.length > 0) return finishMatch([...confirmed, ...unknown], "model-list");
      return finishMatch(unknown.length > 0 ? unknown : prefixed, "prefix");
    }
  }

  // Rule 2: exact model-list hits, un-prefixed credentials first.
  const unprefixed = credentials.filter((c) => prefixOf(c) === "");
  const prefixed = credentials.filter((c) => prefixOf(c) !== "");
  const plainHits = unprefixed.filter((c) => listHas(c, id));
  const prefixedHits = plainHits.length > 0 ? [] : prefixed.filter((c) => listHas(c, `${prefixOf(c)}/${id}`) || listHas(c, id));

  // Rule 3: family heuristics for un-prefixed credentials whose model list is unknown.
  let family = modelFamily(id);
  if (family === "") {
    const picker = Array.isArray(accountEntry?.pickerModels) ? accountEntry.pickerModels : [];
    const hint = picker.find((m) => isObj(m) && text(m.id).toLowerCase() === id && text(m.ownedBy) !== "");
    if (hint !== undefined) family = ownedByFamily(hint.ownedBy);
  }
  const familyHits = family === "" ? [] : unprefixed.filter((c) => !Array.isArray(c.models) && servesFamily(c, family));

  const listHits = [...plainHits, ...prefixedHits];
  if (listHits.length > 0) return finishMatch([...listHits, ...familyHits], "model-list");
  if (familyHits.length > 0) return finishMatch(familyHits, "family");
  return { credentialIds: [], matchedBy: "none" };
}

function buildModelIndex(entry) {
  const ids = new Set();
  for (const c of entry.credentials) {
    if (!Array.isArray(c.models)) continue;
    const prefix = prefixOf(c);
    for (const m of c.models) {
      ids.add(m);
      if (prefix !== "" && m.toLowerCase().startsWith(`${prefix}/`)) ids.add(m.slice(prefix.length + 1));
    }
  }
  for (const m of entry.pickerModels ?? []) if (text(m?.id) !== "") ids.add(text(m.id));
  const modelIndex = {};
  const modelMatch = {};
  for (const id of ids) {
    const match = matchCredentials(entry, id);
    modelIndex[id] = match.credentialIds;
    modelMatch[id] = match.matchedBy;
  }
  return { modelIndex, modelMatch };
}

//#endregion

export { buildModelIndex };
