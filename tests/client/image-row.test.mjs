// image-row behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("/cpa-image chat row", () => {
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));
  const done = {
    name: "cpa-image",
    commandId: "cmd-abc-7",
    args: "--aspect 16:9 -n 2 一只橘猫",
    outcome: { kind: "success", text: "Generating 2 image(s) with gpt-image-2 (BCPA); files go to D:\\x\\generated" },
  };
  const run = (overrides = {}) => ({
    commandId: "cmd-abc-7",
    kind: "image",
    status: "done",
    model: "default/gpt-image-2",
    modelName: "gpt-image-2",
    accountName: "BCPA",
    prompt: "一只橘猫",
    aspect: "16:9",
    count: 2,
    references: 0,
    files: 2,
    startedAt: "2026-10-22T07:00:00.000Z",
    finishedAt: "2026-10-22T07:00:09.000Z",
    folder: "generated",
    ...overrides,
  });
  const files = [
    { id: "aaaaaaaaaaaaaaaa", kind: "image", name: "a-1.png", path: "D:\\x\\generated\\a-1.png" },
    { id: "bbbbbbbbbbbbbbbb", kind: "image", name: "a-2.png", path: "D:\\x\\generated\\a-2.png" },
  ];

  it("shows the request as a user bubble and the images as the reply, and enlarges one on click", async () => {
    const urls = [];
    const h = clientHarness({ fetch: async (url) => (urls.push(url), okJson({ run: run(), files })) });
    let tree = h.renderCard({ node: done, sessionId: "s-1" });
    await flushClient();
    assert.deepEqual(urls, ["api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-abc-7"]);
    tree = h.renderCard({ node: done, sessionId: "s-1" }, "zh", false);
    const bubble = nodes(tree, (n) => n.props.className === "dcpa-chat-bubble")[0];
    assert.equal(content(bubble), "一只橘猫", "the prompt without options");
    assert.equal(content(nodes(tree, (n) => n.props.className === "dcpa-chat-tags")[0]), "/cpa-image16:92 张复制原始输入", "tags, then a button that copies the line as typed");
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-copy" && n.type === "button").length, 1);
    assert.ok(content(tree).includes("gpt-image-2 · BCPA"));
    assert.ok(content(tree).includes("用时 9 秒 · 已保存到 generated"));
    const thumbs = nodes(tree, (n) => n.props.className === "dcpa-chat-thumb");
    assert.deepEqual(thumbs.map((b) => b.props["aria-label"]), ["图片 1", "图片 2"]);
    assert.equal(nodes(thumbs[1], (n) => n.type === "img")[0].props.src, "api/dsh-cliproxyapi/media/file?sessionId=s-1&id=bbbbbbbbbbbbbbbb");
    assert.equal(h.timers.size, 0, "a finished run is not polled");
    thumbs[1].props.onClick();
    tree = h.renderCard({ node: done, sessionId: "s-1" }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-thumb").length, 0);
    assert.equal(nodes(tree, (n) => n.type === "a").length, 0, "no new-window link (the desktop shell opens it without the session)");
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-full-btn").length, 1);
    assert.equal(nodes(tree, (n) => n.type === "details").length, 1, "file names stay available");
  });

  it("opens, reveals and copies through the context menu, and links the folder and files", async () => {
    const opened = [];
    const asked = [];
    const fileActions = {
      available: async () => true,
      applications: async (path) => (asked.push(path), [
        { id: "C:\\paint.exe", name: "Paint", icon: "javascript:alert(1)", default: false },
        { id: "C:\\photos.exe", name: "Photos", icon: "data:image/png;base64,AAAA", default: true },
      ]),
      open: async (path, action, application) => (opened.push([path, action, application]), true),
    };
    const h = clientHarness({ fetch: async () => okJson({ run: run(), files, folderPath: "D:\\x\\generated", desktop: "explorer" }) });
    h.renderCard({ node: done, sessionId: "s-1", fileActions });
    await flushClient();
    let tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh");
    await flushClient();
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    let prevented = false;
    nodes(tree, (n) => n.props.className === "dcpa-chat-thumb")[1].props.onContextMenu({ preventDefault: () => (prevented = true), clientX: 40, clientY: 50 });
    assert.equal(prevented, true, "replaces the browser menu");
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    assert.deepEqual(nodes(nodes(tree, (n) => n.props.role === "menu")[0], (n) => n.props.role === "menuitem").map(content), [h.zh.mediaActOpen, "在文件资源管理器中显示", h.zh.mediaActCopyImage, h.zh.mediaActCopyPath], "a stand-in while the applications load");
    await flushClient();
    assert.deepEqual(asked, ["D:\\x\\generated\\a-2.png"]);
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    const menu = nodes(tree, (n) => n.props.role === "menu")[0];
    const items = nodes(menu, (n) => n.props.role === "menuitem");
    assert.deepEqual(items.map(content), ["用 Photos 打开（默认）", "用 Paint 打开", "在文件资源管理器中显示", h.zh.mediaActCopyImage, h.zh.mediaActCopyPath]);
    assert.equal(nodes(menu, (n) => n.props.role === "separator").length, 2);
    const icons = nodes(menu, (n) => n.type === "img").map((n) => n.props.src);
    assert.deepEqual(icons, ["data:image/png;base64,AAAA"], "only image icons are rendered");
    items[1].props.onClick();
    await flushClient();
    assert.deepEqual(opened, [["D:\\x\\generated\\a-2.png", "open", "C:\\paint.exe"]]);
    nodes(tree, (n) => n.props.className === "dcpa-chat-thumb")[1].props.onContextMenu({ clientX: 40, clientY: 50 });
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    nodes(tree, (n) => n.props.role === "menuitem")[2].props.onClick();
    await flushClient();
    assert.deepEqual(opened[1], ["D:\\x\\generated\\a-2.png", "reveal", undefined]);
    assert.equal(asked.length, 1, "applications are asked once per file");
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.role === "menu").length, 0, "a pick closes the menu");
    const links = nodes(tree, (n) => n.props.className === "dcpa-chat-link");
    assert.deepEqual(links.map(content), ["D:\\x\\generated", "a-1.png", "a-2.png"]);
    links[0].props.onClick();
    await flushClient();
    assert.deepEqual(opened[2], ["D:\\x\\generated", "open", undefined]);
    // No clipboard in this harness: the copy reports its failure instead of throwing.
    nodes(tree, (n) => n.props.className === "dcpa-chat-thumb")[0].props.onContextMenu({ clientX: 1, clientY: 1 });
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    await flushClient();
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    nodes(tree, (n) => n.props.role === "menuitem").find((n) => content(n) === h.zh.mediaActCopyImage).props.onClick();
    await flushClient();
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.role === "status" && n.props["data-tone"] === "error").length, 1);
    // The buttons under an enlarged image name the file manager too.
    nodes(tree, (n) => n.props.className === "dcpa-chat-thumb")[0].props.onClick();
    tree = h.renderCard({ node: done, sessionId: "s-1", fileActions }, "zh", false);
    assert.deepEqual(nodes(nodes(tree, (n) => n.props.className === "dcpa-chat-full")[0], (n) => n.type === "button" && n.props.className === "dcpa-q-btn").map(content), [h.zh.mediaActOpen, "在文件资源管理器中显示", h.zh.mediaActCopyImage, h.zh.mediaActCopyPath, h.zh.mediaClosePreview]);

    const plain = clientHarness({ update: { run: run(), files, folderPath: "D:\\x\\generated" }, loading: false, fetch: async () => okJson({}) });
    tree = plain.renderCard({ node: done, sessionId: "s-1" }, "en", false);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-link").length, 0, "without a desktop the paths are plain text");
    nodes(tree, (n) => n.props.className === "dcpa-chat-thumb")[0].props.onContextMenu({ clientX: 1, clientY: 1 });
    tree = plain.renderCard({ node: done, sessionId: "s-1" }, "en", false);
    assert.deepEqual(nodes(tree, (n) => n.props.role === "menuitem").map(content), [plain.en.mediaActCopyImage, plain.en.mediaActCopyPath]);
  });

  it("polls a running run with placeholders, then shows its result", async () => {
    let body = { run: run({ status: "running", finishedAt: undefined, folder: undefined, files: 0 }), files: [] };
    const h = clientHarness({ fetch: async () => okJson(body) });
    let tree = h.renderCard({ node: done, sessionId: "s-1" });
    assert.ok(content(tree).includes(h.zh.mediaCardSubmitting));
    await flushClient();
    tree = h.renderCard({ node: done, sessionId: "s-1" }, "zh");
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-skeleton").length, 2);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-skeleton")[0].props.style.aspectRatio, "16 / 9");
    assert.ok(content(tree).includes(h.zh.mediaCardNoStop));
    assert.equal(nodes(tree, (n) => n.props["data-tone"] === "running").length, 1);
    const poll = [...h.timers.entries()].find(([, x]) => x.ms === 2000);
    assert.ok(poll, "looks again in 2 s");
    body = { run: run(), files };
    h.timers.delete(poll[0]);
    poll[1].fn();
    await flushClient();
    tree = h.renderCard({ node: done, sessionId: "s-1" }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-thumb").length, 2);
    assert.equal(nodes(tree, (n) => n.props.className === "dcpa-chat-skeleton").length, 0);
  });

  it("shows admission errors, background failures and missing files", async () => {
    let calls = 0;
    const h = clientHarness({ fetch: async () => (calls++, okJson({ run: null, files: [] })) });
    let tree = h.renderCard({ node: { name: "cpa-image", commandId: "cmd-abc-8", args: "x", outcome: null }, sessionId: "s-1" });
    assert.ok(content(tree).includes(h.zh.mediaCardSubmitting));
    const failed = h.renderCard({ node: { name: "cpa-image", commandId: "cmd-abc-8", args: "x", outcome: { kind: "error", text: "/cpa-image: add a prompt" } }, sessionId: "s-1" }, "en");
    assert.equal(content(nodes(failed, (n) => n.props.role === "alert")[0]), "add a prompt");
    await flushClient();
    assert.equal(calls, 0, "nothing to load before admission or after an admission error");

    const broken = clientHarness({ update: { run: run({ status: "error", errorCode: "interrupted", error: "stopped" }), files: [] }, loading: false, fetch: async () => okJson({}) });
    tree = broken.renderCard({ node: done, sessionId: "s-1" }, "zh", false);
    assert.equal(content(nodes(tree, (n) => n.props.role === "alert")[0]), broken.zh.mediaRunErrInterrupted);
    const upstream = clientHarness({ update: { run: run({ status: "error", errorCode: "upstream-error", error: "CPA rejected the request (HTTP 429)" }), files: [] }, loading: false, fetch: async () => okJson({}) });
    tree = upstream.renderCard({ node: done, sessionId: "s-1" }, "en", false);
    assert.equal(content(nodes(tree, (n) => n.props.role === "alert")[0]), "CPA rejected the request (HTTP 429)");

    const gone = clientHarness({ update: { run: null, files: [] }, loading: false, fetch: async () => okJson({ files: [] }) });
    tree = gone.renderCard({ node: done, sessionId: "s-1" }, "en", false);
    assert.ok(content(tree).includes(gone.en.mediaCardMissing));
  });

  it("aborts its request and timers on unmount", async () => {
    let signal;
    let resolve;
    const h = clientHarness({ fetch: (_url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); } });
    h.renderCard({ node: done, sessionId: "s-1" });
    h.unmount();
    assert.equal(signal.aborted, true);
    assert.equal(h.timers.size, 0);
    resolve(new Response(JSON.stringify({ ok: true, run: null, files: [] })));
    await flushClient();
    assert.equal(h.afterUnmountWrites, 0);
  });
});
