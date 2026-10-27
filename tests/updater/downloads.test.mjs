// Verified downloads, opt-in automation and disposal.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  UPDATE_PACKAGE, UPDATE_REGISTRIES, storeUpdatePackage,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, hasCode, integrity, deferred, tick, temporaryDirectory, packageEntries, fixture, goodPackage, metadata, jsonResponse, bytesResponse, pendingFetch, harness, assertSafeRequest, CURRENT,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

describe("verified download, opt-in automation and disposal", () => {
  test("download uses selected registry, stores verified bytes only and returns inert quoted CLI guidance", async (t) => {
    const root = temporaryDirectory(t), cache = join(root, "offline packages");
    const h = harness(t, {
      settings: { region: "cn" }, profileName: "offline profile $name; with spaces",
      fetch: (url) => url.endsWith(".tgz") ? bytesResponse(goodPackage.bytes) : jsonResponse(metadata(VERSION, { region: "cn" })),
      storePackage: (version, bytes) => storeUpdatePackage(cache, version, bytes),
    });
    await h.updater.check();
    assert.throws(() => h.updater.download("9.9.9"), hasCode("stale-version"));
    const status = await h.updater.download(VERSION);
    assert.equal(h.calls[1].url, `${UPDATE_REGISTRIES.cn}/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`);
    assertSafeRequest(h.calls[1]);
    assert.equal(status.downloadedVersion, VERSION); assert.equal(status.downloading, false); assert.equal(status.errorCode, null);
    assert.equal(status.downloadPath, join(cache, `${UPDATE_PACKAGE}-${VERSION}.tgz`));
    assert.equal(status.upgradeCommand, `dsh plugin --profile 'offline profile $name; with spaces' add '${status.downloadPath}'`);
    assert.deepEqual(readFileSync(status.downloadPath), goodPackage.bytes);
    assert.deepEqual(readdirSync(cache), [`${UPDATE_PACKAGE}-${VERSION}.tgz`]);
    assert.equal(globalThis.__updaterArchiveExecuted, undefined); assert.deepEqual(h.writes, []);
  });
  test("download single-flight returns status to every caller and blocks check/save", async (t) => {
    const gate = deferred(), h = harness(t); await h.updater.check();
    h.setFetch((_url, { signal }) => pendingFetch(signal, gate));
    const first = h.updater.download(VERSION), second = h.updater.download(VERSION);
    try {
      assert.equal(first, second); assert.equal(h.updater.status().downloading, true);
      assert.throws(() => h.updater.check(), hasCode("busy"));
      await assert.rejects(h.updater.save({ region: "cn" }), hasCode("busy"));
    } finally { gate.resolve(bytesResponse(goodPackage.bytes)); }
    const [a, b] = await Promise.all([first, second]);
    assert.deepEqual(a, b); assert.equal(a.downloadedVersion, VERSION);
    assert.equal(h.stored.length, 1); assert.equal(h.calls.length, 2);
  });
  for (const [name, response, expected] of [
    ["wrong SRI", () => bytesResponse(Buffer.from("tampered")), "integrity-error"],
    ["missing tarball", () => bytesResponse("missing", { status: 404 }), "channel-unavailable"],
    ["HTTP failure", () => bytesResponse("bad", { status: 500 }), "network-error"],
    ["declared oversized package", () => bytesResponse("small", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }), "invalid-package"],
    ["streamed oversized package", () => bytesResponse(Buffer.alloc(8 * 1024 * 1024 + 1)), "invalid-package"],
  ]) test(`download ${name} never reaches storage`, async (t) => {
    const h = harness(t); await h.updater.check(); h.setFetch(response);
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, expected); assert.equal(status.downloadPath, null);
    assert.equal(status.upgradeCommand, null); assert.equal(h.stored.length, 0);
  });
  test("matching SRI is insufficient for malformed archive", async (t) => {
    const bytes = Buffer.from("not gzip");
    const h = harness(t, { fetch: (url) => url.endsWith(".tgz") ? bytesResponse(bytes) : jsonResponse(metadata(VERSION, { sri: integrity(bytes) })) });
    await h.updater.check();
    assert.equal((await h.updater.download(VERSION)).errorCode, "invalid-package"); assert.equal(h.stored.length, 0);
  });
  test("a rejected package logs the concrete reason while the page keeps only the code", async (t) => {
    const bad = fixture({ entries: [...packageEntries(), { name: "package/undeclared.md", data: "x" }] });
    const h = harness(t, { fetch: (url) => url.endsWith(".tgz") ? bytesResponse(bad.bytes) : jsonResponse(metadata(VERSION, { sri: bad.expected.integrity })) });
    await h.updater.check(); const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(status.error, "invalid-package");
    assert.ok(!JSON.stringify(status).includes("undeclared.md"));
    assert.equal(h.warnings.length, 1); assert.match(h.warnings[0], /invalid-package: file not declared .*undeclared\.md/);
  });
  test("storage failure is sanitized storage-error, not successful downloaded state", async (t) => {
    const h = harness(t, { storePackage: async () => { throw Error("fake-private-disk-path"); } });
    await h.updater.check(); const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "storage-error"); assert.equal(status.downloadedVersion, null);
    assert.equal(status.downloadPath, null); assert.equal(status.upgradeCommand, null);
    assert.ok(!JSON.stringify(status).includes("fake-private"));
  });
  test("unsafe profile/cache names suppress shell guidance", async (t) => {
    for (const [profileName, path] of [["profile'bad", "safe.tgz"], ["profile\nbad", "safe.tgz"], ["safe", "file'bad.tgz"], ["safe", "file\r\nbad.tgz"], [null, "safe.tgz"], ["safe\0bad", "safe.tgz"]]) {
      const h = harness(t, { profileName, storePackage: async () => path });
      await h.updater.check(); const status = await h.updater.download(VERSION);
      assert.equal(status.downloadedVersion, VERSION); assert.equal(status.upgradeCommand, null);
    }
  });
  test("automatic download needs both switches; disabled autoCheck makes no automatic fetch; manual checks never download", async (t) => {
    for (const [autoCheck, autoDownload, automatic, count] of [[true, false, true, 0], [false, true, true, 0], [true, true, false, 0], [false, true, false, 0], [true, true, true, 1]]) {
      const h = harness(t, { settings: { autoCheck, autoDownload } }); assert.equal(h.calls.length, 0);
      const status = await h.updater.check({ automatic });
      assert.equal(h.stored.length, count, JSON.stringify({ autoCheck, autoDownload, automatic }));
      assert.equal(h.calls.length, automatic && !autoCheck ? 0 : count + 1);
      assert.equal(status.checking, false); assert.equal(status.downloading, false);
      if (count) {
        assert.equal(status.downloadedVersion, VERSION); await h.updater.check({ automatic: true });
        assert.equal(h.stored.length, 1, "verified version is not redownloaded");
      }
    }
  });
  test("automatic unavailable/error checks cannot start download", async (t) => {
    for (const response of [() => jsonResponse(metadata(CURRENT)), () => bytesResponse("missing", { status: 404 })]) {
      const h = harness(t, { settings: { autoCheck: true, autoDownload: true }, fetch: response });
      await h.updater.check({ automatic: true }); assert.equal(h.stored.length, 0); assert.equal(h.calls.length, 1);
    }
  });
  test("dispose aborts check, prevents stale state and rejects new operations", async (t) => {
    const gate = deferred(), h = harness(t, { settings: { autoCheck: true, autoDownload: true }, fetch: (_url, { signal }) => pendingFetch(signal, gate) });
    const pending = h.updater.check({ automatic: true }); await tick(); h.updater.dispose();
    assert.ok(h.calls[0].init.signal.aborted); await pending;
    assert.equal(h.updater.status().latestVersion, null); assert.equal(h.updater.status().lastCheckedAt, null);
    assert.equal(h.stored.length, 0);
    assert.throws(() => h.updater.check(), hasCode("disposed"));
    assert.throws(() => h.updater.download(VERSION), hasCode("disposed"));
    await assert.rejects(h.updater.save({ autoCheck: false }), hasCode("disposed")); h.updater.dispose();
  });
  test("dispose aborts download before verification/storage", async (t) => {
    const h = harness(t); await h.updater.check(); const gate = deferred();
    h.setFetch((_url, { signal }) => pendingFetch(signal, gate));
    const pending = h.updater.download(VERSION); await tick(); h.updater.dispose();
    assert.ok(h.calls.at(-1).init.signal.aborted); await pending;
    assert.equal(h.stored.length, 0); assert.equal(h.updater.status().downloadPath, null);
    assert.equal(h.updater.status().upgradeCommand, null);
  });
  test("dispose during storage cannot publish downloaded state or CLI command", async (t) => {
    const entered = deferred(), gate = deferred();
    const h = harness(t, { storePackage: async () => { entered.resolve(); return gate.promise; } });
    await h.updater.check(); const pending = h.updater.download(VERSION); await entered.promise;
    h.updater.dispose(); gate.resolve(join(tmpdir(), "fake-never-installed.tgz")); await pending;
    assert.equal(h.updater.status().downloadedVersion, null); assert.equal(h.updater.status().upgradeCommand, null);
  });
  test("dispose during settings persistence cannot commit or notify", async (t) => {
    const gate = deferred(), h = harness(t, { writeSettings: () => gate.promise });
    const pending = h.updater.save({ autoCheck: false }); h.updater.dispose(); gate.resolve();
    await assert.rejects(pending, hasCode("disposed")); assert.equal(h.updater.status().autoCheck, true);
    assert.deepEqual(h.changes, []);
  });
});
