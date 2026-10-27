// Fake-fetch checks, region races, single flight and settings changes.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  UPDATE_PACKAGE, UPDATE_REGISTRIES, UPDATE_TAGS,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, hasCode, deferred, tick, metadata, jsonResponse, bytesResponse, pendingFetch, harness, assertSafeRequest, CURRENT, CHECKED_AT,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

describe("fake-fetch checks, source races, single flight and settings", () => {
  test("construction is network-free and fixed sources request only the selected channel", async (t) => {
    for (const region of ["global", "cn"]) for (const [channel, tag] of Object.entries(UPDATE_TAGS)) {
      const h = harness(t, { settings: { region, channel }, fetch: () => jsonResponse(metadata(channel === "stable" ? VERSION : `${VERSION}-${channel}.1`, { region })) });
      assert.equal(h.calls.length, 0);
      const status = await h.updater.check();
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0].url, `${UPDATE_REGISTRIES[region]}/${UPDATE_PACKAGE}/${tag}`);
      assertSafeRequest(h.calls[0]);
      assert.equal(status.effectiveRegion, region); assert.equal(status.available, true);
      assert.equal(status.errorCode, null); assert.equal(status.lastCheckedAt, CHECKED_AT);
      assert.equal(status.currentVersion, CURRENT); assert.equal(status.checking, false);
      assert.equal(h.writes.length, 0); assert.equal(h.stored.length, 0);
    }
  });
  for (const winner of ["global", "cn"]) test(`auto races both sources: ${winner} wins and loser is aborted`, async (t) => {
    const gates = { global: deferred(), cn: deferred() };
    const h = harness(t, { settings: { region: "auto" }, fetch: (url, { signal }) => pendingFetch(signal, gates[url.startsWith(UPDATE_REGISTRIES.global) ? "global" : "cn"]) });
    const pending = h.updater.check();
    await tick();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls.map((call) => new URL(call.url).origin).sort(), Object.values(UPDATE_REGISTRIES).sort());
    gates[winner].resolve(jsonResponse(metadata(VERSION, { region: winner })));
    const status = await pending;
    assert.equal(status.effectiveRegion, winner); assert.equal(status.latestVersion, VERSION);
    assert.equal(status.available, true); assert.equal(status.errorCode, null);
    assert.ok(h.calls.every((call) => call.init.signal.aborted));
  });
  test("auto ignores a faster invalid response and waits for the valid source", async (t) => {
    const gate = deferred();
    const h = harness(t, { settings: { region: "auto" }, fetch: (url, { signal }) => url.startsWith(UPDATE_REGISTRIES.global) ? jsonResponse({ name: "wrong" }) : pendingFetch(signal, gate) });
    const pending = h.updater.check(); await tick();
    assert.equal(h.updater.status().checking, true);
    gate.resolve(jsonResponse(metadata(VERSION, { region: "cn" })));
    assert.equal((await pending).effectiveRegion, "cn");
    assert.equal(h.updater.status().errorCode, null);
  });
  test("check single-flight blocks save/download and resolves all callers with status", async (t) => {
    const gate = deferred(), h = harness(t, { fetch: (_url, { signal }) => pendingFetch(signal, gate) });
    const first = h.updater.check(), second = h.updater.check();
    assert.equal(first, second); assert.equal(h.updater.status().checking, true);
    await assert.rejects(h.updater.save({ channel: "beta" }), hasCode("busy"));
    assert.throws(() => h.updater.download(VERSION), hasCode("busy"));
    await tick(); assert.equal(h.calls.length, 1);
    gate.resolve(jsonResponse(metadata()));
    assert.equal((await first).latestVersion, VERSION); assert.equal((await second).checking, false);
    assert.equal(h.writes.length, 0);
  });
  for (const [name, response, code] of [
    ["missing channel", () => bytesResponse("missing", { status: 404 }), "channel-unavailable"],
    ["server failure", () => bytesResponse("fake upstream detail", { status: 503 }), "network-error"],
    ["malformed JSON", () => bytesResponse("{bad"), "invalid-metadata"],
    ["wrong package", () => jsonResponse(metadata(VERSION, { name: "untrusted" })), "invalid-metadata"],
    ["wrong stable channel", () => jsonResponse(metadata(`${VERSION}-dev.1`)), "invalid-metadata"],
    ["empty response body", () => new Response(null), "network-error"],
    ["oversized declared metadata", () => bytesResponse("{}", { headers: { "content-length": String(512 * 1024 + 1) } }), "invalid-package"],
    ["oversized streamed metadata", () => bytesResponse(Buffer.alloc(512 * 1024 + 1)), "invalid-package"],
    ["fetch rejection", () => { throw Error("fake-secret-private-network-detail"); }, "network-error"],
  ]) test(`fixed-source ${name} is sanitized with no fallback`, async (t) => {
    const h = harness(t, { fetch: response }), status = await h.updater.check();
    assert.equal(h.calls.length, 1); assert.equal(status.available, false); assert.equal(status.latestVersion, null);
    assert.equal(status.error, code); assert.equal(status.errorCode, code); assert.equal(status.lastCheckedAt, CHECKED_AT);
    assert.ok(!JSON.stringify(status).includes("fake-secret"));
    assert.throws(() => h.updater.download(VERSION), hasCode("stale-version"));
  });
  test("auto failure priority: invalid metadata, channel unavailable, then network error", async (t) => {
    for (const [globalResponse, cnResponse, expected] of [
      [() => jsonResponse({}), () => bytesResponse("missing", { status: 404 }), "invalid-metadata"],
      [() => bytesResponse("missing", { status: 404 }), () => bytesResponse("bad", { status: 503 }), "channel-unavailable"],
      [() => { throw Error("fake failure"); }, () => bytesResponse("bad", { status: 502 }), "network-error"],
    ]) {
      const h = harness(t, { settings: { region: "auto" }, fetch: (url) => (url.startsWith(UPDATE_REGISTRIES.global) ? globalResponse : cnResponse)() });
      assert.equal((await h.updater.check()).errorCode, expected); assert.equal(h.calls.length, 2);
    }
  });
  test("equal, older and build-only versions cannot cause downgrade", async (t) => {
    for (const version of [CURRENT, `${CURRENT}+build`, "1.3.99", `${CURRENT}-beta.1`]) {
      const h = harness(t, { settings: { channel: version.includes("beta") ? "beta" : "stable" }, fetch: () => jsonResponse(metadata(version)) });
      const status = await h.updater.check();
      assert.equal(status.latestVersion, version); assert.equal(status.available, false);
      assert.throws(() => h.updater.download(version), hasCode("stale-version")); assert.equal(h.stored.length, 0);
    }
  });
  test("failed recheck invalidates earlier candidate", async (t) => {
    const h = harness(t); await h.updater.check();
    h.setFetch(() => bytesResponse("missing", { status: 404 }));
    const status = await h.updater.check();
    assert.equal(status.available, false); assert.equal(status.latestVersion, null);
    assert.throws(() => h.updater.download(VERSION), hasCode("stale-version"));
  });
  test("save rejects malformed/unknown fields and persists only independent updater options", async (t) => {
    const h = harness(t);
    for (const patch of [null, [], "bad", { channel: "latest" }, { channel: "toString" }, { region: "elsewhere" }, { autoCheck: "false" }, { autoDownload: 1 }, { autoInstall: "on" }, { accounts: [{}] }, { apiKey: "not-written" }]) await assert.rejects(h.updater.save(patch), hasCode("invalid-settings"));
    assert.equal(h.writes.length, 0);
    const status = await h.updater.save({ autoCheck: false, autoDownload: true, autoInstall: true, channel: "beta", region: "cn" });
    assert.deepEqual(h.writes, [{ autoCheck: false, autoDownload: true, autoInstall: true, channel: "beta", region: "cn" }]);
    assert.deepEqual(h.changes, h.writes); assert.equal(status.channel, "beta"); assert.equal(h.calls.length, 0);
    const snapshot = h.updater.status(); snapshot.channel = "dev";
    assert.equal(h.updater.status().channel, "beta");
  });
  test("source changes clear candidates/commands; toggle-only settings preserve candidate; linked install has no command", async (t) => {
    const h = harness(t, { linkedInstall: true }); await h.updater.check();
    const downloaded = await h.updater.download(VERSION);
    assert.equal(downloaded.blockedReason, "linked-install"); assert.equal(downloaded.upgradeCommand, null);
    const toggled = await h.updater.save({ autoCheck: false });
    assert.equal(toggled.latestVersion, VERSION); assert.equal(toggled.downloadedVersion, VERSION);
    const changed = await h.updater.save({ channel: "beta", region: "cn" });
    assert.equal(changed.latestVersion, null); assert.equal(changed.available, false);
    assert.equal(changed.downloadPath, null); assert.equal(changed.upgradeCommand, null);
    assert.equal(changed.blockedReason, "linked-install");
    assert.throws(() => h.updater.download(VERSION), hasCode("stale-version"));
  });
  test("in-progress save blocks another save, check and download", async (t) => {
    const gate = deferred(), h = harness(t, { writeSettings: () => gate.promise });
    await h.updater.check(); const pending = h.updater.save({ autoDownload: true });
    try {
      await assert.rejects(h.updater.save({ region: "cn" }), hasCode("busy"));
      assert.throws(() => h.updater.check(), hasCode("busy"));
      assert.throws(() => h.updater.download(VERSION), hasCode("busy"));
    } finally { gate.resolve(); await pending; }
    assert.equal(h.updater.status().autoDownload, true);
  });
  test("failed settings persistence is storage-error with no state commit or notification", async (t) => {
    const h = harness(t, { writeSettings: async () => { throw Error("fake-disk-private-path"); } });
    await assert.rejects(h.updater.save({ autoCheck: false, region: "cn" }), hasCode("storage-error"));
    assert.equal(h.updater.status().autoCheck, true); assert.equal(h.updater.status().region, "global");
    assert.deepEqual(h.changes, []); assert.equal(h.calls.length, 0);
  });
});
