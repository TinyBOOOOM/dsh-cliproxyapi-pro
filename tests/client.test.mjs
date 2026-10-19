import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientHarness, nodes, content, flushClient, html } from "./client-harness.mjs";

const update = {
  currentVersion: "1.4.1", latestVersion: "1.5.0", available: true,
  autoCheck: true, autoDownload: false, channel: "stable", region: "auto",
  checking: false, downloading: false, lastCheckedAt: "2026-10-19T12:00:00.000Z",
  effectiveRegion: "cn", error: null, errorCode: null, blockedReason: null,
  downloadedVersion: null, downloadPath: null, upgradeCommand: null,
};
const reply = (state = update) => new Response(JSON.stringify({ ok: true, update: state }));
const button = (tree, text) => nodes(tree, (node) => node.type === "button" && content(node) === text)[0];

describe("plugin update client", () => {
  it("keeps dictionaries aligned, starts collapsed and renders accessible switches in both languages", () => {
    const h = clientHarness({ update, loading: false });
    assert.deepEqual(Object.keys(h.zh).sort(), Object.keys(h.en).sort());
    for (const language of ["zh", "en"]) {
      const tree = h.render(language, false);
      assert.equal(tree.type, "details", "card is a native collapsible");
      assert.equal(Object.hasOwn(tree.props, "open"), false, "closed by default");
      assert.equal(nodes(tree, (n) => n.type === "summary").length, 1);
      assert.equal(nodes(tree, (n) => n.props.role === "switch").length, 2);
      assert.equal(nodes(tree, (n) => n.props.role === "switch")[0].props["aria-checked"], true);
      assert.equal(nodes(tree, (n) => n.props.role === "group").length, 2);
      assert.ok(html(tree).includes("1.5.0"));
      assert.ok(content(tree).includes(h[language].updateRegionCn));
    }
    assert.equal(nodes(h.renderContainer(), (n) => n.type === h.PluginUpdatePanel).length, 1, "card exists even without accounts");
  });

  it("shows a compact summary with only the current version and a short state", () => {
    const cases = [
      [update, "updateCompactAvailable", "available"],
      [{ ...update, latestVersion: "1.4.1", available: false }, "updateUpToDate", "idle"],
      [{ ...update, latestVersion: null, available: false, lastCheckedAt: null }, "updateNotChecked", "idle"],
      [{ ...update, downloadedVersion: "1.5.0", downloadPath: "/p.tgz" }, "updateCompactDownloaded", "downloaded"],
      [{ ...update, error: "integrity-error", errorCode: "integrity-error" }, "updateCompactError", "error"],
      [{ ...update, checking: true }, "updateChecking", "checking"],
      [{ ...update, downloading: true }, "updateDownloading", "downloading"],
    ];
    for (const [state, key, marker] of cases) {
      const h = clientHarness({ update: state, loading: false });
      const tree = h.render("zh", false);
      const summary = nodes(tree, (n) => n.type === "summary")[0];
      const text = content(summary);
      assert.ok(text.includes(h.zh.updateTitle), key);
      assert.ok(text.includes(h.zh.updateCompactCurrent.replace("{version}", state.currentVersion)), key);
      const expected = h.zh[key].replace("{version}", state.latestVersion ?? state.downloadedVersion ?? "");
      assert.ok(text.includes(expected), `${key}: ${text}`);
      assert.equal(nodes(summary, (n) => n.props["data-state"] === marker).length, 1, `${key} marker`);
      assert.equal(content(summary).includes(h.zh.updateSubtitle), false, "details stay collapsed");
    }
    const loadingHarness = clientHarness({ update: null, loading: true });
    const loading = loadingHarness.render("en", false);
    assert.ok(content(loading).includes(loadingHarness.en.updateLoading));
  });

  it("only reads update status on mount and clears its timer on unmount", async () => {
    const requests = [];
    const h = clientHarness({ fetch: async (url, options) => { requests.push({ url, options }); return reply(); } });
    h.render();
    await flushClient();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "api/dsh-cliproxyapi/updates/status");
    assert.equal(requests[0].options.method, undefined);
    assert.equal(h.timers.size, 1);
    assert.ok(content(h.render()).includes("1.5.0"));
    h.unmount();
    assert.equal(h.timers.size, 0);
    assert.equal(h.afterUnmountWrites, 0);
  });

  it("saves only update settings and confirms the exact version before download", async () => {
    const requests = [];
    const h = clientHarness({ fetch: async (url, options) => {
      const payload = options.body ? JSON.parse(options.body) : null;
      requests.push({ url, payload });
      return reply(url.endsWith("/save") ? { ...update, region: payload.region } : url.endsWith("/download") ? { ...update, downloadedVersion: "1.5.0", downloadPath: "/example/plugin.tgz", upgradeCommand: "dsh plugin --profile 'demo' add '/example/plugin.tgz'" } : update);
    } });
    h.render(); await flushClient();
    await button(h.render(), h.zh.updateRegionCn).props.onClick(); await flushClient();
    assert.deepEqual(requests.at(-1), { url: "api/dsh-cliproxyapi/updates/save", payload: { region: "cn" } });
    button(h.render(), h.zh.updateDownloadBtn).props.onClick();
    assert.equal(requests.some((r) => r.url.endsWith("/download")), false);
    const confirmed = h.render();
    assert.ok(content(confirmed).includes("1.5.0"));
    button(confirmed, h.zh.updateConfirmBtn).props.onClick(); await flushClient();
    assert.deepEqual(requests.at(-1), { url: "api/dsh-cliproxyapi/updates/download", payload: { version: "1.5.0" } });
    assert.ok(content(h.render()).includes("dsh plugin --profile"));
    assert.equal(requests.some((r) => !r.url.includes("/updates/")), false, "never reload account state/drafts");
    h.unmount();
  });

  it("localizes backend failures and never reports a failed download as success", async () => {
    const h = clientHarness({ fetch: async (url) => reply(url.endsWith("/download") ? { ...update, errorCode: "integrity-error", error: "private token path" } : update) });
    h.render(); await flushClient();
    button(h.render(), h.zh.updateDownloadBtn).props.onClick();
    button(h.render(), h.zh.updateConfirmBtn).props.onClick(); await flushClient();
    const text = content(h.render());
    assert.ok(text.includes(h.zh.updateIntegrityError));
    assert.equal(text.includes("private token path"), false);
    assert.equal(text.includes(h.zh.updateDownloadRequested), false);
    h.unmount();
  });

  it("allows linked-source downloads but hides any installation command", async () => {
    const linked = { ...update, blockedReason: "linked-install", downloadedVersion: "1.5.0", downloadPath: "/example/plugin.tgz", upgradeCommand: "NEVER DISPLAY" };
    const h = clientHarness({ update: linked, loading: false });
    const tree = h.render("zh", false);
    assert.ok(content(tree).includes(h.zh.updateLinkedSourceHint));
    assert.equal(content(tree).includes("NEVER DISPLAY"), false);
    assert.equal(button(tree, h.zh.updateDownloadedBtn).props.disabled, false);
  });

  it("names the actual failure reason instead of a generic update error", async () => {
    const cases = [
      [{ ...update, errorCode: "network-error", error: "network-error" }, "updateCompactErrorNetwork"],
      [{ ...update, errorCode: "channel-unavailable", error: "channel-unavailable" }, "updateCompactErrorChannel"],
      [{ ...update, errorCode: "integrity-error", error: "integrity-error" }, "updateCompactError"],
    ];
    for (const [state, key] of cases) {
      const h = clientHarness({ update: state, loading: false });
      const text = content(h.render("zh", false));
      assert.ok(text.includes(h.zh[key]), `${state.errorCode} -> ${key}: ${text}`);
    }

    // A missing status endpoint (host plugin not reloaded) is not a network error.
    const h = clientHarness({ fetch: async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }) });
    h.render();
    await flushClient();
    const tree = h.render();
    assert.ok(content(tree).includes(h.zh.updateCompactStatusUnavailable), content(tree));
    assert.equal(content(tree).includes(h.zh.updateCompactError), false);
    assert.ok(content(tree).includes(h.zh.updateStatusUnavailableHint));
  });

  it("aborts requests and ignores late results after unmount", async () => {
    let resolve, signal;
    const h = clientHarness({ fetch: (_url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); } });
    h.render();
    h.unmount();
    assert.equal(signal.aborted, true);
    resolve(reply()); await flushClient();
    assert.equal(h.afterUnmountWrites, 0);
    assert.equal(h.timers.size, 0);
  });
});
