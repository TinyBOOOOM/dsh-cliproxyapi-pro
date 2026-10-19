import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  DEFAULT_UPDATE_SETTINGS, UPDATE_INTERVAL_MS, UPDATE_PACKAGE, UPDATE_REGISTRIES, UPDATE_TAGS,
  UpdateError, compareUpdateVersions, createPluginUpdater, loadUpdateSettings,
  normalizeUpdateSettings, parseUpdateVersion, saveUpdateSettings, storeUpdatePackage,
  validateUpdateMetadata, verifyUpdatePackage,
} from "../lib/updater.js";

// Any accidental fallback is a fake too: this suite never contacts the network.
let originalFetch;
before(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("Real fetch is forbidden in updater tests"); };
});
after(() => { globalThis.fetch = originalFetch; });

const VERSION = "1.5.0", CURRENT = "1.4.1", CHECKED_AT = "2026-10-19T12:00:00.000Z";
const requiredFiles = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json"];
const hasCode = (code) => (error) => error instanceof UpdateError && error.code === code && error.message === code;
const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const deferred = () => {
  let resolvePromise, rejectPromise;
  const promise = new Promise((yes, no) => { resolvePromise = yes; rejectPromise = no; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};
const tick = () => new Promise((done) => setImmediate(done));

function temporaryDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), "dsh-updater-test-"));
  t.after(() => {
    // Resolve and verify the exact allocated system-temp directory before deletion.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("dsh-updater-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function manifest(version = VERSION, patch = {}) {
  return { name: UPDATE_PACKAGE, version, type: "module", dsh: { bundle: { patch: "./cordis.patch.yml" } }, ...patch };
}
function packageEntries(version = VERSION, patch = {}) {
  return [
    { name: "package/package.json", data: JSON.stringify(manifest(version, patch)) },
    // Inert payloads: verification must never import or evaluate either file.
    { name: "package/lib/index.js", data: "globalThis.__updaterArchiveExecuted = true; throw Error('never execute');" },
    { name: "package/lib/client.js", data: "throw Error('never execute client');" },
    { name: "package/cordis.patch.yml", data: "- name: dsh-cliproxyapi-pro\n" },
    { name: "package/locale/en.json", data: "{}" },
    { name: "package/locale/zh.json", data: "{}" },
  ];
}
// Built-in-only ustar fixture builder. No fixture is extracted to disk.
function tarBytes(entries, { terminator = true } = {}) {
  const chunks = [];
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(32, 148, 156);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    if (entry.linkname) header.write(entry.linkname, 157, 100, "utf8");
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    if (entry.prefix) header.write(entry.prefix, 345, 155, "utf8");
    entry.mutateHeader?.(header);
    const sum = header.reduce((total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte), 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  if (terminator) chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}
function fixture({ version = VERSION, patch = {}, entries = packageEntries(version, patch), tar = tarBytes(entries) } = {}) {
  const bytes = gzipSync(tar);
  return { bytes, expected: { version, integrity: integrity(bytes) } };
}
const goodPackage = fixture();
function metadata(version = VERSION, { region = "global", sri = goodPackage.expected.integrity, ...patch } = {}) {
  return { name: UPDATE_PACKAGE, version, dist: {
    tarball: `${UPDATE_REGISTRIES[region]}/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${version}.tgz`, integrity: sri,
  }, ...patch };
}
const jsonResponse = (value, init = {}) => new Response(JSON.stringify(value), { status: 200, ...init });
const bytesResponse = (bytes, init = {}) => new Response(bytes, { status: 200, ...init });
function pendingFetch(signal, gate) {
  return new Promise((yes, no) => {
    const abort = () => no(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    gate.promise.then(yes, no).finally(() => signal.removeEventListener("abort", abort));
  });
}
function harness(t, options = {}) {
  const calls = [], writes = [], stored = [], changes = [];
  let savedSettings = { region: "global", ...options.settings };
  let handler = options.fetch ?? ((url) => url.endsWith(".tgz") ? bytesResponse(goodPackage.bytes) : jsonResponse(metadata()));
  const updater = createPluginUpdater({
    currentVersion: options.currentVersion ?? CURRENT,
    profileName: Object.hasOwn(options, "profileName") ? options.profileName : "offline test profile",
    linkedInstall: options.linkedInstall ?? false,
    readSettings: () => ({ ...savedSettings }),
    writeSettings: options.writeSettings ?? (async (next) => { writes.push({ ...next }); savedSettings = { ...next }; }),
    fetch: (url, init) => { calls.push({ url, init }); return handler(url, init); },
    storePackage: options.storePackage ?? (async (version, bytes) => {
      stored.push({ version, bytes: Buffer.from(bytes) });
      return join(tmpdir(), "dsh-updater-fake-cache", `${UPDATE_PACKAGE}-${version}.tgz`);
    }),
    now: () => CHECKED_AT,
    onSettingsChanged: (next) => changes.push({ ...next }),
  });
  t.after(() => updater.dispose());
  return { updater, calls, writes, stored, changes, setFetch: (next) => { handler = next; } };
}
function assertSafeRequest(call) {
  assert.equal(call.init.redirect, new URL(call.url).pathname.endsWith(".tgz") ? "manual" : "error");
  assert.equal(call.init.credentials, "omit");
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(call.init.headers), ["accept"]);
  assert.equal(new URL(call.url).protocol, "https:");
}

// TESTS
describe("independent update settings and atomic offline storage", () => {
  test("explicit defaults; normalization never copies account secrets or unknown fields", () => {
    assert.deepEqual(DEFAULT_UPDATE_SETTINGS, { autoCheck: true, autoDownload: false, channel: "stable", region: "auto" });
    assert.ok(Object.isFrozen(DEFAULT_UPDATE_SETTINGS));
    assert.deepEqual(UPDATE_TAGS, { stable: "latest", beta: "beta", dev: "dev" });
    assert.equal(UPDATE_INTERVAL_MS, 6 * 60 * 60 * 1000);
    for (const raw of [undefined, null, false, [], "bad", { autoCheck: "false", autoDownload: 1, channel: "latest", region: "nearby" }]) assert.deepEqual(normalizeUpdateSettings(raw), DEFAULT_UPDATE_SETTINGS);
    assert.deepEqual(normalizeUpdateSettings({ autoCheck: false, autoDownload: true, channel: "dev", region: "cn", apiKey: "fake-secret", accounts: [{}] }), { autoCheck: false, autoDownload: true, channel: "dev", region: "cn" });
    assert.deepEqual(normalizeUpdateSettings({ channel: "toString", region: "GLOBAL" }), DEFAULT_UPDATE_SETTINGS);
  });
  test("missing settings default on; corrupt, unreadable and invalid persisted shapes default off", (t) => {
    const root = temporaryDirectory(t), file = join(root, "updates.json");
    assert.deepEqual(loadUpdateSettings(file), DEFAULT_UPDATE_SETTINGS);
    assert.deepEqual(loadUpdateSettings(root), { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false });
    for (const raw of ["{bad", "null", "[]", "false", '"bad"', "{}", '{"version":2}', ...[{ autoCheck: "false" }, { autoDownload: 1 }, { channel: "latest" }, { region: "nearby" }].map((patch) => JSON.stringify({ version: 1, ...patch }))]) {
      writeFileSync(file, raw);
      assert.deepEqual(loadUpdateSettings(file), { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false }, raw);
    }
    writeFileSync(file, JSON.stringify({ version: 1, autoCheck: false, channel: "beta", region: "cn", autoDownload: true }));
    assert.deepEqual(loadUpdateSettings(file), { autoCheck: false, autoDownload: true, channel: "beta", region: "cn" });
  });
  test("atomic save writes only versioned updater settings and preserves fake sibling account state", (t) => {
    const root = temporaryDirectory(t), account = join(root, "state.json"), file = join(root, "updates", "settings.json");
    const accountBytes = '{"version":2,"accounts":[{"id":"fake","apiKeyRef":"TEST_ONLY"}]}\n';
    writeFileSync(account, accountBytes);
    saveUpdateSettings(file, { autoCheck: false, autoDownload: true, channel: "beta", region: "cn", apiKey: "never-persist" });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { version: 1, autoCheck: false, autoDownload: true, channel: "beta", region: "cn" });
    assert.equal(readFileSync(account, "utf8"), accountBytes);
    assert.deepEqual(readdirSync(dirname(file)), ["settings.json"]);
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
    saveUpdateSettings(file, {});
    assert.deepEqual(loadUpdateSettings(file), DEFAULT_UPDATE_SETTINGS);
  });
  test("settings mkdir/rename errors map to storage-error and clean temporary files", (t) => {
    const root = temporaryDirectory(t), dir = join(root, "target-directory"), parent = join(root, "parent-file");
    mkdirSync(dir); writeFileSync(parent, "not a directory");
    assert.throws(() => saveUpdateSettings(dir, {}), hasCode("storage-error"));
    assert.throws(() => saveUpdateSettings(join(parent, "updates.json"), {}), hasCode("storage-error"));
    assert.deepEqual(readdirSync(root).sort(), ["parent-file", "target-directory"]);
  });
  test("package storage writes a versioned tgz only: no extraction, scripts or profile writes", (t) => {
    const root = temporaryDirectory(t), cache = join(root, "downloads");
    const path = storeUpdatePackage(cache, VERSION, goodPackage.bytes);
    assert.equal(path, join(cache, `${UPDATE_PACKAGE}-${VERSION}.tgz`));
    assert.deepEqual(readFileSync(path), goodPackage.bytes);
    assert.deepEqual(readdirSync(cache), [`${UPDATE_PACKAGE}-${VERSION}.tgz`]);
    assert.equal(globalThis.__updaterArchiveExecuted, undefined);
    if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
    storeUpdatePackage(cache, VERSION, goodPackage.bytes);
    for (const version of ["../escape", "v1.0.0", "1.0", "1.0.0/evil", "1.0.0\n"]) assert.throws(() => storeUpdatePackage(cache, version, goodPackage.bytes), hasCode("invalid-package"));
    assert.deepEqual(readdirSync(root), ["downloads"]);
  });
  test("package storage maps mkdir/rename errors and cleans temporary files", (t) => {
    const root = temporaryDirectory(t), cache = join(root, "cache"), parent = join(root, "parent-file");
    mkdirSync(join(cache, `${UPDATE_PACKAGE}-${VERSION}.tgz`), { recursive: true });
    writeFileSync(parent, "not a directory");
    assert.throws(() => storeUpdatePackage(cache, VERSION, goodPackage.bytes), hasCode("storage-error"));
    assert.deepEqual(readdirSync(cache), [`${UPDATE_PACKAGE}-${VERSION}.tgz`]);
    assert.throws(() => storeUpdatePackage(join(parent, "cache"), VERSION, goodPackage.bytes), hasCode("storage-error"));
  });
});

describe("strict SemVer and registry metadata", () => {
  test("rejects coercion, leading zeroes, unsafe integers, whitespace and shell/path syntax", () => {
    assert.deepEqual(parseUpdateVersion("1.2.3-beta.2+build.004"), { parts: [1, 2, 3], pre: ["beta", "2"] });
    assert.deepEqual(parseUpdateVersion("0.0.0"), { parts: [0, 0, 0], pre: [] });
    for (const value of [null, 123, {}, "", "v1.2.3", "=1.2.3", " 1.2.3", "1.2.3 ", "1.2.3\n", "1.2", "01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3-beta.01", "1.2.3-", "1.2.3+", "1.2.3-a..b", "1.2.3+a..b", "1.2.3_beta", "9007199254740992.0.0", "1.0.0-9007199254740992", "1.0.0/../../x", "1.0.0;echo bad", "1.0.0+" + "a".repeat(128)]) assert.equal(parseUpdateVersion(value), null, JSON.stringify(value));
  });
  test("SemVer prerelease precedence is numeric, not model sorting; builds do not affect precedence", () => {
    const versions = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0", "10.0.0"];
    for (let i = 0; i < versions.length; i++) {
      assert.equal(compareUpdateVersions(versions[i], versions[i]), 0);
      for (let j = i + 1; j < versions.length; j++) {
        assert.equal(compareUpdateVersions(versions[i], versions[j]), -1);
        assert.equal(compareUpdateVersions(versions[j], versions[i]), 1);
      }
    }
    assert.equal(compareUpdateVersions("1.0.0+first", "1.0.0+second"), 0);
    assert.throws(() => compareUpdateVersions("v1.0.0", "1.0.0"), hasCode("invalid-metadata"));
    assert.throws(() => compareUpdateVersions("1.0.0", "bad"), hasCode("invalid-metadata"));
  });
  test("requires the package identity and exact allowlisted HTTPS tarball location", () => {
    for (const region of ["global", "cn"]) assert.deepEqual(validateUpdateMetadata(metadata(VERSION, { region }), "stable"), goodPackage.expected);
    const valid = metadata();
    const urls = [
      `http://registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org.evil.invalid/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://evil.invalid/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org:8443/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://user:password@registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `${valid.dist.tarball}?token=fake`, `${valid.dist.tarball}#fragment`,
      `https://registry.npmjs.org/other/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-9.9.9.tgz`,
      `${valid.dist.tarball}/extra`, "file:///tmp/fake.tgz", "not a URL",
    ];
    for (const tarball of urls) assert.throws(() => validateUpdateMetadata({ ...valid, dist: { ...valid.dist, tarball } }, "stable"), hasCode("invalid-metadata"), tarball);
    for (const raw of [null, {}, { ...valid, name: "other" }, { ...valid, version: "v1.5.0" }, { ...valid, dist: null }]) assert.throws(() => validateUpdateMetadata(raw, "stable"), hasCode("invalid-metadata"));
  });
  test("stable/beta/dev reject wrong prerelease tags and unknown channels, allow release promotion", () => {
    for (const channel of ["stable", "beta", "dev"]) assert.equal(validateUpdateMetadata(metadata(), channel).version, VERSION);
    for (const channel of ["beta", "dev"]) assert.equal(validateUpdateMetadata(metadata(`${VERSION}-${channel}.2`), channel).version, `${VERSION}-${channel}.2`);
    for (const [channel, version] of [["stable", `${VERSION}-beta.1`], ["stable", `${VERSION}-dev.1`], ["beta", `${VERSION}-dev.1`], ["dev", `${VERSION}-beta.1`], ["beta", `${VERSION}-alphabetabeta.1`], ["dev", `${VERSION}-rc.1`]]) assert.throws(() => validateUpdateMetadata(metadata(version), channel), hasCode("invalid-metadata"));
    for (const channel of [undefined, null, "latest", "toString", "preview"]) assert.throws(() => validateUpdateMetadata(metadata(), channel), hasCode("invalid-metadata"));
  });
  test("sha512 SRI must be complete; weaker digest alone is not enough", () => {
    const valid = metadata();
    for (const sri of [undefined, null, 123, "", "sha1-ZmFrZQ==", "sha256-" + "A".repeat(44), "sha512-" + "A".repeat(86), "sha512-" + "A".repeat(85) + "==", "sha512-" + "_".repeat(86) + "=="]) assert.throws(() => validateUpdateMetadata({ ...valid, dist: { ...valid.dist, integrity: sri } }, "stable"), hasCode("invalid-metadata"));
    const sri = `sha1-ZmFrZQ== ${goodPackage.expected.integrity}`;
    assert.equal(validateUpdateMetadata({ ...valid, dist: { ...valid.dist, integrity: sri } }, "stable").integrity, sri);
  });
});

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
    for (const patch of [null, [], "bad", { channel: "latest" }, { channel: "toString" }, { region: "elsewhere" }, { autoCheck: "false" }, { autoDownload: 1 }, { accounts: [{}] }, { apiKey: "not-written" }]) await assert.rejects(h.updater.save(patch), hasCode("invalid-settings"));
    assert.equal(h.writes.length, 0);
    const status = await h.updater.save({ autoCheck: false, autoDownload: true, channel: "beta", region: "cn" });
    assert.deepEqual(h.writes, [{ autoCheck: false, autoDownload: true, channel: "beta", region: "cn" }]);
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

describe("SRI, gzip and restricted tar verification without extraction", () => {
  test("minimal npm archive plus allowed optional entries verifies without execution", () => {
    const entries = [
      { name: "package/", type: "5" }, { name: "package/lib/", type: "5" }, { name: "package/locale/", type: "5" },
      ...packageEntries(), ...["README.md", "README.en.md", "CHANGELOG.md", "LICENSE", "icon.svg", "lib/updater.js"].map((name) => ({ name: `package/${name}`, data: "test only" })),
    ];
    const pkg = fixture({ entries }); assert.deepEqual(verifyUpdatePackage(pkg.bytes, pkg.expected), manifest());
    assert.equal(globalThis.__updaterArchiveExecuted, undefined);
    const nul = fixture({ entries: packageEntries().map((entry) => ({ ...entry, type: "\0" })) });
    assert.equal(verifyUpdatePackage(nul.bytes, nul.expected).version, VERSION);
  });
  test("SRI is checked before gzip/tar", () => {
    assert.throws(() => verifyUpdatePackage(goodPackage.bytes, { ...goodPackage.expected, integrity: integrity(Buffer.from("wrong")) }), hasCode("integrity-error"));
    const corrupted = Buffer.from(goodPackage.bytes); corrupted[corrupted.length - 1] ^= 1;
    assert.throws(() => verifyUpdatePackage(corrupted, goodPackage.expected), hasCode("integrity-error"));
    assert.throws(() => verifyUpdatePackage(goodPackage.bytes, { ...goodPackage.expected, integrity: "sha1-fake" }), hasCode("invalid-metadata"));
  });
  test("invalid/truncated gzip and decompression bombs are rejected", () => {
    for (const bytes of [Buffer.from("not gzip"), goodPackage.bytes.subarray(0, -4), gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1))]) assert.throws(() => verifyUpdatePackage(bytes, { version: VERSION, integrity: integrity(bytes) }), hasCode("invalid-package"));
  });
  for (const missing of requiredFiles) test(`requires ${missing}`, () => {
    const pkg = fixture({ entries: packageEntries().filter((entry) => entry.name !== `package/${missing}`) });
    assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
  });
  for (const path of ["../escape", "/absolute", "C:/absolute", "package/../escape", "package/lib/../../escape", "package/./package.json", "package/lib\\evil.js", "package//package.json", "package/node_modules/evil.js", "package/.npmrc", "package/lib/evil.mjs", "other/package.json"]) test(`rejects unsafe/unshipped path ${JSON.stringify(path)}`, () => {
    const pkg = fixture({ entries: [...packageEntries(), { name: path, data: "malicious test bytes" }] });
    assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
  });
  for (const type of ["1", "2", "3", "4", "6", "7", "x", "g", "L", "K"]) test(`rejects link/special/extension tar type ${type}`, () => {
    const pkg = fixture({ entries: [...packageEntries(), { name: "package/lib/evil.js", type, linkname: "../../outside" }] });
    assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
  });
  test("rejects ustar-prefix traversal, duplicate files and illegal directory entries", () => {
    for (const extra of [
      { name: "evil.js", prefix: "package/../outside", data: "x" },
      { name: "package/lib/index.js", data: "duplicate" },
      { name: "package/not-shipped/", type: "5" },
      { name: "package/lib/", type: "5", data: "nonempty directory" },
    ]) {
      const pkg = fixture({ entries: [...packageEntries(), extra] });
      assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    }
  });
  test("rejects tar checksum, size, truncation, missing terminator and nonzero tail errors", () => {
    const valid = tarBytes(packageEntries()), checksum = Buffer.from(valid); checksum[0] ^= 1;
    const invalidSize = tarBytes(packageEntries().map((entry, i) => i ? entry : { ...entry, mutateHeader: (header) => header.write("99999999999\0", 124, 12) }));
    const oversized = tarBytes(packageEntries().map((entry, i) => i ? entry : { ...entry, mutateHeader: (header) => header.write((16 * 1024 * 1024 + 1).toString(8).padStart(11, "0") + "\0", 124, 12) }));
    for (const tar of [checksum, invalidSize, oversized, valid.subarray(0, 600), tarBytes(packageEntries(), { terminator: false }), Buffer.concat([valid, Buffer.from([1])])]) {
      const pkg = fixture({ tar }); assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    }
  });
  test("manifest must be valid JSON and match identity, version and bundle patch", () => {
    for (const patch of [{ name: "other" }, { version: "9.9.9" }, { dsh: {} }, { dsh: { bundle: { patch: "./evil.yml" } } }]) {
      const pkg = fixture({ patch }); assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    }
    for (const data of ["{bad JSON", "null", "[]"]) {
      const pkg = fixture({ entries: packageEntries().map((entry) => entry.name === "package/package.json" ? { ...entry, data } : entry) });
      assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    }
  });
  for (const field of ["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies"]) test(`rejects runtime dependency field ${field}`, () => {
    const pkg = fixture({ patch: { [field]: field.includes("bundl") ? ["evil"] : { evil: "1.0.0" } } });
    assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
  });
  for (const script of ["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) test(`rejects lifecycle script ${script} without execution`, () => {
    const pkg = fixture({ patch: { scripts: { [script]: "throw-this-is-inert-test-data" } } });
    assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    assert.equal(globalThis.__updaterArchiveExecuted, undefined);
  });
});

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
describe("bounded validated tarball redirects with immutable metadata integrity", () => {
  const registryPath = `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`;
  const cnUrl = `${UPDATE_REGISTRIES.cn}${registryPath}`;
  const globalUrl = `${UPDATE_REGISTRIES.global}${registryPath}`;
  const cdnPath = `/packages/${UPDATE_PACKAGE}/${VERSION}/${UPDATE_PACKAGE}-${VERSION}.tgz`;
  const cdnUrl = `https://cdn.npmmirror.com${cdnPath}`;
  const redirectResponse = (location, status = 302, extraHeaders = {}) => new Response("discard redirect body", {
    status, headers: { ...(location === undefined ? {} : { location }), ...extraHeaders },
  });

  for (const code of [301, 302, 303, 307, 308]) test(`CN ${code} follows only the exact official CDN package URL`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    let cancelled = 0;
    h.setFetch((url) => {
      if (url === cnUrl) return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: code, headers: { location: cdnUrl } });
      assert.equal(url, cdnUrl);
      return bytesResponse(goodPackage.bytes);
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, null); assert.equal(status.downloadedVersion, VERSION);
    assert.equal(status.effectiveRegion, "cn"); assert.equal(h.stored.length, 1);
    assert.deepEqual(h.stored[0].bytes, goodPackage.bytes); assert.equal(cancelled, 1);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl]);
    h.calls.forEach(assertSafeRequest);
    assert.equal(h.calls[1].init.signal, h.calls[2].init.signal);
  });

  for (const [name, location] of [
    ["HTTP downgrade", `http://cdn.npmmirror.com${cdnPath}`],
    ["external host", `https://evil.invalid${cdnPath}`],
    ["CDN hostname suffix spoof", `https://cdn.npmmirror.com.evil.invalid${cdnPath}`],
    ["loopback IPv4", `https://127.0.0.1${cdnPath}`],
    ["localhost", `https://localhost${cdnPath}`],
    ["loopback IPv6", `https://[::1]${cdnPath}`],
    ["local file URL", "file:///tmp/never-read.tgz"],
    ["cross-region npmjs", globalUrl],
    ["credentials", `https://user:password@cdn.npmmirror.com${cdnPath}`],
    ["unexpected port", `https://cdn.npmmirror.com:8443${cdnPath}`],
    ["query string", `${cdnUrl}?token=not-forwarded`],
    ["fragment", `${cdnUrl}#untrusted`],
    ["wrong package", cdnUrl.replaceAll(UPDATE_PACKAGE, "other-package")],
    ["wrong version", cdnUrl.replaceAll(VERSION, "9.9.9")],
    ["wrong CDN layout", `https://cdn.npmmirror.com${registryPath}`],
    ["wrong registry layout", `${UPDATE_REGISTRIES.cn}${cdnPath}`],
    ["wrong relative path", "/packages/other/wrong.tgz"],
    ["encoded path segment", cdnUrl.replace("/packages/", "/%70ackages/")],
    ["missing Location", undefined],
    ["malformed URL", "https://[invalid-host"],
  ]) test(`CN redirect rejects ${name} before a second fetch`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    const response = redirectResponse(location);
    h.setFetch(() => response);
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.calls.length, 2);
    assert.equal(h.stored.length, 0); assert.equal(status.downloadPath, null); assert.equal(status.upgradeCommand, null);
    assert.equal(response.bodyUsed, true, "rejected redirect body is cancelled");
    assertSafeRequest(h.calls[1]);
  });

  for (const target of [cnUrl, cdnUrl]) test(`global source refuses cross-region redirect to ${new URL(target).hostname}`, async (t) => {
    const h = harness(t); await h.updater.check(); h.setFetch(() => redirectResponse(target));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.calls.length, 2); assert.equal(h.stored.length, 0);
    assert.equal(h.calls[1].url, globalUrl);
  });

  test("metadata always uses redirect:error and never follows even an allowed registry Location", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => redirectResponse(`${UPDATE_REGISTRIES.cn}/${UPDATE_PACKAGE}/latest`) });
    const status = await h.updater.check();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.redirect, "error");
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.stored.length, 0);
  });

  test("exactly three validated redirect hops succeed, including same-region relative Location", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    let requests = 0;
    h.setFetch(() => {
      requests++;
      if (requests === 1) return redirectResponse(cdnUrl);
      if (requests === 2) return redirectResponse(cnUrl, 307);
      if (requests === 3) return redirectResponse(registryPath, 308);
      return bytesResponse(goodPackage.bytes);
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, null); assert.equal(status.downloadedVersion, VERSION);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl, cnUrl, cnUrl]);
    assert.equal(requests, 4); assert.equal(h.stored.length, 1);
    h.calls.forEach(assertSafeRequest);
  });

  test("redirect loops stop after three hops and cancel every redirect response", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    const responses = [];
    h.setFetch((url) => {
      const response = redirectResponse(url === cnUrl ? cdnUrl : cnUrl);
      responses.push(response); return response;
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(responses.length, 4);
    assert.ok(responses.every((response) => response.bodyUsed));
    assert.equal(h.calls.length, 5); assert.equal(h.stored.length, 0); assert.equal(status.downloadPath, null);
  });

  test("CDN redirect headers cannot replace the original metadata SHA-512", async (t) => {
    const attacker = fixture({ entries: packageEntries().map((entry) => entry.name === "package/lib/index.js" ? { ...entry, data: "different archive with the same manifest" } : entry) });
    assert.notEqual(attacker.expected.integrity, goodPackage.expected.integrity);
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl
      ? redirectResponse(cdnUrl, 302, { integrity: attacker.expected.integrity, "x-integrity": attacker.expected.integrity })
      : bytesResponse(attacker.bytes, { headers: { integrity: attacker.expected.integrity } }));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "integrity-error"); assert.equal(h.stored.length, 0);
    assert.equal(status.downloadPath, null); assert.equal(status.upgradeCommand, null);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl]);
  });

  for (const [code, expected] of [[404, "channel-unavailable"], [500, "network-error"]]) test(`CDN final HTTP ${code} is sanitized and never stored`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl ? redirectResponse(cdnUrl) : bytesResponse("fake failure", { status: code }));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, expected); assert.equal(h.stored.length, 0); assert.equal(h.calls.length, 3);
  });

  test("CDN final response retains the download byte bound", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl ? redirectResponse(cdnUrl) : bytesResponse("small", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }));
    assert.equal((await h.updater.download(VERSION)).errorCode, "invalid-package");
    assert.equal(h.stored.length, 0);
  });

  test("dispose aborts the CDN follow-up request using the same signal", async (t) => {
    const entered = deferred(), gate = deferred();
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url, { signal }) => {
      if (url === cnUrl) return redirectResponse(cdnUrl);
      entered.resolve(); return pendingFetch(signal, gate);
    });
    const pending = h.updater.download(VERSION); await entered.promise; h.updater.dispose(); await pending;
    assert.equal(h.calls[1].init.signal, h.calls[2].init.signal); assert.ok(h.calls[2].init.signal.aborted);
    assert.equal(h.stored.length, 0); assert.equal(h.updater.status().upgradeCommand, null);
  });
});
// END TESTS
