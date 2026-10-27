// Offline updater fixtures: fetch guard, ustar/gzip package builders, registry metadata and an injected updater harness.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  UPDATE_PACKAGE, UPDATE_REGISTRIES, UpdateError, createPluginUpdater,
} from "../../lib/updater/index.js";

// Any accidental fallback is a fake too: this suite never contacts the network.
// Call at the top level of every updater test file.
export function guardRealFetch() {
  let originalFetch;
  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw Error("Real fetch is forbidden in updater tests"); };
  });
  after(() => { globalThis.fetch = originalFetch; });
}

export const VERSION = "1.5.0", CURRENT = "1.4.1", CHECKED_AT = "2026-10-19T12:00:00.000Z";
export const requiredFiles = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json"];
export const hasCode = (code) => (error) => error instanceof UpdateError && error.code === code && error.message === code;
export const integrity = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
export const deferred = () => {
  let resolvePromise, rejectPromise;
  const promise = new Promise((yes, no) => { resolvePromise = yes; rejectPromise = no; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};
export const tick = () => new Promise((done) => setImmediate(done));

export function temporaryDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), "dsh-updater-test-"));
  t.after(() => {
    // Resolve and verify the exact allocated system-temp directory before deletion.
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("dsh-updater-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
export const SHIPPED_FILES = ["lib/index.js", "lib/client.js", "lib/updater.js", "lib/quota.js", "locale/*.json", "cordis.patch.yml", "icon.svg", "README.md", "README.en.md", "CHANGELOG.md", "LICENSE"];
export function manifest(version = VERSION, patch = {}) {
  return { name: UPDATE_PACKAGE, version, type: "module", files: SHIPPED_FILES, dsh: { bundle: { patch: "./cordis.patch.yml" } }, ...patch };
}
export function packageEntries(version = VERSION, patch = {}) {
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
export function tarBytes(entries, { terminator = true } = {}) {
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
export function fixture({ version = VERSION, patch = {}, entries = packageEntries(version, patch), tar = tarBytes(entries) } = {}) {
  const bytes = gzipSync(tar);
  return { bytes, expected: { version, integrity: integrity(bytes) } };
}
export const goodPackage = fixture();
export function metadata(version = VERSION, { region = "global", sri = goodPackage.expected.integrity, ...patch } = {}) {
  return { name: UPDATE_PACKAGE, version, dist: {
    tarball: `${UPDATE_REGISTRIES[region]}/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${version}.tgz`, integrity: sri,
  }, ...patch };
}
export const jsonResponse = (value, init = {}) => new Response(JSON.stringify(value), { status: 200, ...init });
export const bytesResponse = (bytes, init = {}) => new Response(bytes, { status: 200, ...init });
export function pendingFetch(signal, gate) {
  return new Promise((yes, no) => {
    const abort = () => no(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    gate.promise.then(yes, no).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function harness(t, options = {}) {
  const calls = [], writes = [], stored = [], changes = [], warnings = [];
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
    logger: { warn: (message) => warnings.push(message) },
  });
  t.after(() => updater.dispose());
  return { updater, calls, writes, stored, changes, warnings, setFetch: (next) => { handler = next; } };
}
export function assertSafeRequest(call) {
  assert.equal(call.init.redirect, new URL(call.url).pathname.endsWith(".tgz") ? "manual" : "error");
  assert.equal(call.init.credentials, "omit");
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.deepEqual(Object.keys(call.init.headers), ["accept"]);
  assert.equal(new URL(call.url).protocol, "https:");
}
