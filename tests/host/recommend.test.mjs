// Product-line recommendations and selection suggestions (lib/host/recommend.js, model-names.js).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planRecommendations, recommendModels, selectionSuggestions } from "../../lib/index.js";
import { lineFromText, matchKeys, modelLine, parseName } from "../../lib/host/model-names.js";
import { STALE_LINE_DAYS } from "../../lib/host/recommend.js";
import { RECORDED, catalog, onlineLookup } from "../helpers/model-fixtures.mjs";

const m = (id, extra = {}) => ({ id, inputModalities: ["text"], reasoning: false, reasoningLevels: [], ...extra });
const DAY = 86_400;

describe("model names", () => {
  it("splits ids into line words, versions and variants", () => {
    assert.deepEqual(parseName("claude-opus-4-6-thinking"), { words: ["claude", "opus"], variants: ["thinking"], extras: [], version: [4, 6] });
    assert.deepEqual(parseName("claude-opus-4-20250514").version, [4], "a date ends the version");
    assert.deepEqual(parseName("grok-4.20-0309-non-reasoning").version, [4, 20]);
    assert.deepEqual(parseName("model_chat_gpt_4_1_2025_04_14").words, ["gpt"], "packaging and vendor words are dropped");
    assert.deepEqual(parseName("kimi-k2-6").version, [2, 6], "letters+digits start the version");
    assert.deepEqual(parseName("gpt-oss-120b-medium"), { words: ["gpt", "oss"], variants: ["medium"], extras: ["120b"], version: undefined });
    assert.deepEqual(parseName("gemini-3-0-flash").version, [3], "trailing zero parts are dropped");
  });

  it("names product lines independent of word order, prefixes and opaque ids", () => {
    assert.equal(modelLine(m("devin/claude-5-fable")).key, modelLine(m("claude-fable-5-2")).key);
    assert.equal(modelLine(m("claude-opus-4-6-1m")).key, "claude-opus");
    assert.equal(modelLine(m("gemini-3.8-flash-high")).key, lineFromText("gemini-flash").key, "online family names share the key");
    assert.equal(modelLine(m("kimi-k3")).key, "kimi");
    assert.equal(modelLine(m("o3")).key, "o", "a lone letter still names a line");
    assert.equal(modelLine(m("devin/model_private_12", { name: "GPT-5.1 (Devin)" })).key, "gpt", "opaque ids fall back to the display name");
    assert.equal(modelLine(m("devin/model_private_12")), undefined, "opaque without a name: no line");
  });

  it("match keys ignore word order and separators but keep version order", () => {
    assert.equal(matchKeys("devin/claude-5-fable").exact, matchKeys("claude-fable-5").exact);
    assert.equal(matchKeys("anthropic/claude-fable-5.2:batch").exact, matchKeys("claude-fable-5-2").exact);
    assert.notEqual(matchKeys("gpt-5.4").exact, matchKeys("gpt-4.5").exact);
    assert.notEqual(matchKeys("gpt-oss-120b").exact, matchKeys("gpt-oss-20b").exact);
    const variant = matchKeys("claude-opus-4-6-1m");
    assert.equal(variant.hasVariant, true);
    assert.notEqual(variant.exact, matchKeys("claude-opus-4-6").exact);
    assert.equal(variant.loose, matchKeys("claude-opus-4-6").exact);
  });
});

