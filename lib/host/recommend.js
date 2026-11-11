// Catalog-derived model recommendations and selection suggestions.
//
// Models are grouped into product lines (`claude-opus`, `gpt-sol`, `gemini-flash`)
// and families (`claude`, `gpt`). Each line is represented by its newest
// model; lines left behind by their family are stale. Recommendations are
// flagships: fresh lines close to the best capability score (without scores,
// non-light lines of well-known families). Optional online model info
// (lib/host/model-info.js) supplies release dates, line names, retirement and
// capability scores; without it the catalog's own dates and versions decide.

import { MAX_RECOMMENDED_MODELS } from "./config.js";
import { KNOWN_FAMILY, modelFamily } from "./models.js";
import { LIGHT_WORDS, bareId, compareVersionsDesc, isPrefixed, lineFromText, matchKeys, modelLine } from "./model-names.js";

const DAY_MS = 86_400_000;
/** A line whose newest model is this much older than its family's newest is stale. */
export const STALE_LINE_DAYS = 180;

function isoDay(ms) {
  return ms === undefined ? undefined : new Date(ms).toISOString().slice(0, 10);
}

function parseDay(value) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const ms = Date.parse(value.length === 7 ? `${value}-01` : value);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Whether online info marks a model as retired (deprecated or past its end date). */
export function isRetired(info, now = Date.now()) {
  if (info === undefined) return false;
  if (info.status === "deprecated") return true;
  const ends = parseDay(info.expires);
  return ends !== undefined && ends <= now;
}

/**
 * The vendor family lines compete in: a known family name (`claude`, `gpt-oss`),
 * else the first word of the line (`acme` for `acme-pro` and `acme-max`).
 */
function familyOf(model, line) {
  const known = modelFamily(model);
  if (KNOWN_FAMILY.test(known) || line === undefined) return known;
  return line.label.split("-")[0];
}

function describe(model, index, lookup, now) {
  const info = lookup?.(model);
  const local = modelLine(model);
  const online = typeof info?.family === "string" ? lineFromText(info.family) : undefined;
  const line = online ?? local;
  const released = parseDay(info?.released);
  const created = Number.isInteger(model.created) && model.created > 0 ? model.created * 1000 : undefined;
  return {
    model,
    index,
    info,
    line,
    family: familyOf(model, line),
    version: local?.parsed.version,
    date: released ?? created,
    dateSource: released !== undefined ? "online" : created !== undefined ? "catalog" : undefined,
    variant: (local?.parsed.variants.length ?? 0) > 0,
    prefixed: isPrefixed(model.id),
    retired: isRetired(info, now),
  };
}

/** Whether `a` is a newer release than `b` (dates when both have one, else versions). */
function newer(a, b) {
  if (a.date !== undefined && b.date !== undefined) return a.date > b.date;
  return compareVersionsDesc(a.version, b.version) < 0;
}

function compareInLine(useDates) {
  return (a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (useDates && a.date !== b.date) return b.date - a.date;
    const byVersion = compareVersionsDesc(a.version, b.version);
    if (byVersion !== 0) return byVersion;
    if (a.date !== undefined && b.date !== undefined && a.date !== b.date) return b.date - a.date;
    if (a.variant !== b.variant) return a.variant ? 1 : -1;
    if (a.prefixed !== b.prefixed) return a.prefixed ? 1 : -1;
    return a.index - b.index;
  };
}

/** Capability signals, in order of trust; a family uses the first all its lines have. */
const SIGNALS = [
  { read: (line) => line.rep.info?.intelligence, order: -1 },
  { read: (line) => line.rep.info?.costOutput, order: -1 },
  {
    read: (line) => {
      const priority = line.rep.model.priority;
      return Number.isInteger(priority) && priority >= 0 && priority < 100 ? priority : undefined;
    },
    order: 1,
  },
];

function rankLines(lines) {
  const signal = lines.length > 1
    ? SIGNALS.find((s) => lines.every((line) => typeof s.read(line) === "number"))
    : undefined;
  const light = (line) => line.label.split("-").filter((word) => LIGHT_WORDS.has(word)).length;
  return [...lines].sort((a, b) => {
    if (signal !== undefined) {
      const diff = (signal.read(a) - signal.read(b)) * signal.order;
      if (diff !== 0) return diff;
    }
    if (light(a) !== light(b)) return light(a) - light(b);
    if (a.date !== undefined && b.date !== undefined && a.date !== b.date) return b.date - a.date;
    return a.index - b.index;
  });
}

/**
 * Group chat models into lines and families.
 * @param models - chat models in catalog order.
 * @param options.lookup - `(model) => info | undefined` from online model info.
 * @returns `{ described, lines, families }`; families are in catalog order and
 *   their `fresh` lines best first.
 */
