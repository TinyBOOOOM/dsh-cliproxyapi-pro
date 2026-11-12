// Chat model filtering, families and version ordering (recommendations: recommend.js).

export function splitPrefixes(csv) {
  if (typeof csv !== "string" || csv.trim() === "") return [];
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function filterModels(models, config) {
  const includes = splitPrefixes(config.includePrefix);
  const excludes = splitPrefixes(config.excludePrefix);
  const selectedSet =
    Array.isArray(config.selectedModels) && config.selectedModels.length > 0
      ? new Set(config.selectedModels)
      : null;

  return models.filter((m) => {
    if (selectedSet !== null && !selectedSet.has(m.id)) {
      return false;
    }
    const idLower = m.id.toLowerCase();
    if (includes.length > 0 && !includes.some((p) => idLower.startsWith(p) || idLower.includes(p))) {
      return false;
    }
    if (excludes.length > 0 && excludes.some((p) => idLower.startsWith(p) || idLower.includes(p))) {
      return false;
    }
    return true;
  });
}

/** Vendor families recognized by name; others are named by their leading text. */
export const KNOWN_FAMILY = /^(gpt-oss|gemini|claude|gpt|grok|deepseek|qwen|glm|kimi|minimax|mistral|llama|swe|o(?=\d))/;

export function modelFamily(model) {
  // "Inkling (Devin)": a parenthesized channel note is not part of the family.
  const label = String(model.name ?? model.id).replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() || String(model.id).toLowerCase();
  const known = label.match(KNOWN_FAMILY)?.[1];
  if (known !== undefined) return known;
  return label.split(/[\s_/-]*\d/, 1)[0]?.replace(/[\s_/-]+$/, "") || label;
}

export function modelVersion(model) {
  const labels = [model.name, model.id];
  for (const label of labels) {
    if (label === undefined) continue;
    const match = label.match(/(?:^|[^\d])(\d+(?:[.-]\d+)*)/);
    if (match?.[1] !== undefined) return match[1].split(/[.-]/).map(Number);
  }
  return [];
}

export function compareVersionDescending(left, right) {
  const a = modelVersion(left);
  const b = modelVersion(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sortModelsNewestFirst(models) {
  const groups = new Map();
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.get(family);
    if (group === undefined) groups.set(family, [model]);
    else group.push(model);
  }
  return [...groups.values()].flatMap((group) => [...group].sort(compareVersionDescending));
}