describe("recommendations", () => {
  it("recommends one model per product line, not one per vendor", () => {
    const { chat } = catalog("server-b");
    // Offline: the CPA listing's own `created` dates order the lines.
    const plan = planRecommendations(chat, { now: RECORDED });
    assert.deepEqual([...plan.ids].sort(), ["claude-fable-5-2", "claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
    assert.deepEqual(plan.details.find((d) => d.id === "claude-fable-5-2"), {
      id: "claude-fable-5-2",
      line: "claude-fable",
      family: "claude",
      released: "2026-11-09",
      source: "catalog",
    });
  });

  it("uses online capability scores to order lines and release dates to pick models", () => {
    const lookup = onlineLookup();
    const serverB = planRecommendations(catalog("server-b").chat, { lookup, now: RECORDED });
    assert.deepEqual(serverB.ids, ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
    assert.ok(serverB.details.every((d) => d.source === "online"));

    const serverA = planRecommendations(catalog("server-a").chat, { lookup, now: RECORDED });
    assert.equal(serverA.ids.length, 12);
    assert.ok(serverA.ids.includes("grok-4.7"), "dates beat the 4.20 > 4.7 version reading");
    assert.ok(!serverA.ids.some((id) => /non-reasoning|thinking|model_private/.test(id)), "no variants or opaque ids");
    assert.ok(serverA.ids.includes("devin/gemini-4-argon"), "a line a newer one left behind (gemini 3.1 pro) is stale");
    assert.ok(serverA.ids.includes("devin/claude-opus-5-5"));
    const families = serverA.details.map((d) => d.family);
    assert.equal(new Set(families.slice(0, 11)).size, 11, "first round: one line of each of the 11 families");
    assert.deepEqual(serverA.details[11], { id: "gpt-6.1-sol", line: "gpt-sol", family: "gpt", released: "2026-09-29", source: "online" }, "then the next line of the first family");
    assert.ok(!serverA.ids.includes("grok-composer-2.5-fast"), "a 2025 grok line is stale next to grok 4.7");

    const more = planRecommendations(catalog("server-a").chat, { lookup, now: RECORDED, max: 40 });
    assert.ok(more.ids.includes("gpt-6.1-sol") && more.ids.includes("devin/claude-sonnet-5-5"), "later rounds add the next lines");
    assert.ok(!more.ids.includes("devin/gpt-5-5"), "old generations stay out even with room");
  });

  it("prefers plain ids, newest dates and non-variants inside a line", () => {
    const ids = recommendModels([
      m("vendor/gpt-6.1", { name: "GPT 6.1" }),
      m("gpt-6.1"),
      m("gpt-5.5"),
      m("claude-opus-5-5-thinking"),
      m("claude-opus-5-5"),
    ]);
    assert.deepEqual(ids, ["gpt-6.1", "claude-opus-5-5"]);
    assert.deepEqual(recommendModels([]), []);
    const many = Array.from({ length: 30 }, (_, i) => m(`fam${String.fromCharCode(97 + (i % 26))}${i}-1`));
    assert.equal(recommendModels(many).length, 12);
  });

  it("drops lines left behind by their family", () => {
    const t = (days) => Math.floor(RECORDED / 1000) - days * DAY;
    const dated = recommendModels(
      [m("acme-pro-3", { created: t(STALE_LINE_DAYS + 30) }), m("acme-max-4", { created: t(10) }), m("acme-mini-4", { created: t(STALE_LINE_DAYS - 30) })],
      { now: RECORDED }
    );
    assert.deepEqual(dated, ["acme-max-4", "acme-mini-4"]);
    // Without dates, an older major version is stale.
    assert.deepEqual(recommendModels([m("acme-pro-3"), m("acme-max-4"), m("acme-mini-4")]), ["acme-max-4", "acme-mini-4"]);
  });

  it("never recommends retired models and borrows dates for prefixed twins", () => {
    const lookup = (model) =>
      model.id === "acme-max-5" ? { status: "deprecated", exact: true } : model.id === "acme-max-4" ? { expires: "2026-01-01", exact: true } : undefined;
    assert.deepEqual(recommendModels([m("acme-max-5"), m("acme-max-4"), m("acme-max-3")], { lookup, now: RECORDED }), ["acme-max-3"]);
    const twins = [m("acme-4.20", { created: 1000 }), m("acme-4.7", { created: 9000 }), m("vendor/acme-4-7")];
    assert.deepEqual(recommendModels(twins, { now: RECORDED }), ["acme-4.7"], "the twin's date keeps the line dated: 4.7 is newer than 4.20");
    const ids = recommendModels(
      [m("acme-4.1", { created: 1000 }), m("acme-4.7", { created: 9000 }), m("vendor/acme-4-7"), m("vendor/acme-4-8")],
      { now: RECORDED }
    );
    assert.deepEqual(ids, ["vendor/acme-4-8"], "dates only decide when every member has one");
  });
});

describe("selection suggestions", () => {
  it("suggests the newer model of a checked line", () => {
    const { chat, models } = catalog("server-b");
    const s = selectionSuggestions(chat, ["claude-fable-5-1", "claude-opus-5-5"], { allIds: models.map((x) => x.id), now: RECORDED });
    assert.deepEqual(s.upgrades, [{ to: "claude-fable-5-2", from: ["claude-fable-5-1"], line: "claude-fable", released: "2026-11-09" }]);
    assert.deepEqual(s.missing, []);
    assert.deepEqual(
      selectionSuggestions(chat, ["claude-fable-5-1", "claude-fable-5-2"], { now: RECORDED }).upgrades,
      [],
      "nothing to suggest once the newest is checked"
    );
  });

  it("reports checked ids the catalog lost, with a same-named replacement", () => {
    const { chat, models } = catalog("server-a");
    const lookup = onlineLookup();
    const s = selectionSuggestions(chat, ["claude-opus-5-5", "gone-model-1", "devin/deepseek-v4-flash"], {
      lookup,
      allIds: models.map((x) => x.id),
      now: RECORDED,
    });
    assert.deepEqual(s.missing, [{ id: "claude-opus-5-5", replacement: "devin/claude-opus-5-5" }, { id: "gone-model-1" }]);
    assert.deepEqual(s.retired, [{ id: "devin/deepseek-v4-flash", replacement: "devin/deepseek-v4-1-flash" }]);
    assert.deepEqual(
      selectionSuggestions(chat, ["gone-model-1"], { allIds: models.map((x) => x.id), catalogComplete: false }).missing,
      [],
      "an incomplete catalog proves nothing"
    );
    assert.deepEqual(selectionSuggestions(chat, ["grok-imagine-image"], { allIds: models.map((x) => x.id) }).missing, [], "media ids are not missing");
  });
});
