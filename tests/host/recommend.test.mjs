// Product-line recommendations and selection suggestions (lib/host/recommend.js, model-names.js).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planRecommendations, recommendModels, selectionSuggestions } from "../../lib/index.js";
import { lineFromText, matchKeys, modelLine, parseName } from "../../lib/host/model-names.js";
import { FLAGSHIP_RATIO, STALE_LINE_DAYS, analyzeModels, modelChannel } from "../../lib/host/recommend.js";
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
  it("recommends flagships by capability score, not one model per family", () => {
    const lookup = onlineLookup();
    const serverB = planRecommendations(catalog("server-b").chat, { lookup, now: RECORDED });
    assert.deepEqual(serverB.ids, ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5"], "Haiku (36.5) is far below Fable (64.6)");
    assert.deepEqual(serverB.details[0], { id: "claude-fable-5-2", line: "claude-fable", family: "claude", released: "2026-11-09", score: 64.6, source: "online" });

    const serverA = planRecommendations(catalog("server-a").chat, { lookup, now: RECORDED });
    const flagships = serverA.details.filter((d) => d.via === undefined);
    assert.deepEqual(flagships.map((d) => d.id), [
      "devin/claude-opus-5-5",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "devin/claude-sonnet-5-5",
      "gpt-6.1-terra",
      "devin/gemini-4-argon",
      "devin/claude-fable-5-1",
    ]);
    const best = flagships[0].score;
    assert.ok(flagships.every((d) => d.score >= best * FLAGSHIP_RATIO));
    assert.ok(!flagships.some((d) => /[-/](luna|haiku|flash|lite|mini)(-|$)|inkling|nemotron|swe|gpt-oss|model_private/.test(d.id)), "light, unscored and niche lines fall away");
    // Every connected channel still gets its own best model.
    assert.deepEqual(
      serverA.details.filter((d) => d.via === "channel").map((d) => [d.channel, d.id]),
      [["antigravity", "gemini-3.8-flash-high"], ["xai", "grok-4.7"], ["devin", "devin/swe-2"]]
    );
    const three = planRecommendations(catalog("server-a").chat, { lookup, now: RECORDED, max: 3 });
    assert.deepEqual(three.ids, ["gemini-3.8-flash-high", "grok-4.7", "devin/swe-2"], "channel picks keep their place under a small cap");
  });

  it("adds the best own model of every channel that has none yet", () => {
    const lookup = (model) => ({ "devin/claude-opus-5-5": { intelligence: 60 }, "gpt-6": { intelligence: 58 } })[model.id];
    const models = [
      m("gpt-6", { ownedBy: "openai" }),
      m("devin/claude-opus-5-5", { ownedBy: "anthropic" }),
      m("devin/swe-1-7", { ownedBy: "cognition" }),
      m("devin/swe-2", { ownedBy: "cognition" }),
      m("devin/inkling", { ownedBy: "devin" }),
      m("grok-4.7", { ownedBy: "xai" }),
      m("grok-4.7-fast", { ownedBy: "xai" }),
    ];
    const plan = planRecommendations(models, { lookup, now: RECORDED });
    assert.deepEqual(plan.ids, ["devin/claude-opus-5-5", "gpt-6", "devin/swe-2", "grok-4.7"], "Devin's main own line (SWE), Grok without a variant; OpenAI is already in");
    assert.deepEqual(plan.details[2], { id: "devin/swe-2", line: "swe", family: "swe", source: "name", via: "channel", channel: "devin" });
    assert.equal(modelChannel(m("devin/swe-2")), "devin");
    assert.equal(modelChannel(m("grok-4.7", { ownedBy: "xAI" })), "xai");
    assert.equal(modelChannel(m("plain")), undefined);
  });

  it("without scores: fresh non-light lines of well-known families, families in turns", () => {
    const serverB = planRecommendations(catalog("server-b").chat, { now: RECORDED });
    assert.deepEqual([...serverB.ids].sort(), ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5"]);
    assert.equal(serverB.details.find((d) => d.id === "claude-fable-5-2").source, "catalog", "the CPA listing's own dates");
    const serverA = planRecommendations(catalog("server-a").chat, { now: RECORDED });
    assert.ok(serverA.ids.includes("grok-4.7"), "dates beat the 4.20 > 4.7 version reading");
    assert.ok(!serverA.ids.some((id) => /inkling|nemotron|non-reasoning|thinking|model_private/.test(id)), "unknown families, variants and opaque ids stay out");
    assert.ok(!serverA.ids.includes("devin/gemini-3-1-pro"), "a line a newer one left behind is stale");
    assert.equal(serverA.ids.length, 12);
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
  });

  it("marks lines left behind by their family as stale", () => {
    const t = (days) => Math.floor(RECORDED / 1000) - days * DAY;
    const staleOf = (models) => Object.fromEntries(analyzeModels(models, { now: RECORDED }).lines.map((l) => [l.label, l.stale]));
    assert.deepEqual(
      staleOf([m("qwen-pro-3", { created: t(STALE_LINE_DAYS + 30) }), m("qwen-max-4", { created: t(10) }), m("qwen-plus-4", { created: t(STALE_LINE_DAYS - 30) })]),
      { "qwen-pro": true, "qwen-max": false, "qwen-plus": false }
    );
    // Without dates, an older major version is stale.
    assert.deepEqual(staleOf([m("qwen-pro-3"), m("qwen-max-4"), m("qwen-plus-4")]), { "qwen-pro": true, "qwen-max": false, "qwen-plus": false });
    assert.deepEqual(recommendModels([m("qwen-pro-3"), m("qwen-max-4"), m("qwen-plus-4")]), ["qwen-max-4", "qwen-plus-4"]);
  });

  it("never recommends retired models and borrows dates for prefixed twins", () => {
    const lookup = (model) =>
      model.id === "qwen-max-5" ? { status: "deprecated", exact: true } : model.id === "qwen-max-4" ? { expires: "2026-01-01", exact: true } : undefined;
    assert.deepEqual(recommendModels([m("qwen-max-5"), m("qwen-max-4"), m("qwen-max-3")], { lookup, now: RECORDED }), ["qwen-max-3"]);
    const twins = [m("qwen-4.20", { created: 1000 }), m("qwen-4.7", { created: 9000 }), m("vendor/qwen-4-7")];
    assert.deepEqual(recommendModels(twins, { now: RECORDED }), ["qwen-4.7"], "the twin's date keeps the line dated: 4.7 is newer than 4.20");
    const ids = recommendModels(
      [m("qwen-4.1", { created: 1000 }), m("qwen-4.7", { created: 9000 }), m("vendor/qwen-4-7"), m("vendor/qwen-4-8")],
      { now: RECORDED }
    );
    assert.deepEqual(ids, ["vendor/qwen-4-8"], "dates only decide when every member has one");
  });

  it("scores a line by its best known member when the newest is not scored yet", () => {
    const lookup = (model) => ({ "qwen-max-4": { intelligence: 60 }, "qwen-plus-5": { intelligence: 40 }, "qwen-turbo-5": { intelligence: 50 } })[model.id];
    const t = Math.floor(RECORDED / 1000);
    const plan = planRecommendations([m("qwen-max-4", { created: t - 100 * DAY }), m("qwen-max-5", { created: t }), m("qwen-plus-5"), m("qwen-turbo-5")], { lookup, now: RECORDED });
    assert.deepEqual(plan.details.map((d) => [d.id, d.score]), [["qwen-max-5", 60], ["qwen-turbo-5", 50]], "40 < 60 x 0.8");
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
