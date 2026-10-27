// model-button behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("generation-model button", () => {
  const session = (overrides = {}) => ({
    sessionId: "s-1",
    options: {
      image: [
        { ref: "default/grok-imagine-image", accountId: "default", accountName: "BCPA", modelId: "grok-imagine-image" },
        { ref: "account-2/gpt-image-2", accountId: "account-2", accountName: "ZZ", modelId: "gpt-image-2" },
      ],
      video: [],
    },
    current: { image: { ref: "default/grok-imagine-image", source: "last" }, video: null },
    recent: [{ id: "abcdef0123456789", kind: "image", name: "20261022-x.png", model: "default/grok-imagine-image", createdAt: "" }],
    ...overrides,
  });
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));

  it("renders nothing without image models and the current model otherwise", async () => {
    const empty = session({ options: { image: [], video: [] } });
    const none = clientHarness({ update: empty, loading: false, fetch: async () => okJson({ session: empty }) });
    assert.equal(none.renderChip({ sessionId: "s-1" }), null);
    await flushClient();
    assert.deepEqual([...none.timers.values()].map((x) => x.ms), [3000], "retries soon while no image model is known");
    none.unmount();
    assert.equal(none.timers.size, 0, "the retry is cleared on unmount");
    const h = clientHarness({ update: session(), loading: false, fetch: async () => okJson({ session: session() }) });
    for (const language of ["zh", "en"]) {
      const tree = h.renderChip({ sessionId: "s-1" }, language, false);
      const button = nodes(tree, (n) => n.type === "button")[0];
      assert.equal(button.props["aria-label"], h[language].mediaChipLabel.replace("{model}", "grok-imagine-image"));
      assert.equal(button.props["aria-haspopup"], "dialog");
      assert.equal(button.props.title, undefined, "no title attribute");
    }
  });

  it("keeps retrying while the host reports an incomplete catalog", async () => {
    const video = { ref: "default/grok-imagine-video", accountId: "default", accountName: "BCPA", modelId: "grok-imagine-video", name: "Grok Video" };
    const partial = session({
      options: { image: [], video: [video] },
      current: { image: null, video: { ref: video.ref, source: "last" } },
      catalogIncomplete: true,
    });
    const full = session({
      options: { image: session().options.image, video: [video] },
      current: { image: { ref: "default/grok-imagine-image", source: "last" }, video: { ref: video.ref, source: "last" } },
      catalogIncomplete: false,
    });
    let calls = 0;
    const h = clientHarness({
      update: partial,
      loading: false,
      fetch: async () => okJson({ session: ++calls === 1 ? partial : full }),
    });
    let tree = h.renderChip({ sessionId: "s-1" });
    await flushClient();
    tree = h.renderChip({ sessionId: "s-1" });
    const byKind = (root, kind) => nodes(root, (n) => n.type === "button" && n.props["data-kind"] === kind)[0];
    assert.equal(
      byKind(tree, "video").props["aria-label"],
      h.zh.mediaChipVideoLabel.replace("{model}", "Grok Video"),
      "a video model alone is shown first"
    );
    assert.equal(byKind(tree, "image"), undefined, "no image button without image models");
    assert.deepEqual([...h.timers.values()].map((x) => x.ms), [3000], "retries although a video model is already known");
    [...h.timers.values()][0].fn();
    tree = h.renderChip({ sessionId: "s-1" });
    await flushClient();
    tree = h.renderChip({ sessionId: "s-1" });
    assert.equal(
      byKind(tree, "image").props["aria-label"],
      h.zh.mediaChipLabel.replace("{model}", "grok-imagine-image"),
      "the image model gets its own button once the catalog is complete"
    );
    assert.equal(byKind(tree, "video").props["aria-label"], h.zh.mediaChipVideoLabel.replace("{model}", "Grok Video"));
    h.unmount();
    assert.equal(h.timers.size, 0, "the retry is cleared on unmount");
  });

  it("opens a model list grouped by account, and switches the session's model", async () => {
    const posts = [];
    const h = clientHarness({
      update: session(),
      loading: false,
      fetch: async (url, options = {}) => {
        if (options.method === "POST") {
          posts.push({ url, body: JSON.parse(options.body) });
          return okJson({ session: session({ current: { image: { ref: "account-2/gpt-image-2", source: "session" }, video: null } }) });
        }
        return okJson({ session: session() });
      },
    });
    let tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    nodes(tree, (n) => n.type === "button")[0].props.onClick();
    tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    const dialog = nodes(tree, (n) => n.props.role === "dialog")[0];
    assert.ok(dialog, "the popover opens");
    assert.ok(content(dialog).includes(h.zh.mediaChipInherited), "explains an inherited pick");
    assert.deepEqual(nodes(dialog, (n) => n.props.role === "group").map((g) => g.props["aria-label"]), ["BCPA", "ZZ"]);
    const items = nodes(dialog, (n) => n.props.role === "menuitemradio");
    assert.deepEqual(items.map((i) => i.props["aria-checked"]), [true, false]);
    items[1].props.onClick();
    await flushClient();
    assert.deepEqual(posts[0], { url: "api/dsh-cliproxyapi/media/session/save", body: { sessionId: "s-1", kind: "image", ref: "account-2/gpt-image-2" } });
    tree = h.renderChip({ sessionId: "s-1" }, "zh", false);
    assert.equal(nodes(tree, (n) => n.type === "button")[0].props["aria-label"], h.zh.mediaChipLabel.replace("{model}", "gpt-image-2"));

    assert.ok(nodes(tree, (n) => n.props.role === "dialog")[0], "still open");
    assert.equal(nodes(tree, (n) => n.type === "img").length, 0, "no recent thumbnails in the picker");
  });

  it("without a session it still picks the default model and shows no files", async () => {
    const posts = [];
    const h = clientHarness({
      update: session({ sessionId: null }),
      loading: false,
      fetch: async (url, options = {}) => {
        if (options.method === "POST") posts.push(JSON.parse(options.body));
        return okJson({ session: session({ sessionId: null }) });
      },
    });
    let tree = h.renderChip({ sessionId: null, placement: "hero" }, "zh", false);
    nodes(tree, (n) => n.type === "button")[0].props.onClick();
    tree = h.renderChip({ sessionId: null, placement: "hero" }, "zh", false);
    assert.equal(nodes(tree, (n) => n.type === "img").length, 0);
    nodes(tree, (n) => n.props.role === "menuitemradio")[1].props.onClick();
    await flushClient();
    assert.deepEqual(posts[0], { kind: "image", ref: "account-2/gpt-image-2" });
  });

  it("aborts its load on unmount", async () => {
    let signal;
    let resolve;
    const h = clientHarness({ fetch: (_url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); } });
    h.renderChip({ sessionId: "s-1" });
    h.unmount();
    assert.equal(signal.aborted, true);
    resolve(new Response(JSON.stringify({ ok: true, session: session() })));
    await flushClient();
    assert.equal(h.afterUnmountWrites, 0);
  });
});

