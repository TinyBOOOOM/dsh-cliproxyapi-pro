// Models tab advice: online model-info switch, recommendation reasons and selection suggestions.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientHarness, nodes, content } from "../helpers/client-harness.mjs";

const suggestions = {
  upgrades: [{ to: "claude-fable-5-2", from: ["claude-fable-5-1"], line: "claude-fable", released: "2026-11-09" }],
  missing: [{ id: "claude-opus-5-5", replacement: "devin/claude-opus-5-5" }, { id: "gone-1" }],
  retired: [{ id: "old-1" }],
};

function render(h, { selected, online = true, info = { enabled: true, state: "ready", sources: { modelsDev: { fetchedAt: "2026-11-11T02:00:00Z", models: 3 } } }, language = "zh" } = {}) {
  const dictionary = h[language];
  const t = (key) => dictionary[key] ?? key;
  let selection = new Set(selected);
  const toggles = [];
  const tree = h.ModelAdvice({
    t,
    account: { id: "default", suggestions },
    global: { onlineModelInfo: online, modelInfo: info },
    selectedIds: selection,
    busy: null,
    onSelection: (fn) => (selection = fn(selection)),
    onToggleOnline: (next) => toggles.push(next),
  });
  return { tree, toggles, selection: () => selection };
}

const buttons = (tree) => nodes(tree, (n) => n.type === "button" && n.props.role !== "switch" && n.props.className !== "dcpa-info-btn");

describe("model advice", () => {
  it("shows the online switch with its state and toggles the global", () => {
    const h = clientHarness();
    const { tree, toggles } = render(h, { selected: [] });
    const [sw] = nodes(tree, (n) => n.props.role === "switch");
    assert.equal(sw.props["aria-checked"], true);
    assert.match(content(tree), /在线模型资料/);
    assert.match(content(tree), /已更新/);
    sw.props.onClick();
    assert.deepEqual(toggles, [false]);
    const off = render(h, { selected: [], online: false, info: { enabled: false, state: "off", sources: {} }, language: "en" });
    assert.match(content(off.tree), /Off: recommendations use the CPA catalog only/);
  });

  it("lists only advice that applies to the draft and edits the draft, not the saved selection", () => {
    const h = clientHarness();
    const view = render(h, { selected: ["claude-fable-5-1", "claude-opus-5-5", "gone-1", "old-1"] });
    const text = content(view.tree);
    assert.match(text, /claude-fable-5-2（2026-11-09 发布）比已勾选的 claude-fable-5-1 更新/);
    assert.match(text, /claude-opus-5-5 不在服务目录中/);
    assert.match(text, /old-1 已被上游标记为弃用/);
    const byLabel = Object.fromEntries(buttons(view.tree).map((b) => [content(b), b]));
    byLabel["替换"].props.onClick();
    assert.deepEqual([...view.selection()].sort(), ["claude-fable-5-2", "claude-opus-5-5", "gone-1", "old-1"]);
    byLabel["改为 devin/claude-opus-5-5"].props.onClick();
    assert.ok(view.selection().has("devin/claude-opus-5-5") && !view.selection().has("claude-opus-5-5"));

    const done = render(h, { selected: ["claude-fable-5-2"] });
    assert.equal(nodes(done.tree, (n) => n.props.className === "dcpa-advice-item").length, 0, "nothing left once handled");
  });

  it("explains a recommendation in both languages", () => {
    const h = clientHarness();
    const detail = { id: "claude-fable-5-2", line: "claude-fable", released: "2026-11-09", source: "online" };
    const zh = h.recommendationReason((k) => h.zh[k] ?? k, detail);
    const en = h.recommendationReason((k) => h.en[k] ?? k, { ...detail, released: undefined, source: "name" });
    assert.equal(zh, "claude-fable 产品线的最新型号，2026-11-09 发布（依据：在线模型资料）");
    assert.equal(
      h.recommendationReason((k) => h.zh[k] ?? k, { ...detail, score: 64.6 }),
      "claude-fable 产品线的最新型号，2026-11-09 发布（依据：在线模型资料）；能力评分 64.6，接近本服务最强模型"
    );
    assert.equal(en, "Newest model of the claude-fable line (based on: version in the model name)");
    assert.equal(
      h.recommendationReason((k) => h.zh[k] ?? k, { id: "devin/swe-2", line: "swe", source: "name", via: "channel", channel: "devin" }),
      "devin 渠道自己最好的模型（swe 产品线）：每个接入的渠道至少推荐一个（依据：模型名称中的版本号）"
    );
    for (const key of Object.keys(h.zh)) assert.ok(key in h.en, `en is missing ${key}`);
  });
});
