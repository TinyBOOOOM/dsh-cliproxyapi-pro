// video-edit behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("video modes, edit and extend in the chat row", () => {
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));
  const base = { commandId: "cmd-v-1", kind: "video", status: "done", model: "default/grok-imagine-video-1.5", modelName: "grok-imagine-video-1.5", accountName: "BCPA", prompt: "跳舞", seconds: 6, resolution: "480p", count: 1, references: 0, files: 1, startedAt: "2026-10-22T07:00:00.000Z", finishedAt: "2026-10-22T07:00:40.000Z", folder: "generated" };
  const files = [{ id: "abcdef0123456789", kind: "video", name: "a.mp4", path: "D:\\w\\generated\\a.mp4" }];
  const node = { name: "cpa-video", commandId: "cmd-v-1", args: "跳舞", outcome: { kind: "success", text: "Submitting" } };

  it("states in the reply which mode was sent and, for edits, where the source came from", () => {
    const modeOf = (run, name = "cpa-video", lang = "zh") => {
      const h = clientHarness({ update: { run, files }, loading: false, fetch: async () => okJson({}) });
      const tree = h.renderCard({ node: { ...node, name }, sessionId: "s-1" }, lang, false);
      const line = nodes(tree, (n) => n.props.className === "dcpa-chat-mode")[0];
      return { text: line ? content(line) : null, mode: line?.props["data-mode"], tags: content(nodes(tree, (n) => n.props.className === "dcpa-chat-tags")[0]).replace(/复制原始输入$|Copy original input$/, "") };
    };
    let row = modeOf({ ...base, mode: "reference", references: 3 });
    assert.equal(row.text, "模式：参考图 ×3 — 带入图中的人物、服装、物品，不锁定第一帧");
    assert.equal(row.tags, "/cpa-video6 秒480p", "the user side keeps only what was asked");
    assert.equal(modeOf({ ...base, mode: "first-frame", references: 1 }).text, "模式：首帧 — 附带的图片就是视频的第一帧");
    assert.equal(modeOf({ ...base, references: 1 }).mode, "first-frame", "an old run with an image was a first frame");
    assert.equal(modeOf({ ...base }).text, "模式：纯文字生成（没有附带图片）");
    assert.equal(modeOf({ ...base, mode: "first-last", references: 2 }).text, "模式：首尾帧 — 第 1 张图是第一帧，第 2 张图是最后一帧");
    assert.equal(modeOf({ ...base, mode: "last-frame", references: 1 }).mode, "last-frame");
    row = modeOf({ ...base, mode: "extend", seconds: 4, resolution: undefined, sourceKind: "link", sourceCommandId: "cmd-v-0" }, "cpa-video-extend");
    assert.equal(row.text, "模式：延长 +4 秒（grok-imagine-video）— 原视频：本会话生成的视频（xAI 结果链接）");
    assert.equal(row.tags, "/cpa-video-extend");
    row = modeOf({ ...base, mode: "edit", resolution: undefined, sourceKind: "upload", sourceName: "clip.mp4", ignored: ["480p"] }, "cpa-video-edit");
    assert.equal(row.text, "模式：编辑视频（grok-imagine-video）— 原视频：上传本地文件 clip.mp4");
    assert.match(row.tags, /已忽略 480p/);
    row = modeOf({ ...base, mode: "edit", resolution: undefined, sourceKind: "url", sourceName: "example.com" }, "cpa-video-edit", "en");
    assert.equal(row.text, "Mode: video edit (grok-imagine-video) — source: public link (example.com), downloaded by xAI");
    const image = modeOf({ ...base, kind: "image", references: 2 }, "cpa-image");
    assert.equal(image.text, "模式：改图 — 2 张附带图片作为参考");
  });

  it("says which parameters the chat model read, and that it is reading them", () => {
    const linesOf = (run) => {
      const h = clientHarness({ update: { run, files }, loading: false, fetch: async () => okJson({}) });
      const tree = h.renderCard({ node, sessionId: "s-1" }, "zh", false);
      return {
        interp: nodes(tree, (n) => n.props["data-interpreted"] !== undefined).map((n) => content(n))[0] ?? null,
        status: content(nodes(tree, (n) => n.props.className === "dcpa-chat-status")[0]),
      };
    };
    assert.equal(linesOf({ ...base, interpreted: { by: "cli-proxy/gpt-5.5", items: ["10s", "9:16"], prompt: true } }).interp, "参数由 cli-proxy/gpt-5.5 从提示词中读出：10s · 9:16；已从提示词中去掉这些参数的说法");
    assert.equal(linesOf({ ...base, interpreted: { by: "p/m", items: [] } }).interp, "p/m 没有从提示词中读出其他参数");
    assert.equal(linesOf({ ...base, interpreted: { by: "p/m", items: [], failed: true } }).interp, "参数解读失败（p/m），按命令里的选项和原文发送");
    assert.equal(linesOf({ ...base }).interp, null);
    assert.match(linesOf({ ...base, status: "running", phase: "interpreting", finishedAt: undefined }).status, /^正在理解参数 · /);
  });

  it("offers edit / extend while the host still has the video's link, and submits a follow-up command", async () => {
    const lines = [];
    const runCommand = async (sessionId, line) => (lines.push([sessionId, line]), { ok: true });
    const h = clientHarness({ update: { run: base, files, actions: { edit: true, extend: true, expiresAt: "2026-10-22T08:00:00.000Z" } }, loading: false, fetch: async () => okJson({}) });
    let tree = h.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    const extend = nodes(tree, (n) => n.type === "button" && content(n) === h.zh.mediaExtendOpen)[0];
    assert.ok(nodes(tree, (n) => n.type === "button" && content(n) === h.zh.mediaEditOpen)[0], "edit is offered too");
    extend.props.onClick();
    tree = h.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    nodes(tree, (n) => n.type === "textarea")[0].props.onChange({ target: { value: "  然后转身离开 " } });
    tree = h.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    nodes(tree, (n) => n.type === "select" && n.props["aria-label"] === h.zh.mediaExtendSeconds)[0].props.onChange({ target: { value: "4" } });
    tree = h.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    nodes(tree, (n) => n.type === "button" && content(n) === h.zh.mediaExtendSubmit)[0].props.onClick();
    await flushClient();
    assert.deepEqual(lines, [["s-1", "/cpa-video-extend --from cmd-v-1 -s 4 -- 然后转身离开"]]);
    tree = h.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    assert.equal(nodes(tree, (n) => n.type === "textarea").length, 0, "the form closes");
    assert.ok(content(tree).includes(h.zh.mediaEditSubmitted));

    const gone = clientHarness({ update: { run: base, files }, loading: false, fetch: async () => okJson({}) });
    tree = gone.renderCard({ node, sessionId: "s-1", runCommand }, "zh", false);
    assert.equal(nodes(tree, (n) => n.type === "button" && content(n) === gone.zh.mediaEditOpen).length, 0, "no link, no edit");
  });

  it("runs follow-up commands through DSH's remote.commands service", async () => {
    const h = clientHarness();
    const live = [];
    const executed = [];
    const ctx = {
      effect(fn) { return fn(); },
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: { inject: (_name, fn) => fn(), register: (meta, render) => (live.push({ meta, render }), () => {}) },
      inject(_names, fn) { fn({ slots: ctx.slots, modelDirectories: { directoryFor: () => ({ store: null }) } }); },
      get: (name) => (name === "remote.commands" ? { execute: async (...args) => (executed.push(args), { ok: true, value: { result: { kind: args[1].includes("bad") ? "error" : "success", text: "nope" } } }) } : undefined),
    };
    h.apply(ctx);
    const row = live.find((e) => e.meta.name === "conversation.chat.commandview" && e.meta.key === "cpa-video-extend");
    const runCommand = row.render({ node: { name: "cpa-video-extend" }, sessionId: "s-1" }).props.runCommand;
    assert.equal(JSON.stringify(await runCommand("s-1", "/cpa-video-extend -- go")), JSON.stringify({ ok: true }));
    assert.equal(JSON.stringify(await runCommand("s-1", "/cpa-video-extend -- bad")), JSON.stringify({ ok: false, text: "nope" }));
    assert.deepEqual(JSON.parse(JSON.stringify(executed[0])), ["s-1", "/cpa-video-extend -- go", []]);
  });
});

