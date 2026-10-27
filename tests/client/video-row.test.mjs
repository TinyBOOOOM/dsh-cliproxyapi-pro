// video-row behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("/cpa-video chat row and video model picker", () => {
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));
  const node = { name: "cpa-video", commandId: "cmd-v-1", args: "-s 8 -r 480p 海浪", outcome: { kind: "success", text: "Submitting a 8 s 480p video" } };
  const run = (overrides = {}) => ({
    commandId: "cmd-v-1", kind: "video", status: "running", model: "default/grok-imagine-video", modelName: "grok-imagine-video", accountName: "BCPA",
    prompt: "海浪", seconds: 8, resolution: "480p", count: 1, references: 1, files: 0, startedAt: new Date(Date.now() - 75_000).toISOString(), ...overrides,
  });

  it("shows the video's phase and progress, polls every 3 s, then plays the saved file", async () => {
    let body = { run: { ...run(), phase: "running", progress: 40 }, files: [] };
    const h = clientHarness({ fetch: async () => okJson(body) });
    h.renderCard({ node, sessionId: "s-1" });
    await flushClient();
    let tree = h.renderCard({ node, sessionId: "s-1" }, "zh");
    assert.equal(content(nodes(tree, (n) => n.props.className === "dcpa-chat-tags")[0]), "/cpa-video8 秒480p复制原始输入");
    assert.equal(content(nodes(tree, (n) => n.props.className === "dcpa-chat-mode")[0]), h.zh.mediaSentFirstFrame, "the reply says the image was the first frame");
    assert.match(content(tree), /正在生成 40% · 1 分 1[45] 秒/);
    assert.ok(content(tree).includes(h.zh.mediaCardVideoNoStop));
    const skeleton = nodes(tree, (n) => n.props.className === "dcpa-chat-skeleton");
    assert.equal(skeleton.length, 1);
    assert.equal(skeleton[0].props.style.aspectRatio, "16 / 9", "xAI's default ratio");
    const poll = [...h.timers.entries()].find(([, x]) => x.ms === 3000);
    assert.ok(poll, "looks again in 3 s");
    body = { run: run({ status: "done", folder: "generated", finishedAt: new Date().toISOString(), files: 1 }), files: [{ id: "abcdef0123456789", kind: "video", name: "clip.mp4", path: "D:\\w\\generated\\clip.mp4" }], desktop: "explorer" };
    h.timers.delete(poll[0]);
    poll[1].fn();
    await flushClient();
    tree = h.renderCard({ node, sessionId: "s-1" }, "zh", false);
    const player = nodes(tree, (n) => n.type === "video")[0];
    assert.equal(player.props.src, "api/dsh-cliproxyapi/media/file?sessionId=s-1&id=abcdef0123456789");
    assert.equal(player.props.controls, true);
    assert.match(content(tree), /用时 1 分 1[45] 秒 · 已保存到 generated/);
    player.props.onContextMenu({ clientX: 5, clientY: 5 });
    tree = h.renderCard({ node, sessionId: "s-1" }, "zh", false);
    assert.deepEqual(nodes(tree, (n) => n.props.role === "menuitem").map(content), [h.zh.mediaActCopyPath], "no 'copy image' for a video; open items need a desktop");
  });

  it("names the queued and saving phases and an expired video", () => {
    const queued = clientHarness({ update: { run: { ...run(), phase: "queued" }, files: [] }, loading: false, fetch: async () => okJson({}) });
    assert.match(content(queued.renderCard({ node, sessionId: "s-1" }, "en", false)), /Queued · 1 min 1[45] s/);
    const saving = clientHarness({ update: { run: { ...run(), phase: "downloading" }, files: [] }, loading: false, fetch: async () => okJson({}) });
    assert.match(content(saving.renderCard({ node, sessionId: "s-1" }, "zh", false)), /正在保存视频/);
    const expired = clientHarness({ update: { run: run({ status: "error", errorCode: "expired", error: "x" }), files: [] }, loading: false, fetch: async () => okJson({}) });
    const tree = expired.renderCard({ node, sessionId: "s-1" }, "zh", false);
    assert.equal(content(nodes(tree, (n) => n.props.role === "alert")[0]), expired.zh.mediaRunErrExpired);
  });

  it("the composer button lists image and video models and saves each kind", async () => {
    const session = {
      sessionId: "s-1",
      options: {
        image: [{ ref: "default/grok-imagine-image", accountId: "default", accountName: "BCPA", modelId: "grok-imagine-image", name: "grok-imagine-image" }],
        video: [{ ref: "default/grok-imagine-video", accountId: "default", accountName: "BCPA", modelId: "grok-imagine-video", name: "grok-imagine-video" }],
      },
      current: { image: { ref: "default/grok-imagine-image", source: "session" }, video: { ref: "default/grok-imagine-video", source: "only" } },
      recent: [],
    };
    const posts = [];
    const h = clientHarness({ update: session, loading: false, fetch: async (url, options = {}) => (options.method === "POST" && posts.push(JSON.parse(options.body)), okJson({ session })) });
    const chipButton = (tree, kind) => nodes(tree, (n) => n.type === "button" && n.props["data-kind"] === kind)[0];
    let tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    assert.equal(chipButton(tree, "image").props["aria-label"], "生图模型：grok-imagine-image");
    assert.equal(chipButton(tree, "video").props["aria-label"], "生视频模型：grok-imagine-video");
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-m-chip-part").length, 2);
    chipButton(tree, "image").props.onClick();
    tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    let sections = nodes(tree, (n) => n.props.className === "dcpa-m-section");
    assert.deepEqual(sections.map((n) => n.props["data-kind"]), ["image"], "the image button opens only image models");
    nodes(sections[0], (n) => n.props.role === "menuitemradio")[0].props.onClick();
    await flushClient();
    assert.deepEqual(posts[0], { sessionId: "s-1", kind: "image", ref: "default/grok-imagine-image" });
    chipButton(tree, "video").props.onClick();
    tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    sections = nodes(tree, (n) => n.props.className === "dcpa-m-section");
    assert.deepEqual(sections.map((n) => n.props["data-kind"]), ["video"], "the video button opens only video models");
    assert.ok(content(sections[0]).includes(h.zh.mediaChipInherited), "the video pick is inherited here");
    nodes(sections[0], (n) => n.props.role === "menuitemradio")[0].props.onClick();
    await flushClient();
    assert.deepEqual(posts[1], { sessionId: "s-1", kind: "video", ref: "default/grok-imagine-video" });
  });
});
