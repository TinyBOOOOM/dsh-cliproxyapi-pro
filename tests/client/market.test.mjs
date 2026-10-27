// market behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

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

