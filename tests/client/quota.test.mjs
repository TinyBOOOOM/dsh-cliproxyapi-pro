// quota behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

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

