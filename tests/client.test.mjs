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
    assert.deepEqual(Object.keys(byName).sort(), ["plugins.bundle.config", "settings.plugins.tab", "settings.section"]);
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
        assert.deepEqual([...names], ["slots", "modelDirectories"]);
        fn({ slots: ctx.slots, modelDirectories: { directoryFor: (id) => { const store = directories.get(id); if (!store) throw new Error("no scope"); return { store }; } } });
      },
    };
    h.apply(ctx);
    const badge = registrations.find((r) => r.meta.name === "conversation.input.right");
    assert.ok(badge, "badge registered in conversation.input.right");
    assert.ok(badge.meta.order >= 1000, "last entry, adjacent to the model selector");
    assert.equal(badge.meta.inject("s1").directory, directories.get("s1"));
    assert.equal(badge.meta.inject("missing").directory, null, "a session without scope degrades to no badge");
    assert.equal(badge.render({ directory: null }).type, h.QuotaBadge);
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
    assert.deepEqual(names, ["conversation.input.right", "plugins.bundle.config", "settings.plugins.tab", "settings.section"]);
    const badge = [...live.values()].find((e) => e.meta.name === "conversation.input.right");
    assert.equal(badge.meta.id, "dsh-cliproxyapi-pro:quota", "the id stays stable");
    assert.equal(badge.meta.priority, 1, "the reloaded entry shadows one priority lower");
    disposeNew();
    assert.equal(live.size, 0);
  });
});
