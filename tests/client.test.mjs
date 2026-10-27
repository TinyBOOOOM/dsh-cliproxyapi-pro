import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("client API paths", () => {
  it("defines every API path the client calls, each matching a host route", async () => {
    const { ROUTES } = await import("../lib/index.js");
    const { API } = clientHarness();
    const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
    const used = new Set([...source.matchAll(/\bAPI\.(\w+)/g)].map((m) => m[1]));
    const hostPaths = new Set(Object.values(ROUTES).map((path) => path.replace(/^\//, "")));
    assert.ok(used.has("testAccount"));
    for (const key of used) {
      assert.equal(typeof API[key], "string", `API.${key} is used but not defined`);
      assert.ok(hostPaths.has(API[key]), `API.${key} (${API[key]}) has no host route`);
    }
  });
});

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

const SCHEMA = "dsh-market/update-api/v1";
const capabilities = (overrides = {}) => ({
  schema: SCHEMA, apiVersion: 1, runtime: "desktop",
  features: { check: true, update: true, progress: true, restart: false },
  restart: { supported: false, managedBy: "desktop-host" }, ...overrides,
});
const operation = (state, extra = {}) => ({
  schema: SCHEMA, operationId: "boot-update-1", kind: "update", packageName: "dsh-cliproxyapi-pro", state,
  beforeVersion: "1.4.1", installedVersion: state === "succeeded" ? "1.5.0" : "1.4.1",
  progress: { phase: null, done: 0, total: null, percent: null },
  outcome: { refreshRequired: false, restartRequired: state === "succeeded", rollback: { available: false } },
  failure: null, ...extra,
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const runTimers = async (h) => {
  for (const [id, timer] of [...h.timers]) {
    if (timer.ms === 15000) continue; // the card's own status poll
    h.timers.delete(id);
    await timer.fn();
  }
  await flushClient();
};

describe("dshmarket installation", () => {
  it("discovers the market, installs through Update API v1 and follows the operation", async () => {
    const requests = [];
    let polls = 0;
    const h = clientHarness({ withMarket: true, fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method ?? "GET", body: options.body ? JSON.parse(options.body) : null });
      if (url === "dsh-market/api/v1/capabilities") return json(capabilities());
      if (url === "dsh-market/api/v1/updates") return json({ schema: SCHEMA, operation: operation("running") }, 202);
      if (url.startsWith("dsh-market/api/v1/operations?")) {
        polls++;
        return json({ schema: SCHEMA, operation: polls === 1 ? operation("running", { progress: { percent: 40 } }) : operation("succeeded") });
      }
      return reply();
    } });
    h.render(); await flushClient(); await flushClient();
    let tree = h.render();
    assert.ok(content(tree).includes(h.zh.updateMarketReadyHint));
    button(tree, h.zh.updateMarketInstallBtn).props.onClick();
    assert.equal(requests.some((r) => r.url === "dsh-market/api/v1/updates"), false, "confirmation first");
    tree = h.render();
    assert.ok(content(tree).includes(h.zh.updateMarketConfirmTitle.replace("{version}", "1.5.0")));
    button(tree, h.zh.updateMarketConfirmBtn).props.onClick(); await flushClient(); await flushClient();
    assert.deepEqual(requests.find((r) => r.url === "dsh-market/api/v1/updates"), {
      url: "dsh-market/api/v1/updates", method: "POST", body: { packageName: "dsh-cliproxyapi-pro" },
    });
    assert.ok(content(h.render()).includes(h.zh.updateMarketInstalling));
    await runTimers(h);
    assert.ok(content(h.render()).includes(h.zh.updateMarketProgress.replace("{percent}", "40")));
    await runTimers(h);
    tree = h.render();
    const text = content(tree);
    assert.ok(text.includes(h.zh.updateMarketInstalled.replace("{version}", "1.5.0")), text);
    assert.ok(text.includes(h.zh.updateMarketRestartDesktopHint), "desktop restart is owned by the shell");
    assert.equal(button(tree, h.zh.updateMarketRestartBtn), undefined);
    assert.ok(content(nodes(tree, (n) => n.type === "summary")[0]).includes(h.zh.updateCompactInstalled.replace("{version}", "1.5.0")));
    assert.equal(button(tree, h.zh.updateMarketInstalledBtn).props.disabled, true);
    assert.equal(requests.some((r) => /registry|npm/.test(r.url)), false, "the client never contacts a registry");
    assert.equal(requests.some((r) => r.url.startsWith("api/dsh-cliproxyapi/") && !r.url.includes("/updates/")), false);
    h.unmount();
    h.market.dispose();
  });

  it("offers restart only when the market owns it, and localizes failures without backend text", async () => {
    const h = clientHarness({ withMarket: true, fetch: async (url, options = {}) => {
      if (url === "dsh-market/api/v1/capabilities") return json(capabilities({ runtime: "web", features: { update: true, restart: true }, restart: { supported: true } }));
      if (url === "dsh-market/api/v1/updates") return json({ schema: SCHEMA, operation: operation("succeeded") }, 202);
      if (url === "dsh-market/api/v1/restart") return json({ schema: SCHEMA, result: { ok: true } });
      return reply();
    } });
    h.render(); await flushClient(); await flushClient();
    await h.market.install({ targetVersion: "1.5.0" }); await flushClient();
    const restart = button(h.render(), h.zh.updateMarketRestartBtn);
    assert.ok(restart);
    await restart.props.onClick(); await flushClient();
    assert.ok(content(h.render()).includes(h.zh.updateMarketRestartRequested));
    h.unmount(); h.market.dispose();

    const forced = [];
    const failing = clientHarness({ withMarket: true, fetch: async (url, options = {}) => {
      if (url === "dsh-market/api/v1/capabilities") return json(capabilities());
      if (url === "dsh-market/api/v1/updates") {
        forced.push(JSON.parse(options.body));
        return json({ schema: SCHEMA, operation: operation("failed", { failure: { code: "RELEASE_TOO_FRESH", message: "C:\\private\\path", retryable: true } }) }, 202);
      }
      return reply();
    } });
    failing.render(); await flushClient(); await flushClient();
    await failing.market.install({ targetVersion: "1.5.0" }); await flushClient();
    let tree = failing.render();
    assert.ok(content(tree).includes(failing.zh.updateMarketTooFresh));
    assert.equal(content(tree).includes("private"), false);
    await button(tree, failing.zh.updateMarketForceBtn).props.onClick(); await flushClient();
    assert.deepEqual(forced.at(-1), { packageName: "dsh-cliproxyapi-pro", force: true });
    failing.unmount(); failing.market.dispose();

    for (const [status, body, key] of [
      [409, { schema: SCHEMA, failure: { code: "OPERATION_BUSY" } }, "updateMarketBusy"],
      [404, { error: "not found" }, "updateMarketUnreachable"],
      [500, { error: "stack trace" }, "updateMarketFailed"],
    ]) {
      const x = clientHarness({ withMarket: true, fetch: async (url) => url.endsWith("capabilities") ? json(capabilities()) : url.endsWith("/updates") ? json(body, status) : reply() });
      x.render(); await flushClient(); await flushClient();
      await x.market.install({ targetVersion: "1.5.0" }); await flushClient();
      const text = content(x.render());
      assert.ok(text.includes(x.zh[key]), `${status}: ${text}`);
      assert.equal(text.includes("stack trace"), false);
      x.unmount(); x.market.dispose();
    }
  });

  it("falls back to offline downloads when the market is missing or the install is linked", async () => {
    const h = clientHarness({ withMarket: true, fetch: async (url) => url.endsWith("capabilities") ? new Response("<html>", { status: 404 }) : reply() });
    h.render(); await flushClient(); await flushClient();
    let tree = h.render();
    assert.ok(content(tree).includes(h.zh.updateMarketUnavailableHint));
    assert.equal(button(tree, h.zh.updateMarketInstallBtn), undefined);
    assert.ok(button(tree, h.zh.updateMarketRedetectBtn));
    assert.equal(button(tree, h.zh.updateDownloadBtn).props.className, "dcpa-btn dcpa-btn-primary");
    assert.equal(nodes(tree, (n) => n.props.role === "switch")[2].props.disabled, true);
    h.unmount(); h.market.dispose();

    const linked = clientHarness({ withMarket: true, fetch: async (url) => url.endsWith("capabilities") ? json(capabilities()) : reply({ ...update, blockedReason: "linked-install" }) });
    linked.render(); await flushClient(); await flushClient();
    tree = linked.render();
    assert.ok(content(tree).includes(linked.zh.updateMarketLinkedHint));
    assert.equal(button(tree, linked.zh.updateMarketInstallBtn), undefined);
    linked.unmount(); linked.market.dispose();
  });

  it("auto-installs a version found by the automatic check once, only when opted in", async () => {
    const run = async (status, memoryRecord = null) => {
      const posts = [];
      const timers = new Map();
      let nextTimer = 0, record = memoryRecord;
      const h = clientHarness({ fetch: async () => reply() });
      const market = h.createMarketUpdater({
        fetch: async (url, options = {}) => {
          if (url.endsWith("capabilities")) return json(capabilities());
          posts.push(JSON.parse(options.body));
          return json({ schema: SCHEMA, operation: operation("succeeded") }, 202);
        },
        setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
        clearTimeout: (id) => timers.delete(id),
      });
      const stop = h.startAutoInstall(market, {
        readStatus: async () => status,
        now: () => 1_000_000,
        memory: { read: () => record, write: (value) => { record = value; } },
        setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
        clearTimeout: (id) => timers.delete(id),
      });
      for (let round = 0; round < 2; round++) {
        const [id, timer] = [...timers].find(([, t]) => t.ms !== 1500);
        timers.delete(id);
        await timer.fn(); await flushClient();
      }
      stop();
      const leftover = timers.size;
      market.dispose();
      return { posts, record: JSON.parse(JSON.stringify(record)), leftover };
    };
    const eligible = { ...update, autoInstall: true };
    const installed = await run(eligible);
    assert.equal(installed.posts.length, 1, "one attempt per version");
    assert.deepEqual(installed.posts[0], { packageName: "dsh-cliproxyapi-pro" });
    assert.deepEqual(installed.record, { version: "1.5.0", at: 1_000_000, done: true });
    assert.equal(installed.leftover, 0, "stopping clears the schedule");
    for (const status of [
      { ...eligible, autoInstall: false }, { ...eligible, autoCheck: false }, { ...eligible, available: false },
      { ...eligible, blockedReason: "linked-install" }, { ...eligible, latestVersion: "1.4.1" },
    ]) assert.equal((await run(status)).posts.length, 0, JSON.stringify(status));
    assert.equal((await run(eligible, { version: "1.5.0", at: 999_000 })).posts.length, 0, "recent attempt is remembered");
    assert.equal((await run(eligible, { version: "1.5.0", at: 0, done: true })).posts.length, 0, "installed version is never retried");
    assert.equal((await run(eligible, { version: "1.4.9", at: 999_000 })).posts.length, 1, "a newer version is tried");
  });

  it("compares SemVer including prereleases", () => {
    const { compareVersions } = clientHarness();
    assert.equal(compareVersions("1.5.0", "1.4.9"), 1);
    assert.equal(compareVersions("1.5.0-beta.2", "1.5.0"), -1);
    assert.equal(compareVersions("1.5.0-beta.10", "1.5.0-beta.2"), 1);
    assert.equal(compareVersions("1.5.0", "1.5.0"), 0);
    assert.equal(compareVersions("bad", "1.5.0"), null);
  });

  it("dispose aborts in-flight market requests and the operation poll", async () => {
    let signal;
    const timers = new Map();
    const h = clientHarness();
    const market = h.createMarketUpdater({
      fetch: async (url, options) => {
        if (url.endsWith("capabilities")) return json(capabilities());
        if (url.endsWith("/updates")) return json({ schema: SCHEMA, operation: operation("running") }, 202);
        signal = options.signal;
        return new Promise(() => {});
      },
      setTimeout: (fn, ms) => { timers.set(1, { fn, ms }); return 1; },
      clearTimeout: (id) => timers.delete(id),
    });
    await market.discover();
    await market.install({ targetVersion: "1.5.0" });
    assert.equal(timers.size, 1);
    const poll = timers.get(1); timers.delete(1);
    void poll.fn(); await flushClient();
    market.dispose();
    assert.equal(signal.aborted, true);
    assert.equal(timers.size, 0);
  });
});

const quotaData = {
  generatedAt: "2026-10-21T06:00:00.000Z", refreshing: false,
  accounts: [
    {
      accountId: "default", displayName: "BCPA", provider: "cli-proxy",
      routes: ["cli-proxy", "cli-proxy-responses", "cli-proxy-messages"], enabled: true,
      keyRef: "CLI_PROXY_MANAGEMENT_KEY", keyConfigured: true, state: "ok", refreshing: false,
      fetchedAt: "2026-10-21T06:00:00.000Z",
      pickerModels: [
        { id: "claude-opus-5-5", route: "cli-proxy-messages" },
        { id: "devin/claude-opus-5-5", route: "cli-proxy-messages" },
        { id: "gpt-6.1-sol", route: "cli-proxy-responses" },
      ],
      credentials: [
        { id: "claude-a.json", label: "a@x.dev", provider: "claude", status: "active", models: ["claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "c5", kind: "5h", label: "", remainingPercent: 40, resetAt: null }, { id: "c7", kind: "7d", label: "", remainingPercent: 70, resetAt: null }] },
        { id: "claude-b.json", label: "b@x.dev", provider: "claude", status: "active", models: ["claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "c5", kind: "5h", label: "", remainingPercent: 90, resetAt: null }] },
        { id: "devin.json", label: "devin", provider: "devin", prefix: "devin", status: "active", models: ["devin/claude-opus-5-5"], quotaState: "unsupported", windows: [] },
        { id: "codex.json", label: "c@x.dev", provider: "codex", status: "disabled", models: ["gpt-6.1-sol"], quotaState: "ok",
          windows: [{ id: "x", kind: "7d", label: "", remainingPercent: 0, resetAt: null }] },
        { id: "ag.json", label: "g@x.dev", provider: "antigravity", status: "active", models: ["gemini-4-argon", "claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "g1", kind: "5h", label: "Gemini", remainingPercent: 10, resetAt: null, modelPrefixes: ["gemini"] },
            { id: "g2", kind: "5h", label: "Claude", remainingPercent: 55, resetAt: null, modelPrefixes: ["claude", "gpt"] }] },
      ],
      modelIndex: {
        "claude-opus-5-5": ["claude-a.json", "claude-b.json"],
        "devin/claude-opus-5-5": ["devin.json"],
        "gpt-6.1-sol": ["codex.json"],
      },
      modelMatch: { "claude-opus-5-5": "model-list", "devin/claude-opus-5-5": "prefix", "gpt-6.1-sol": "model-list" },
    },
    {
      accountId: "account-2", displayName: "ZZ", provider: "cli-proxy-2",
      routes: ["cli-proxy-2", "cli-proxy-2-responses", "cli-proxy-2-messages"], enabled: true,
      keyRef: "CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2", keyConfigured: false, state: "nokey", refreshing: false,
      pickerModels: [], credentials: [], modelIndex: {},
    },
  ],
};

describe("quota client", () => {
  it("maps a selection to its own account and channel only", () => {
    const h = clientHarness();
    const claude = h.summarizeModelQuota(quotaData, "cli-proxy-messages", "claude-opus-5-5");
    assert.equal(claude.account.accountId, "default");
    assert.deepEqual(claude.entries.map((e) => e.cred.id), ["claude-b.json", "claude-a.json"], "best headroom first");
    assert.equal(claude.best, 90);
    const devin = h.summarizeModelQuota(quotaData, "cli-proxy-messages", "devin/claude-opus-5-5");
    assert.deepEqual(devin.entries.map((e) => e.cred.id), ["devin.json"], "a prefixed channel never borrows claude quota");
    assert.equal(devin.best, null);
    const codex = h.summarizeModelQuota(quotaData, "cli-proxy-responses", "gpt-6.1-sol");
    assert.equal(codex.usableCount, 0, "disabled credentials do not count as usable");
    assert.equal(codex.best, null);
    const other = h.summarizeModelQuota(quotaData, "cli-proxy-2-messages", "claude-opus-5-5");
    assert.equal(other.account.accountId, "account-2");
    assert.equal(other.entries.length, 0, "same model id on another account maps to nothing from the first");
    assert.equal(h.summarizeModelQuota(quotaData, "deepseek", "deepseek-chat"), null, "non-CPA routes show no badge");
  });

  it("filters tagged windows by model family", () => {
    const h = clientHarness();
    const ag = quotaData.accounts[0].credentials.find((c) => c.id === "ag.json");
    assert.equal(h.credentialHeadroom(ag, "claude-opus-5-5"), 55);
    assert.equal(h.credentialHeadroom(ag, "gemini-4-argon"), 10);
    assert.equal(h.credentialHeadroom(ag), 10);
    assert.equal(h.quotaLevel(0), "empty");
    assert.equal(h.quotaLevel(12), "low");
    assert.equal(h.quotaLevel(null), "unknown");
    const stats = h.quotaStats(quotaData.accounts[0].credentials);
    assert.deepEqual({ ...stats }, { total: 5, healthy: 2, low: 1, empty: 0, issue: 1, unknown: 1 });
  });

  it("registers the composer badge beside the model selector and the quota tab", () => {
    const h = clientHarness();
    const registrations = [], disposers = [];
    const directories = new Map([["s1", { subscribe: () => () => {}, getSnapshot: () => ({ current: { provider: "cli-proxy-messages", model: "claude-opus-5-5" }, pending: null }) }]]);
    const ctx = {
      effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); },
      locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
      slots: { inject(_n, fn) { fn(); }, register(meta, render) { registrations.push({ meta, render }); return () => {}; } },
      inject(names, fn) {
        if (names.length === 1 && names[0] === "uiConversation") return;
        assert.deepEqual([...names], ["slots", "modelDirectories"]);
        fn({ slots: ctx.slots, modelDirectories: { directoryFor: (id) => { const store = directories.get(id); if (!store) throw new Error("no scope"); return { store }; } } });
      },
    };
    h.apply(ctx);
    const badge = registrations.find((r) => r.meta.name === "conversation.input.right");
    assert.ok(badge, "badge registered in conversation.input.right");
    assert.ok(badge.meta.order >= 1000, "last entry, adjacent to the model selector");
    // DSH caches inject() per session binding: it must not resolve the
    // directory (an early miss would be cached); the component resolves lazily.
    assert.equal(badge.meta.inject("s1").directory, undefined, "inject never resolves eagerly");
    assert.equal(badge.meta.inject("s1").resolveDirectory(), directories.get("s1"));
    assert.throws(() => badge.meta.inject("missing").resolveDirectory(), /no scope/);
    assert.equal(badge.meta.inject("s1").sessionId, "s1");
    const resolver = () => directories.get("s1");
    assert.equal(badge.render({ resolveDirectory: resolver }).props.resolveDirectory, resolver);
    assert.equal(badge.render({ directory: null }).type, h.QuotaBadge);
    assert.equal(badge.render({ directory: null }).props.placement, "composer");
    const hero = registrations.find((r) => r.meta.name === "conversation.hero.options");
    assert.ok(hero, "New Session hero gets its own badge entry (the composer list needs a bound session)");
    assert.notEqual(hero.meta.id, badge.meta.id);
    assert.equal(hero.meta.inject("s1").resolveDirectory(), directories.get("s1"));
    assert.equal(hero.render({ directory: null, sessionId: "s1" }).props.placement, "hero");
    assert.equal(hero.render({ directory: null, sessionId: "s1" }).props.sessionId, "s1");
    for (const off of disposers) off();
    assert.equal(h.timers.size, 0);
  });

  it("renders the badge with the best remaining percentage and hides it for other providers", () => {
    const h = clientHarness();
    const store = { getSnapshot: () => ({ data: quotaData, loading: false, error: null, busy: null }), subscribe: () => () => {}, refresh: async () => ({ ok: true }) };
    const dir = (provider, model) => ({ subscribe: () => () => {}, getSnapshot: () => ({ current: { provider, model }, pending: null }) });
    const t = (key) => h.zh[key] ?? key;
    const tree = h.QuotaBadge({ t, directory: dir("cli-proxy-messages", "claude-opus-5-5"), store });
    assert.ok(content(tree).includes("90%"));
    assert.equal(nodes(tree, (n) => n.type === "button")[0].props["aria-expanded"], false);
    assert.equal(h.QuotaBadge({ t, directory: dir("deepseek", "deepseek-chat"), store }), null);
    assert.equal(
      h.QuotaBadge({ t, directory: dir("cli-proxy-2-messages", "claude-opus-5-5"), store }),
      null,
      "an account without a management key shows no badge"
    );
  });

  it("recovers when the session's model directory appears after the first render", () => {
    const h = clientHarness();
    const store = { getSnapshot: () => ({ data: quotaData, loading: false, error: null, busy: null }), subscribe: () => () => {}, refresh: async () => ({ ok: true }) };
    const directory = { subscribe: () => () => {}, getSnapshot: () => ({ current: { provider: "cli-proxy-messages", model: "claude-opus-5-5" }, pending: null }) };
    const t = (key) => h.zh[key] ?? key;
    let ready = false;
    const resolveDirectory = () => { if (!ready) throw new Error("ui-model-selection: session resolved no binding"); return directory; };
    assert.equal(h.QuotaBadge({ t, resolveDirectory, store, sessionId: "s1" }), null, "binding not ready: nothing rendered, nothing thrown");
    ready = true;
    assert.ok(content(h.QuotaBadge({ t, resolveDirectory, store, sessionId: "s1" })).includes("90%"), "a later render resolves the directory");
  });

  it("shows the hero badge only while no composer badge covers the same session", () => {
    const h = clientHarness();
    const store = { getSnapshot: () => ({ data: quotaData, loading: false, error: null, busy: null }), subscribe: () => () => {}, refresh: async () => ({ ok: true }) };
    const directory = { subscribe: () => () => {}, getSnapshot: () => ({ current: { provider: "cli-proxy-messages", model: "claude-opus-5-5" }, pending: null }) };
    const t = (key) => h.zh[key] ?? key;
    const presence = { ids: new Map(), add(id) { this.ids.set(id, (this.ids.get(id) ?? 0) + 1); return () => this.ids.set(id, this.ids.get(id) - 1); }, has(id) { return (this.ids.get(id) ?? 0) > 0; }, subscribe: () => () => {} };
    const hero = h.QuotaBadge({ t, directory, store, sessionId: "s1", placement: "hero", presence });
    assert.ok(content(hero).includes("90%"), "New Session hero shows the badge");
    assert.equal(hero.props["data-placement"], "hero");
    presence.add("s1");
    assert.equal(h.QuotaBadge({ t, directory, store, sessionId: "s1", placement: "hero", presence }), null, "composer badge present: hero steps aside");
    assert.ok(content(h.QuotaBadge({ t, directory, store, sessionId: "s2", placement: "hero", presence })).includes("90%"), "other sessions unaffected");
  });

  it("explains the 30-minute policy and account/credential pauses in both languages", () => {
    for (const language of ["zh", "en"]) {
      const h = clientHarness();
      const t = (key) => h[language][key] ?? key;
      const data = structuredClone(quotaData);
      const account = data.accounts[0];
      account.state = "error";
      account.errorCode = "network";
      account.error = "PRIVATE UPSTREAM ERROR";
      account.autoRefreshPaused = true;
      const cred = account.credentials[0];
      cred.quotaState = "error";
      cred.autoRefreshPaused = true;
      cred.error = "PRIVATE CREDENTIAL ERROR";
      const store = { getSnapshot: () => ({ data, loading: false, error: null, busy: null }) };
      const tree = h.QuotaPanel({ t, store, accountId: "default" });
      const status = nodes(tree, (n) => n.props.className === "dcpa-q-sub");
      assert.ok(status.some((n) => content(n).includes(t("qAccountPaused"))));
      assert.ok(content(tree).includes(t("qErrNetwork")), "account error stays localized");
      assert.ok(!content(tree).includes(account.error));
      assert.equal(button(tree, t("qRefresh")).props.disabled, false, "manual retry remains available");
      assert.ok(nodes(tree, (n) => n.props.text === t("qRefreshPolicy")).length > 0);
      assert.match(t("qRefreshPolicy"), /30/);
      assert.match(t("qRefreshPolicy"), language === "zh" ? /插件内存.*插件重启.*刷新页面不会清除/ : /plugin memory.*plugin restart.*reloading the page does not clear/);
      const row = nodes(tree, (n) => n.props.cred?.id === cred.id)[0];
      const renderedRow = row.type(row.props);
      const meters = nodes(renderedRow, (n) => n.props.cred?.id === cred.id)[0];
      for (const windows of [cred.windows, []]) {
        const rendered = meters.type({ ...meters.props, windows });
        assert.ok(content(rendered).includes(t("qQuotaError")));
        assert.ok(content(rendered).includes(t("qCredentialPaused")), "pause remains visible even with cached windows");
        assert.ok(!content(rendered).includes(cred.error));
      }
      const healthy = meters.type({ ...meters.props, cred: account.credentials[1], windows: account.credentials[1].windows });
      assert.ok(!content(healthy).includes(t("qCredentialPaused")), "healthy sibling is not labeled paused");
      account.autoRefreshPaused = false;
      assert.ok(!content(h.QuotaPanel({ t, store, accountId: "default" })).includes(t("qAccountPaused")), "credential failure does not label whole account paused");
    }
  });

  function pollingStore(fetch) {
    const timers = new Map();
    let id = 0;
    const store = clientHarness().createQuotaStore({
      fetch,
      setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
      clearTimeout: (key) => timers.delete(key),
    });
    return {
      store, timers,
      delay() { assert.equal(timers.size, 1); return [...timers.values()][0].ms; },
      async poll() {
        assert.equal(timers.size, 1);
        const [key, timer] = [...timers][0];
        timers.delete(key);
        timer.fn();
        await flushClient();
      },
    };
  }

  it("backs off repeated failed status reads despite stale refreshing and resets after recovery", async () => {
    let mode = "busy";
    const busyData = { ...quotaData, refreshing: true };
    const p = pollingStore(async () => {
      if (mode === "error") throw new Error("offline");
      return new Response(JSON.stringify({ ok: true, quota: mode === "busy" ? busyData : quotaData }));
    });
    const off = p.store.subscribe(() => {});
    await flushClient();
    assert.equal(p.delay(), 4000);
    mode = "error";
    for (const expected of [60000, 120000, 240000, 300000, 300000]) {
      await p.poll();
      assert.equal(p.delay(), expected);
      assert.equal(p.store.getSnapshot().data.refreshing, true, "cached busy data is retained");
      assert.equal(p.store.getSnapshot().loading, false);
      assert.match(p.store.getSnapshot().error, /offline/);
    }
    mode = "busy";
    await p.poll();
    assert.equal(p.delay(), 4000, "successful GET restores busy polling");
    assert.equal(p.store.getSnapshot().error, null);
    mode = "error";
    await p.poll();
    assert.equal(p.delay(), 60000, "new failure sequence starts at 60 seconds");
    mode = "idle";
    await p.poll();
    assert.equal(p.delay(), 60000, "successful idle snapshot restores normal polling");
    mode = "error";
    await p.poll();
    assert.equal(p.delay(), 60000);
    await p.poll();
    assert.equal(p.delay(), 120000);
    off();
    assert.equal(p.timers.size, 0, "unsubscribe clears backoff timer");
    p.store.dispose();
  });

  it("resets backoff on successful quota mutations but not failed mutations", async () => {
    for (const action of ["refresh", "saveKey", "clearKey"]) {
      let failMutation = true;
      const p = pollingStore(async (_url, init) => {
        if (init.method !== "POST" || failMutation) throw new Error("offline");
        return new Response(JSON.stringify({ ok: true, quota: { ...quotaData, refreshing: true } }));
      });
      p.store.subscribe(() => {});
      await flushClient();
      assert.equal(p.delay(), 60000, "initial GET failure starts backoff without cached data");
      await p.poll();
      assert.equal(p.delay(), 120000);
      assert.equal((await p.store[action]("default", "test-key")).ok, false);
      assert.equal(p.delay(), 120000, "failed mutation does not reset status retry delay");
      await p.poll();
      assert.equal(p.delay(), 240000);
      failMutation = false;
      assert.equal((await p.store[action]("default", "test-key")).ok, true);
      assert.equal(p.delay(), 4000, `${action} success restores busy polling`);
      assert.equal(p.store.getSnapshot().error, null);
      await p.poll();
      assert.equal(p.delay(), 60000, "first GET failure after mutation restarts backoff");
      p.store.dispose();
      assert.equal(p.timers.size, 0);
    }
  });

  it("ignores an older failed GET after a successful mutation", async () => {
    let rejectGet;
    const p = pollingStore(async (_url, init) => {
      if (init.method !== "POST") return new Promise((_resolve, reject) => { rejectGet = reject; });
      return new Response(JSON.stringify({ ok: true, quota: { ...quotaData, refreshing: true } }));
    });
    p.store.subscribe(() => {});
    await p.store.refresh("default");
    assert.equal(p.delay(), 4000);
    rejectGet(new Error("outdated failure"));
    await flushClient();
    assert.equal(p.delay(), 4000);
    assert.equal(p.store.getSnapshot().error, null);
    assert.equal(p.store.getSnapshot().loading, false);
    p.store.dispose();
  });

  it("aborts an in-flight retry on disposal without rearming timers or notifying subscribers", async () => {
    let pending = false, finish, signal, requests = 0, notifications = 0;
    const p = pollingStore(async (_url, init) => {
      requests++;
      if (!pending) throw new Error("offline");
      signal = init.signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    p.store.subscribe(() => { notifications++; });
    await flushClient();
    await p.poll();
    assert.equal(p.delay(), 120000);
    pending = true;
    await p.poll();
    assert.equal(p.timers.size, 0, "request is pending");
    const snapshot = p.store.getSnapshot(), before = notifications;
    p.store.dispose();
    assert.equal(signal.aborted, true);
    finish(new Response(JSON.stringify({ ok: true, quota: { ...quotaData, refreshing: true } })));
    await flushClient();
    assert.equal(notifications, before);
    assert.equal(p.store.getSnapshot(), snapshot, "late response does not publish after disposal");
    assert.equal(p.timers.size, 0);
    p.store.subscribe(() => { notifications++; });
    await p.store.load();
    await p.store.refresh("default");
    assert.equal(requests, 3, "disposed store cannot start new requests");
    assert.equal(notifications, before);
  });

  it("polls only while subscribed and disposes cleanly", async () => {
    const timers = new Map(); let id = 0; const calls = [];
    const h = clientHarness();
    const store = h.createQuotaStore({
      fetch: async (url, init) => { calls.push([url, init?.method ?? "GET", init?.body]); return new Response(JSON.stringify({ ok: true, quota: quotaData })); },
      setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
      clearTimeout: (k) => timers.delete(k),
    });
    const off = store.subscribe(() => {});
    await flushClient(); await flushClient();
    assert.equal(calls[0][0], "api/dsh-cliproxyapi/quota/status");
    assert.equal(store.getSnapshot().data.accounts.length, 2);
    assert.equal(timers.size, 1, "next poll scheduled");
    const saved = await store.saveKey("default", "mgmt-secret");
    assert.equal(saved.ok, true);
    assert.equal(calls.at(-1)[0], "api/dsh-cliproxyapi/quota/save");
    assert.deepEqual(JSON.parse(calls.at(-1)[2]), { accountId: "default", managementKey: "mgmt-secret" });
    off();
    assert.equal(timers.size, 0, "no polling without subscribers");
    store.dispose();
  });
});

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
describe("settings page text", () => {
  it("every key the UI renders exists in both dictionaries", async () => {
    const { readFileSync } = await import("node:fs");
    const s = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
    const zs = s.indexOf("    const zh = {"), es = s.indexOf("    const en = {"), cs = s.indexOf("    const CSS = `");
    const zh = s.slice(zs, es), en = s.slice(es, cs), body = s.slice(cs);
    const used = new Set([...body.matchAll(/\bt\("([A-Za-z0-9_]+)"\)|fmt\(t, "([A-Za-z0-9_]+)"/g)].map((m) => m[1] || m[2]));
    const has = (d, k) => new RegExp(`\\n {6}${k}:`).test(d);
    assert.deepEqual([...used].filter((k) => !has(zh, k) || !has(en, k)), []);
  });
});

describe("hot reload", () => {
  it("keeps the badge and settings entries when the new activation starts before the old one is disposed", () => {
    const h = clientHarness();
    // Mirrors DSH SlotCore: one entry per name + id/key + priority; the lowest priority renders.
    const live = new Map();
    const registry = {
      inject(_name, fn) { return fn(); },
      register(meta, render) {
        const key = `${meta.name}#${meta.id ?? meta.key}#${meta.priority ?? 0}`;
        if (live.has(key)) throw new Error(`slot "${meta.name}" already has an entry with id "${meta.id ?? meta.key}" at priority ${meta.priority ?? 0}`);
        live.set(key, { meta, render });
        return () => live.delete(key);
      },
    };
    const activation = () => {
      const disposers = [];
      const ctx = {
        effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); return off; },
        locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
        slots: {
          inject: (name, fn) => { const off = registry.inject(name, fn); if (typeof off === "function") disposers.push(off); },
          register: registry.register,
        },
        inject(_names, fn) { fn({ slots: ctx.slots, modelDirectories: { directoryFor: () => ({ store: null }) } }); },
      };
      h.apply(ctx);
      return () => { for (const off of disposers.splice(0).reverse()) off(); };
    };
    const disposeOld = activation();
    const disposeNew = activation(); // overlaps: the old entries still hold the stable ids
    disposeOld();
    const names = [...live.values()].map((e) => e.meta.name).sort();
    assert.deepEqual(names, ["conversation.chat.commandview", "conversation.chat.commandview", "conversation.chat.commandview", "conversation.chat.commandview", "conversation.composer.dock", "conversation.hero.options", "conversation.hero.options", "conversation.input.right", "conversation.input.right", "plugins.bundle.config", "settings.plugins.tab", "settings.section", "tool.call.toolview"]);
    const chip = [...live.values()].find((e) => e.meta.id === "dsh-cliproxyapi-pro:media");
    assert.equal(chip.meta.priority, 1, "the generation button also shadows one priority lower");
    const badge = [...live.values()].find((e) => e.meta.id === "dsh-cliproxyapi-pro:quota");
    assert.equal(badge.meta.id, "dsh-cliproxyapi-pro:quota", "the id stays stable");
    assert.equal(badge.meta.priority, 1, "the reloaded entry shadows one priority lower");
    disposeNew();
    assert.equal(live.size, 0);
  });
});
describe("image row file actions", () => {
  it("reach DSH's remote.session service, ask the desktop once and pass reveal / application requests", async () => {
    const h = clientHarness();
    const live = [];
    const calls = [];
    let mounted = false;
    const session = {
      canOpenWorkspacePath: async () => (calls.push("can"), { ok: true, value: true }),
      workspacePathApplications: async (request) => (calls.push(["apps", request]), { ok: true, value: [{ id: "x.exe", name: "X", default: true }, { bad: 1 }] }),
      openWorkspacePath: async (request) => (calls.push(["open", request]), { ok: true, value: { opened: true } }),
    };
    const ctx = {
      effect(fn) { return fn(); },
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: { inject: (_name, fn) => fn(), register: (meta, render) => (live.push({ meta, render }), () => {}) },
      inject(_names, fn) { fn({ slots: ctx.slots, modelDirectories: { directoryFor: () => ({ store: null }) } }); },
      get: (name) => (name === "remote.session" && mounted ? session : undefined),
    };
    h.apply(ctx);
    const row = live.find((e) => e.meta.name === "conversation.chat.commandview");
    const actions = row.render({ node: { name: "cpa-image" }, sessionId: "s-1" }).props.fileActions;
    assert.equal(await actions.available(), false, "not mounted yet");
    mounted = true;
    assert.equal(await actions.available(), true);
    assert.equal(await actions.available(), true);
    assert.deepEqual(calls, ["can"], "asked once");
    assert.deepEqual(JSON.parse(JSON.stringify(await actions.applications("D:\\a.png"))), [{ id: "x.exe", name: "X", default: true }]);
    assert.equal(await actions.open("D:\\a.png", "reveal"), true);
    await actions.open("D:\\a.png", "open", "x.exe");
    await actions.open("D:\\a.png", "open");
    assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(2))), [
      ["open", { path: "D:\\a.png", action: "reveal" }],
      ["open", { path: "D:\\a.png", application: "x.exe" }],
      ["open", { path: "D:\\a.png" }],
    ]);
  });
});
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

describe("agent media conversation placement", () => {
  it("folds real tool events into one turn-level node outside both process folds", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    const location = { kind: "step", step: { status: "open", step: 1 }, turn: { status: "open", turn: 1 } };
    const call = { type: "tool/call", seq: 8, data: { name: "generate_media", callId: "toolu|01", arguments: JSON.stringify({ kind: "video", prompt: "南方大雨", seconds: 8, resolution: "480p" }) } };
    const identity = def.match["tool/call"](call);
    assert.equal(identity.role, "start");
    assert.equal(identity.exclusive, undefined, "does not steal other definitions' events");
    const start = { event: call, location };
    const context = { key: "media:toolu|01", id: identity.id, start, matches: [start], state: def.start({}, start) };
    const running = def.buildViewNode(context);
    assert.equal(running.kind, h.MEDIA_NODE_KIND);
    assert.equal(running.groupTree, "turn", "turn escapes inner AND whole-turn process folding; process alone does not");
    assert.equal(running.location, location);
    assert.equal(running.anchorSeq, 8);
    assert.equal(running.key, context.key);
    assert.equal(running.data.phase, "start");
    const card = h.MediaToolRow({ t: (key) => h.zh[key] ?? key, owner: running.data, standalone: true });
    assert.equal(card.props.pending, true);
    assert.equal(card.props.node.commandId, "toolu_01");
    assert.equal(card.props.showConfirm, false);
    const result = { type: "tool/result", surfaceOp: "append", seq: 10, data: { message: { source: { callId: identity.id }, content: [{ type: "text", text: "saved" }] }, meta: { run: "toolu_01" } } };
    const update = def.match["tool/result"](result);
    assert.equal(update.id, identity.id);
    context.state = def.update(context, { event: result, location });
    const done = def.buildViewNode(context);
    assert.equal(done.key, running.key, "completion updates the existing row, not another row");
    assert.equal(done.data.phase, "result");
    assert.equal(done.data.block.meta.run, "toolu_01");
    assert.equal(done.groupTree, "turn");
    const snapshot = { order: ["m"], nodes: new Map([["m", done]]) };
    assert.equal(h.hasMediaNode(snapshot, "toolu_01"), true);
    assert.equal(h.MediaToolRow({ owner: done.data, useChat: (selector) => selector(snapshot) }), null);
  });

  it("ignores replacements, unrelated calls and paged orphan results until their own start is loaded", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    assert.equal(def.match["tool/call"]({ data: { name: "pwsh", callId: "other" } }), null);
    assert.equal(def.match["tool/result"]({ surfaceOp: "replace", data: { message: { source: { callId: "x" } } } }), null);
    assert.equal(def.buildViewNode({ state: undefined, start: undefined }), null);
    assert.equal(def.buildViewNode({ state: null, start: undefined }), null);
    assert.equal(def.update({ state: null }, { event: {} }), null, "never return forbidden undefined from update");
    assert.equal(h.hasMediaNode({ order: ["m"], nodes: new Map([["m", { kind: "command", data: { commandId: "x" } }]]) }, "x"), false);
    const start = { event: { seq: 1, data: { callId: "x", arguments: "{}" } }, location: { kind: "step", step: { status: "closed" }, turn: { status: "open" } } };
    const node = def.buildViewNode({ key: "x", id: "x", start, state: def.start({}, start) });
    assert.equal(node.data.block.isError, true, "interrupted calls must not look pending forever");
  });

  it("renders nested PTC generations outside their parent process, including final-only pages", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    const location = { kind: "step", step: { status: "open" }, turn: { status: "open" } };
    const start = { event: { type: "tool/ptc-dispatch-start", seq: 3, data: { name: "generate_media", subCallId: "nested|1", rootCallId: "workflow-1", arguments: { kind: "video", prompt: "大雨" } } }, location };
    assert.equal(def.match["tool/ptc-dispatch-start"](start.event).id, "nested|1");
    const context = { key: "nested-1", id: "nested|1", start, state: def.start({}, start) };
    assert.equal(def.buildViewNode(context).data.block.phase, "start");
    const final = { event: { type: "tool/ptc-dispatch", seq: 4, data: { ...start.event.data, content: [{ type: "text", text: "saved" }], meta: { run: "nested_1" }, isError: false } }, location };
    assert.equal(def.match["tool/ptc-dispatch"](final.event).role, "start", "final-only windows can reconstruct their own named call");
    context.state = def.update(context, final);
    const done = def.buildViewNode(context);
    assert.equal(done.groupTree, "turn");
    assert.equal(done.data.phase, "result");
    assert.equal(done.data.block.meta.run, "nested_1");
    const finalOnly = def.buildViewNode({ key: "final-only", id: "nested|1", start: final, state: def.start({}, final) });
    assert.equal(finalOnly.data.phase, "result");
    assert.equal(finalOnly.data.callId, "nested|1");
    assert.equal(def.match["tool/ptc-dispatch"]({ data: { name: "read", subCallId: "other" } }), null);
  });

  it("registers and disposes the official conversation definition and renderer together", () => {
    const h = clientHarness();
    const definitions = [], registrations = [], disposers = [];
    let removed = 0;
    const ctx = {
      effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); return off; },
      locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
      slots: { inject: (_name, fn) => { const off = fn(); if (typeof off === "function") disposers.push(off); }, register: (meta, render) => (registrations.push({ meta, render }), () => {}) },
      uiConversation: { events: { register: (def) => (definitions.push(def), () => { removed++; }) } },
      inject(names, fn) { if (names.length === 1 && names[0] === "uiConversation") fn(ctx); },
    };
    h.apply(ctx);
    assert.equal(definitions.length, 1);
    const renderer = registrations.find((entry) => entry.meta.name === "conversation.chat.node");
    assert.equal(renderer.meta.key, definitions[0].kind);
    const row = renderer.render({ sessionId: "s-1", node: { data: { callId: "call-1" } } });
    assert.equal(row.props.owner.callId, "call-1");
    assert.equal(row.props.standalone, true);
    assert.ok(registrations.some((entry) => entry.meta.name === "conversation.composer.dock"));
    for (const off of disposers.reverse()) off();
    assert.equal(removed, 1);
    assert.equal(h.timers.size, 0);
  });
});

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
