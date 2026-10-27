// updates behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("plugin update client", () => {
  it("keeps dictionaries aligned, starts collapsed and renders accessible switches in both languages", () => {
    const h = clientHarness({ update, loading: false });
    assert.deepEqual(Object.keys(h.zh).sort(), Object.keys(h.en).sort());
    for (const language of ["zh", "en"]) {
      const tree = h.render(language, false);
      assert.equal(tree.type, "details", "card is a native collapsible");
      assert.equal(Object.hasOwn(tree.props, "open"), false, "closed by default");
      assert.equal(nodes(tree, (n) => n.type === "summary").length, 1);
      const switches = nodes(tree, (n) => n.props.role === "switch");
      assert.equal(switches.length, 3);
      assert.equal(switches[0].props["aria-checked"], true);
      assert.equal(switches[2].props["aria-label"], h[language].updateAutoInstallLabel);
      assert.equal(switches[2].props.disabled, true, "auto install cannot be enabled without dshmarket");
      assert.equal(nodes(tree, (n) => n.props.role === "group").length, 2);
      assert.ok(html(tree).includes("1.5.0"));
      assert.ok(content(tree).includes(h[language].updateRegionCn));
    }
    assert.equal(nodes(h.renderContainer(), (n) => n.type === h.PluginUpdatePanel).length, 0, "the account section has no update card");
    const page = h.renderPage();
    const cards = nodes(page, (n) => n.type === h.PluginUpdatePanel);
    assert.equal(cards.length, 1, "the plugin page is the update card");
    assert.equal(cards[0].props.initiallyOpen, true);
    assert.ok(content(page).includes(h.zh.updatePageHint));
  });

  it("puts accounts in a Settings section and leaves only updates on the plugin pages", () => {
    const h = clientHarness();
    const registrations = [], disposers = [];
    const ctx = {
      effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); },
      locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
      slots: {
        inject(_name, fn) { fn(); },
        register(meta, render) { registrations.push({ meta, render }); return () => {}; },
      },
    };
    h.apply(ctx);
    const byName = Object.fromEntries(registrations.map((r) => [r.meta.name, r]));
    // Without modelDirectories only the generation-model button joins the composer and hero.
    assert.deepEqual(Object.keys(byName).sort(), ["conversation.chat.commandview", "conversation.composer.dock", "conversation.hero.options", "conversation.input.right", "plugins.bundle.config", "settings.plugins.tab", "settings.section", "tool.call.toolview"]);
    const row = byName["conversation.chat.commandview"];
    assert.deepEqual(registrations.filter((r) => r.meta.name === "conversation.chat.commandview").map((r) => r.meta.key), ["cpa-image", "cpa-video", "cpa-video-edit", "cpa-video-extend"], "only the generation command rows are replaced");
    assert.equal(JSON.stringify(row.meta.inject("s-1")), JSON.stringify({ sessionId: "s-1" }));
    assert.equal(row.render({ sessionId: "s-1", node: { name: "cpa-image" } }).type, h.MediaCommandRow);
    const chip = byName["conversation.input.right"];
    assert.equal(chip.meta.id, "dsh-cliproxyapi-pro:media");
    assert.ok(chip.meta.order < 10000, "left of the quota badge");
    assert.equal(JSON.stringify(chip.meta.inject("s-1")), JSON.stringify({ sessionId: "s-1" }));
    assert.equal(chip.render({ sessionId: "s-1" }).type, h.MediaChip);
    assert.equal(byName["conversation.hero.options"].meta.id, "dsh-cliproxyapi-pro:media-hero");
    const section = byName["settings.section"];
    assert.equal(section.meta.id, "cliproxyapi");
    assert.equal(typeof section.meta.order, "number");
    assert.equal(section.meta.label(), h.zh.nav);
    assert.equal(section.render().type, h.CpaSectionPage);
    assert.equal(byName["settings.plugins.tab"].render().type, h.PluginUpdatePage);
    assert.equal(byName["plugins.bundle.config"].meta.key, "dsh-cliproxyapi-pro");
    assert.equal(byName["plugins.bundle.config"].render({ view: "page" }).type, h.PluginUpdatePage);
    assert.equal(byName["plugins.bundle.config"].render({ view: "summary" }), null);
    for (const off of disposers) off();
    assert.equal(h.timers.size, 0, "the auto-install schedule is disposed with the activation");
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

    // A missing status endpoint (host plugin not reloaded) is neither a network
    // error nor bad registry metadata: it must say the service is unavailable.
    for (const body of [JSON.stringify({ error: "not found" }), "<!doctype html>404"]) {
      const h = clientHarness({ fetch: async () => new Response(body, { status: 404 }) });
      h.render();
      await flushClient();
      const tree = h.render();
      const text = content(tree);
      assert.ok(text.includes(h.zh.updateCompactStatusUnavailable), text);
      assert.equal(text.includes(h.zh.updateCompactError), false);
      assert.ok(text.includes(h.zh.updateStatusUnavailableHint), text);
      assert.equal(text.includes(h.zh.updateMetadataError), false, "a missing route is not invalid metadata");
      assert.ok(text.includes(h.zh.updateServiceUnavailableError), text);
    }

    // The same 404 must not be reported as an invalid registry payload either.
    const check = clientHarness({ update, loading: false, fetch: async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }) });
    check.render("zh", false);
    await button(check.render(), check.zh.updateCheckBtn).props.onClick();
    await flushClient();
    const checkText = content(check.render());
    assert.ok(checkText.includes(check.zh.updateServiceUnavailableError), checkText);
    assert.equal(checkText.includes(check.zh.updateMetadataError), false);
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

