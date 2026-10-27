// agent-generation behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("generate_media in the chat and the composer button", () => {
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));

  it("leaves a mirrored call to its top-level command row and keeps a fallback otherwise", () => {
    const h = clientHarness({ update: null, loading: false, fetch: async () => okJson({}) });
    const t = (key) => h.zh[key] ?? key;
    const owner = { callId: "toolu|01", phase: "start", block: { callId: "toolu|01", phase: "start", argsRaw: JSON.stringify({ kind: "video", mode: "extend", prompt: "镜头拉远", seconds: 4 }) } };
    const running = h.MediaToolRow({ t, sessionId: "s-1", owner });
    assert.equal(running.type, h.ImageCommandCard, "without a mirrored row the tool row is the fallback");
    assert.deepEqual(JSON.parse(JSON.stringify(running.props.node)), { name: "cpa-video-extend", commandId: "toolu_01", args: "-- 镜头拉远", outcome: { kind: "success" } });
    assert.equal(running.props.pending, true);
    const mirrored = h.MediaToolRow({
      t,
      sessionId: "s-1",
      owner,
      useChat: (selector) => selector({ order: ["c"], nodes: new Map([["c", { kind: h.MEDIA_NODE_KIND, data: { callId: "toolu|01" } }]]) }),
    });
    assert.equal(mirrored, null, "the mirrored command row already shows this run");
    const completedMirrored = h.MediaToolRow({ t, sessionId: "s-1", owner: { callId: "c3", phase: "result", block: { kind: "result", callId: "c3", meta: { commandRow: true }, call: { name: "generate_media", argsRaw: JSON.stringify({ kind: "image", prompt: "猫" }) }, content: [] } } });
    assert.equal(completedMirrored.type, h.ImageCommandCard, "metadata alone must not hide a call without a loaded custom counterpart");
    assert.equal(completedMirrored.props.showConfirm, false);
    const ownSnapshot = (selector) => selector({ order: ["c"], nodes: new Map([["c", { kind: h.MEDIA_NODE_KIND, data: { callId: "toolu|01" } }]]) });
    assert.equal(h.MediaCommandRow({ node: { commandId: "toolu_01" }, useChat: ownSnapshot }), null, "only correlated old mirrors are hidden");
    assert.equal(h.MediaCommandRow({ node: { commandId: "slash-command-uuid" }, useChat: ownSnapshot }).type, h.ImageCommandCard, "real slash commands remain");
    // An old settled call has no mirrored row: keep its own card.
    const failed = h.MediaToolRow({ t, sessionId: "s-1", owner: { callId: "c1", phase: "result", block: { kind: "result", callId: "c1", isError: true, call: { name: "generate_media", argsRaw: JSON.stringify({ kind: "image", prompt: "猫" }) }, content: [{ type: "text", text: "Error: the user declined these images; do not retry unless the user asks" }] } } });
    assert.equal(failed.props.node.name, "cpa-image");
    assert.equal(failed.props.pending, false);
    assert.deepEqual(JSON.parse(JSON.stringify(failed.props.node.outcome)), { kind: "error", text: "the user declined these images; do not retry unless the user asks" });
    const malformed = h.MediaToolRow({ t, standalone: true, owner: { callId: "bad-json", phase: "result", block: { kind: "tool-result", isError: true, call: { argsRaw: "{" }, content: [{ type: "text", text: "Error: invalid arguments" }] } } });
    assert.equal(malformed.props.node.outcome.kind, "error", "terminal errors take priority over malformed JSON arguments");
    assert.equal(malformed.props.pending, false);
    assert.equal(h.toolRunId("--"), null);
  });

  it("keeps cost confirmation at the composer, never inside a media chat card", async () => {
    const posts = [];
    const confirm = { kind: "video", en: "Generate a 4 s video with grok (BCPA): \"waves\".", zh: "用 grok（BCPA）生成 4 秒视频：「waves」。", expiresAt: "2026-10-22T13:00:00.000Z" };
    const session = { sessionId: "s-1", pendingConfirmations: [{ ...confirm, commandId: "toolu_9" }] };
    const h = clientHarness({
      fetch: async (url, options = {}) => {
        if (options.method === "POST") posts.push({ url: String(url), body: JSON.parse(options.body) });
        return okJson({ session });
      },
    });
    h.renderConfirmationDock({ sessionId: "s-1" });
    await flushClient();
    let tree = h.renderConfirmationDock({ sessionId: "s-1" });
    const box = nodes(tree, (n) => n.props.className === "dcpa-chat-confirm")[0];
    assert.ok(box, "confirmation is mounted independently of the chat at the composer dock");
    assert.ok(content(box).includes(confirm.zh));
    button(tree, h.zh.mediaConfirmAllow).props.onClick();
    button(tree, h.zh.mediaConfirmAllow).props.onClick();
    await flushClient();
    assert.deepEqual(posts, [{ url: "api/dsh-cliproxyapi/media/confirm", body: { sessionId: "s-1", commandId: "toolu_9", allow: true } }], "double click only answers once");
    assert.equal(h.renderConfirmationDock({ sessionId: "s-1" }), null);
    h.unmount();
    assert.equal(h.timers.size, 0);
    assert.equal(h.afterUnmountWrites, 0);
    const en = clientHarness({ update: session, loading: false });
    tree = en.renderConfirmationDock({ sessionId: "s-1" }, "en", false);
    assert.ok(content(tree).includes(confirm.en));
    assert.equal(en.renderConfirmationDock({ sessionId: "s-other" }, "en", false), null, "never display another session's question");
    const card = clientHarness({ update: { run: null, files: [], confirm }, loading: false });
    tree = card.renderCard({ node: { name: "cpa-video", commandId: "toolu_9", args: "-- waves", outcome: { kind: "success" } }, sessionId: "s-1", pending: true }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-confirm").length, 0, "a folded chat row has no consent controls");
  });

  it("sets this session's confirmation and limit in the composer button while the tool is on", async () => {
    const posts = [];
    const session = (agent) => ({
      sessionId: "s-1",
      options: { image: [{ ref: "default/grok-imagine-image", accountId: "default", accountName: "BCPA", modelId: "grok-imagine-image" }], video: [] },
      current: { image: { ref: "default/grok-imagine-image", source: "session" }, video: null },
      agent,
      recent: [],
    });
    const base = { enabled: true, imageConfirm: "auto", videoConfirm: "ask", videoBudget: { mode: "limited", seconds: 60 }, used: 12, sources: { imageConfirm: "global", videoConfirm: "global", videoBudget: "global" }, global: { imageConfirm: "auto", videoConfirm: "ask", videoBudget: { mode: "limited", seconds: 60 } } };
    const h = clientHarness({ update: session(base), loading: false, fetch: async (url, options = {}) => (options.method === "POST" && posts.push(JSON.parse(options.body)), okJson({ session: session(base) })) });
    nodes(h.renderChip({ sessionId: "s-1" }, "zh", false), (n) => n.type === "button" && n.props["data-kind"] === "image")[0].props.onClick();
    let tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    const agentButton = nodes(tree, (n) => n.type === "button" && n.props.className.includes("dcpa-m-agent-open"))[0];
    assert.ok(agentButton, "the model menu offers a separate agent settings button");
    agentButton.props.onClick();
    tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    const section = nodes(tree, (n) => n.props["data-kind"] === "agent")[0];
    assert.ok(section, "the agent section shows in its secondary menu while the tool is on");
    assert.ok(content(section).includes("本会话 agent 已用视频 12 / 60 秒"));
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-m-section").length, 0, "the model list is hidden in the agent menu");
    const selects = nodes(section, (n) => n.type === "select");
    assert.equal(selects.length, 3);
    assert.equal(selects[0].props.value, "inherit");
    assert.ok(content(selects[0]).includes("跟随全局（每次先问我）"));
    selects[0].props.onChange({ target: { value: "auto" } });
    await flushClient();
    selects[2].props.onChange({ target: { value: "limited:300" } });
    await flushClient();
    selects[2].props.onChange({ target: { value: "inherit" } });
    await flushClient();
    assert.deepEqual(posts, [
      { sessionId: "s-1", videoConfirm: "auto" },
      { sessionId: "s-1", videoBudget: { mode: "limited", seconds: 300 } },
      { sessionId: "s-1", videoBudget: "inherit" },
    ]);
    const off = clientHarness({ update: session({ ...base, enabled: false }), loading: false, fetch: async () => okJson({}) });
    nodes(off.renderChip({ sessionId: "s-1" }, "zh", false), (n) => n.type === "button")[0].props.onClick();
    tree = off.renderChip({ sessionId: "s-1" }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props["data-kind"] === "agent").length, 0, "hidden while the tool is off");
  });
});
