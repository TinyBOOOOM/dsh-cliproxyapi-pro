// Chat model filtering, families, version ordering and catalog-derived recommendations.

import { MAX_RECOMMENDED_MODELS } from "./config.js";

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

export function modelFamily(model) {
  const label = (model.name ?? model.id).trim().toLowerCase();
  const known = label.match(
    /^(gpt-oss|gemini|claude|gpt|grok|deepseek|qwen|glm|kimi|minimax|mistral|llama|swe|o(?=\d))/
  )?.[1];
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

/**
 * A starting selection derived from the server's own catalog: the newest
 * model of each family, in catalog order, at most {@link MAX_RECOMMENDED_MODELS}.
 * Among equally new models a plain id is preferred over a prefixed one
 * (`gpt-6` over `vendor/gpt-6`).
 * @param models - parsed catalog models.
 * @returns model ids.
 */
export function recommendModels(models) {
  const groups = new Map();
  for (const model of models) {
    const family = modelFamily(model);
    const group = groups.get(family);
    if (group === undefined) groups.set(family, [model]);
    else group.push(model);
  }
  const picks = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) => compareVersionDescending(a, b) || Number(a.id.includes("/")) - Number(b.id.includes("/"))
    );
    picks.push(sorted[0].id);
    if (picks.length >= MAX_RECOMMENDED_MODELS) break;
  }
  return picks;
}
