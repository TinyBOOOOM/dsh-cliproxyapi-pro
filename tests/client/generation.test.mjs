// generation behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("generation tab", () => {
  const media = (overrides = {}) => ({
    settings: { agentTool: false, videoConfirm: "ask" },
    accounts: [
      {
        id: "default",
        displayName: "BCPA",
        discovered: 4,
        disabledModels: [],
        kindOverrides: {},
        chatModelIds: ["grok-4.6"],
        models: [
          { id: "grok-imagine-image", kind: "image", detectedKind: "image", enabled: true, overridden: false },
          { id: "sora-2", kind: "video", detectedKind: "video", aliasOf: "grok-imagine-video", enabled: true, overridden: false },
        ],
        ...overrides,
      },
    ],
  });
  const account = { id: "default", status: { refreshedAt: "2026-10-22T06:00:00.000Z", totalDiscovered: 4 } };
  const okJson = (body) => new Response(JSON.stringify({ ok: true, ...body }));

  it("lists image and video models with accessible switches in both languages", () => {
    const h = clientHarness({ update: media(), loading: false, fetch: async () => okJson({ media: media() }) });
    for (const language of ["zh", "en"]) {
      const tree = h.renderMedia({ account }, language, false);
      const text = content(tree);
      assert.ok(text.includes(h[language].mediaImageGroup));
      assert.ok(text.includes(h[language].mediaVideoGroup));
      assert.ok(text.includes("→ grok-imagine-video"), "the Sora alias is labelled");
      const switches = nodes(tree, (n) => n.props.role === "switch");
      assert.equal(switches.length, 3, "two models and the agent switch");
      assert.equal(switches[2].props["aria-label"], h[language].mediaAgentTitle);
      assert.equal(switches[2].props["aria-checked"], false, "the agent tool is off by default");
      assert.equal(switches[0].props["aria-checked"], true);
      assert.equal(switches[0].props["aria-label"], h[language].mediaEnabledLabel.replace("{model}", "grok-imagine-image"));
      assert.ok(button(tree, h[language].diagRun), "the diagnostic is offered");
      assert.equal(nodes(tree, (n) => n.props.title !== undefined).length, 0, "help text uses InfoTip, not title attributes");
    }
  });

  it("switches the agent tool and saves its confirmation and seconds limit", async () => {
    const posts = [];
    const on = { ...media(), settings: { ...media().settings, agentTool: true, videoConfirm: "ask", imageConfirm: "auto", videoBudget: { mode: "limited", seconds: 90 } } };
    const h = clientHarness({ update: media(), loading: false, fetch: async (url, options = {}) => (options.method === "POST" && posts.push(JSON.parse(options.body)), okJson({ media: on })) });
    let tree = h.renderMedia({ account }, "zh", false);
    const agentSwitch = nodes(tree, (n) => n.props.role === "switch" && n.props["aria-label"] === h.zh.mediaAgentTitle)[0];
    assert.ok(nodes(tree, (n) => n.type === "select" && n.props.disabled === true).length >= 3, "its options wait for the switch");
    agentSwitch.props.onClick();
    await flushClient();
    assert.deepEqual(posts[0], { agentTool: true });
    tree = h.renderMedia({ account }, "zh", false);
    const budget = nodes(tree, (n) => n.type === "select" && n.props["aria-label"] === h.zh.mediaVideoBudget)[0];
    assert.equal(budget.props.value, "limited:90");
    assert.ok(nodes(budget, (n) => n.type === "option").some((o) => o.props.value === "limited:90"), "a custom limit stays listed");
    budget.props.onChange({ target: { value: "unlimited" } });
    await flushClient();
    assert.deepEqual(posts[1], { videoBudget: { mode: "unlimited" } });
    tree = h.renderMedia({ account }, "zh", false);
    const confirm = nodes(tree, (n) => n.type === "select" && n.props.value === "ask")[0];
    confirm.props.onChange({ target: { value: "auto" } });
    await flushClient();
    assert.deepEqual(posts[2], { videoConfirm: "auto" });
  });

  it("saves the video defaults on their own, only when a video model exists", async () => {
    const posts = [];
    const h = clientHarness({ update: media(), loading: false, fetch: async (url, options = {}) => (options.method === "POST" && posts.push(JSON.parse(options.body)), okJson({ media: media() })) });
    let tree = h.renderMedia({ account }, "zh", false);
    const seconds = nodes(tree, (n) => n.type === "select" && n.props.id === "dcpa-media-vs-default")[0];
    assert.equal(seconds.props.value, "6");
    assert.equal(nodes(seconds, (n) => n.type === "option").length, 15);
    seconds.props.onChange({ target: { value: "10" } });
    await flushClient();
    nodes(tree, (n) => n.type === "select" && n.props.id === "dcpa-media-vr-default")[0].props.onChange({ target: { value: "480p" } });
    await flushClient();
    assert.deepEqual(posts, [{ defaultVideoSeconds: 10 }, { defaultVideoResolution: "480p" }]);
    const imagesOnly = clientHarness({ update: media({ models: [{ id: "grok-imagine-image", kind: "image", detectedKind: "image", enabled: true }] }), loading: false, fetch: async () => okJson({}) });
    tree = imagesOnly.renderMedia({ account }, "zh", false);
    assert.equal(nodes(tree, (n) => n.props.id === "dcpa-media-vs-default").length, 0);
  });
  it("saves switches and kinds at once and hands a re-synced status to the account page", async () => {
    const requests = [];
    const adopted = [];
    const h = clientHarness({
      update: media(),
      loading: false,
      fetch: async (url, options = {}) => {
        if (options.method === "POST") {
          const body = JSON.parse(options.body);
          requests.push({ url, body });
          if (url.endsWith("media/diagnose")) {
            return okJson({ diagnostic: { keyConfigured: true, catalogs: { enriched: { ok: true, count: 4, media: [] }, listing: { ok: false, status: 401 } }, routes: [{ route: "GET /v1/videos/{id}", status: 401, verdict: "present" }] } });
          }
          const kindChange = body.account.kindOverrides !== undefined;
          return okJson({ media: media(), ...(kindChange ? { status: { ok: true, accounts: [] } } : {}) });
        }
        return okJson({ media: media() });
      },
    });
    let tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    await flushClient();
    tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    nodes(tree, (n) => n.props.role === "switch")[1].props.onClick();
    await flushClient();
    assert.deepEqual(requests[0].body, { account: { accountId: "default", disabledModels: ["sora-2"] } });
    assert.equal(adopted.length, 0, "a switch does not re-sync routes");

    tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    const select = nodes(tree, (n) => n.type === "select" && n.props["aria-label"] === h.zh.mediaKindFor.replace("{model}", "grok-imagine-image"))[0];
    select.props.onChange({ target: { value: "chat" } });
    await flushClient();
    assert.deepEqual(requests[1].body, { account: { accountId: "default", kindOverrides: { "grok-imagine-image": "chat" } } });
    assert.equal(adopted.length, 1, "a kind change passes the re-synced status up");

    tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    nodes(tree, (n) => n.type === "select" && n.props["aria-label"] === h.zh.mediaKindFor.replace("{model}", "sora-2"))[0]
      .props.onChange({ target: { value: "video" } });
    await flushClient();
    assert.deepEqual(requests[2].body.account.kindOverrides, { "sora-2": null }, "choosing the detected kind clears the override");

    tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    button(tree, h.zh.diagRun).props.onClick();
    await flushClient();
    assert.deepEqual(requests[3], { url: "api/dsh-cliproxyapi/media/diagnose", body: { accountId: "default" } });
    tree = h.renderMedia({ account, onStatus: (s) => adopted.push(s) });
    const text = content(tree);
    assert.ok(text.includes(h.zh.diagPresent));
    assert.ok(text.includes("HTTP 401"));
  });

  it("explains an empty or unread catalog and localizes error codes", async () => {
    const empty = clientHarness({ update: media({ models: [], discovered: 0 }), loading: false, fetch: async () => okJson({ media: media({ models: [], discovered: 0 }) }) });
    assert.ok(content(empty.renderMedia({ account }, "en", false)).includes(empty.en.mediaNoCatalog));
    const none = clientHarness({ update: media({ models: [] }), loading: false, fetch: async () => okJson({ media: media({ models: [] }) }) });
    assert.ok(content(none.renderMedia({ account }, "en", false)).includes(none.en.mediaNone));

    const failing = clientHarness({
      update: media(),
      loading: false,
      fetch: async (_url, options = {}) =>
        options.method === "POST" ? new Response(JSON.stringify({ ok: false, error: "invalid-account" }), { status: 400 }) : okJson({ media: media() }),
    });
    let tree = failing.renderMedia({ account });
    await flushClient();
    tree = failing.renderMedia({ account });
    nodes(tree, (n) => n.props.role === "switch")[0].props.onClick();
    await flushClient();
    tree = failing.renderMedia({ account });
    assert.ok(content(tree).includes(failing.zh.mediaErrInvalidAccount));
  });

  it("aborts its load and writes no state after unmount", async () => {
    let signal;
    let resolve;
    const h = clientHarness({ fetch: (_url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); } });
    h.renderMedia({ account });
    h.unmount();
    assert.equal(signal.aborted, true);
    resolve(new Response(JSON.stringify({ ok: true, media: media() })));
    await flushClient();
    assert.equal(h.afterUnmountWrites, 0);
  });
});