export function analyzeModels(models, options = {}) {
  const now = options.now ?? Date.now();
  const described = models.map((model, index) => describe(model, index, options.lookup, now));
  // A prefixed copy (`devin/grok-4-7`) without a date shares its twin's (`grok-4.7`).
  const twinDates = new Map();
  for (const entry of described) {
    const key = entry.date === undefined ? undefined : matchKeys(entry.model.id)?.loose;
    if (key !== undefined && !twinDates.has(key)) twinDates.set(key, entry);
  }
  for (const entry of described) {
    if (entry.date !== undefined) continue;
    const twin = twinDates.get(matchKeys(entry.model.id)?.loose);
    if (twin !== undefined) {
      entry.date = twin.date;
      entry.dateSource = twin.dateSource;
    }
  }
  const byKey = new Map();
  for (const entry of described) {
    if (entry.line === undefined) continue; // opaque ids are never recommended
    const group = byKey.get(entry.line.key);
    if (group === undefined) byKey.set(entry.line.key, { key: entry.line.key, label: entry.line.label, members: [entry] });
    else group.members.push(entry);
  }
  const lines = [...byKey.values()].map((group) => {
    const useDates = group.members.every((m) => m.date !== undefined);
    const members = [...group.members].sort(compareInLine(useDates));
    const rep = members[0];
    // A just-released model may not be scored yet; its line keeps its best known score.
    const scores = members.filter((m) => !m.retired).map((m) => m.info?.intelligence).filter((s) => typeof s === "number");
    return {
      score: scores.length > 0 ? Math.max(...scores) : undefined,
      key: group.key,
      label: group.label,
      members,
      rep,
      family: rep.family,
      date: rep.date,
      major: rep.version?.[0],
      retired: rep.retired,
      index: Math.min(...members.map((m) => m.index)),
    };
  });
  const familyMap = new Map();
  for (const line of [...lines].sort((a, b) => a.index - b.index)) {
    const family = familyMap.get(line.family);
    if (family === undefined) familyMap.set(line.family, { name: line.family, lines: [line] });
    else family.lines.push(line);
  }
  const staleMs = STALE_LINE_DAYS * DAY_MS;
  for (const family of familyMap.values()) {
    const live = family.lines.filter((line) => !line.retired);
    const dates = live.map((line) => line.date).filter((d) => d !== undefined);
    const majors = live.map((line) => line.major).filter((m) => m !== undefined);
    const bestDate = dates.length > 0 ? Math.max(...dates) : undefined;
    const maxMajor = majors.length > 0 ? Math.max(...majors) : undefined;
    for (const line of family.lines) {
      line.stale =
        line.retired ||
        (line.date !== undefined && bestDate !== undefined
          ? line.date < bestDate - staleMs
          : line.major !== undefined && maxMajor !== undefined && line.major < maxMajor);
    }
    family.fresh = rankLines(family.lines.filter((line) => !line.stale));
  }
  return { described, lines, families: [...familyMap.values()] };
}

function detail(line) {
  const rep = line.rep;
  return {
    id: rep.model.id,
    line: line.label,
    family: line.family,
    ...(rep.date === undefined ? {} : { released: isoDay(rep.date) }),
    ...(line.score === undefined ? {} : { score: line.score }),
    source: rep.info !== undefined ? "online" : rep.dateSource === "catalog" ? "catalog" : "name",
  };
}

/** A flagship scores at least this share of the account's best fresh line. */
export const FLAGSHIP_RATIO = 0.8;

const isLight = (line) => line.label.split("-").some((word) => LIGHT_WORDS.has(word));

/**
 * Owners that count as a prefixed channel's own vendor besides the prefix
 * itself (vocabulary, not model ids): Devin's own models are owned by Cognition.
 */
export const CHANNEL_OWNER_ALIASES = { devin: ["cognition"] };

/**
 * The CPA channel a model comes from: its id prefix (`devin/…`), else the
 * `owned_by` the plain listing reports (`xai`, `openai`, `antigravity`).
 */
export function modelChannel(model) {
  const id = String(model.id ?? "");
  const slash = id.lastIndexOf("/");
  if (slash > 0) return id.slice(0, slash).toLowerCase();
  const owner = typeof model.ownedBy === "string" ? model.ownedBy.trim().toLowerCase() : "";
  return owner === "" ? undefined : owner;
}

/** Whether a model is the channel's own (Devin's SWE), not a model it relays (Devin's Claude). */
function isHouseModel(model, channel) {
  if (!isPrefixed(model.id)) return true;
  const owner = typeof model.ownedBy === "string" ? model.ownedBy.trim().toLowerCase() : "";
  return owner === channel || (CHANNEL_OWNER_ALIASES[channel] ?? []).includes(owner);
}

/** The best line among a channel's own models: score, price, then its main (largest) line. */
function channelBest(lines) {
  const num = (v) => (typeof v === "number" ? v : -1);
  return [...lines].sort(
    (a, b) =>
      num(b.score) - num(a.score) ||
      num(b.rep.info?.costOutput) - num(a.rep.info?.costOutput) ||
      Number(isLight(a)) - Number(isLight(b)) ||
      b.members.length - a.members.length ||
      a.index - b.index
  )[0];
}

/**
 * One representative per channel the account connects: the best fresh line
 * of the channel's own models (Devin → SWE, a Grok channel → Grok), unless
 * that line is already recommended.
 */
function channelPicks(models, options, taken) {
  const byChannel = new Map();
  for (const model of models) {
    const channel = modelChannel(model);
    if (channel === undefined || !isHouseModel(model, channel)) continue;
    const list = byChannel.get(channel);
    if (list === undefined) byChannel.set(channel, [model]);
    else list.push(model);
  }
  const picks = [];
  for (const [channel, house] of byChannel) {
    const fresh = analyzeModels(house, options).families.flatMap((family) => family.fresh);
    if (fresh.length === 0) continue;
    const best = channelBest(fresh);
    if (taken.has(best.key)) continue;
    taken.add(best.key);
    picks.push({ line: best, channel });
  }
  return picks;
}

/**
 * Flagships plus one model per channel.
 * - With capability scores (online model info): every fresh line scoring at
 *   least {@link FLAGSHIP_RATIO} of the best one, strongest first; light,
 *   unscored and niche lines fall away.
 * - Without scores: the fresh non-light lines of well-known families
 *   ({@link KNOWN_FAMILY}), families taking turns.
 * - Then every channel not represented yet adds the best line of its own
 *   models ({@link modelChannel}), detail `via: "channel"`.
 * At most `max` models; channel picks keep their place.
 * @returns `{ ids, details }`; every detail names the line, family, release
 *   date and score (when known) and where the facts came from.
 */
export function planRecommendations(models, options = {}) {
  const max = options.max ?? MAX_RECOMMENDED_MODELS;
  const { families } = analyzeModels(models, options);
  const fresh = families.flatMap((family) => family.fresh);
  const scored = fresh.filter((line) => line.score !== undefined);
  let picks;
  if (scored.length >= 2) {
    const best = Math.max(...scored.map((line) => line.score));
    picks = scored
      .filter((line) => line.score >= best * FLAGSHIP_RATIO)
      .sort((a, b) => b.score - a.score || a.index - b.index);
  } else {
    const heavy = families
      .filter((family) => KNOWN_FAMILY.test(family.name))
      .map((family) => {
        const lines = family.fresh.filter((line) => !isLight(line));
        return lines.length > 0 ? lines : family.fresh.slice(0, 1);
      });
    picks = [];
    for (let round = 0; heavy.some((lines) => lines[round] !== undefined); round += 1) {
      for (const lines of heavy) if (lines[round] !== undefined) picks.push(lines[round]);
    }
  }
  const extra = channelPicks(models, options, new Set(picks.map((line) => line.key))).slice(0, max);
  const details = [
    ...picks.slice(0, Math.max(0, max - extra.length)).map(detail),
    ...extra.map(({ line, channel }) => ({ ...detail(line), via: "channel", channel })),
  ];
  return { ids: details.map((d) => d.id), details };
}

/** Recommended model ids (see {@link planRecommendations}). */
export function recommendModels(models, options = {}) {
  return planRecommendations(models, options).ids;
}

/**
 * Advice about a saved selection, never applied automatically:
 * - `upgrades`: a checked line has a newer, unchecked model;
 * - `missing`: a checked id is no longer in the catalog (only when the
 *   catalog is complete), with a same-named replacement when one exists;
 * - `retired`: a checked model is deprecated or past its end date upstream.
 * @param chatModels - this account's chat models.
 * @param allIds - every id in the catalog, any kind (media ids are not missing).
 */
export function selectionSuggestions(chatModels, selectedIds, options = {}) {
  const selected = new Set(selectedIds ?? []);
  const { described, lines } = analyzeModels(chatModels, options);
  const upgrades = [];
  for (const line of lines) {
    const rep = line.rep;
    if (rep.retired || selected.has(rep.model.id)) continue;
    const from = line.members.filter((m) => selected.has(m.model.id) && newer(rep, m)).map((m) => m.model.id);
    if (from.length === 0) continue;
    upgrades.push({ to: rep.model.id, from, line: line.label, ...(rep.date === undefined ? {} : { released: isoDay(rep.date) }) });
  }

  const known = new Set(options.allIds ?? chatModels.map((m) => m.id));
  const replacementFor = (id) => {
    const keys = matchKeys(id);
    const bare = bareId(id);
    const candidates = described.filter((d) => !selected.has(d.model.id) && (bareId(d.model.id) === bare || (keys !== undefined && matchKeys(d.model.id)?.exact === keys.exact)));
    candidates.sort((a, b) => Number(a.prefixed) - Number(b.prefixed) || a.index - b.index);
    return candidates[0]?.model.id;
  };
  const missing = options.catalogComplete === false || known.size === 0
    ? []
    : [...selected].filter((id) => !known.has(id)).map((id) => {
        const replacement = replacementFor(id);
        return { id, ...(replacement === undefined ? {} : { replacement }) };
      });

  const lineOf = new Map(lines.flatMap((line) => line.members.map((m) => [m.model.id, line])));
  const retired = described
    .filter((d) => d.retired && selected.has(d.model.id))
    .map((d) => {
      const rep = lineOf.get(d.model.id)?.rep;
      const replacement = rep !== undefined && !rep.retired && rep.model.id !== d.model.id ? rep.model.id : undefined;
      return { id: d.model.id, ...(replacement === undefined ? {} : { replacement }) };
    });
  return { upgrades, missing, retired };
}
