// Update preferences and atomic offline package storage.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_UPDATE_SETTINGS, UPDATE_INTERVAL_MS, UPDATE_PACKAGE, UPDATE_TAGS, loadUpdateSettings, normalizeUpdateSettings, saveUpdateSettings, storeUpdatePackage,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, hasCode, temporaryDirectory, goodPackage,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

describe("independent update settings and atomic offline storage", () => {
  test("explicit defaults; normalization never copies account secrets or unknown fields", () => {
    assert.deepEqual(DEFAULT_UPDATE_SETTINGS, { autoCheck: true, autoDownload: false, autoInstall: false, channel: "stable", region: "auto" });
    assert.ok(Object.isFrozen(DEFAULT_UPDATE_SETTINGS));
    assert.deepEqual(UPDATE_TAGS, { stable: "latest", beta: "beta", dev: "dev" });
    assert.equal(UPDATE_INTERVAL_MS, 6 * 60 * 60 * 1000);
    for (const raw of [undefined, null, false, [], "bad", { autoCheck: "false", autoDownload: 1, autoInstall: "yes", channel: "latest", region: "nearby" }]) assert.deepEqual(normalizeUpdateSettings(raw), DEFAULT_UPDATE_SETTINGS);
    assert.deepEqual(normalizeUpdateSettings({ autoCheck: false, autoDownload: true, autoInstall: true, channel: "dev", region: "cn", apiKey: "fake-secret", accounts: [{}] }), { autoCheck: false, autoDownload: true, autoInstall: true, channel: "dev", region: "cn" });
    assert.deepEqual(normalizeUpdateSettings({ channel: "toString", region: "GLOBAL" }), DEFAULT_UPDATE_SETTINGS);
  });
  test("missing settings default on; corrupt, unreadable and invalid persisted shapes default off", (t) => {
    const root = temporaryDirectory(t), file = join(root, "updates.json");
    assert.deepEqual(loadUpdateSettings(file), DEFAULT_UPDATE_SETTINGS);
    assert.deepEqual(loadUpdateSettings(root), { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false });
    for (const raw of ["{bad", "null", "[]", "false", '"bad"', "{}", '{"version":2}', ...[{ autoCheck: "false" }, { autoDownload: 1 }, { autoInstall: "true" }, { channel: "latest" }, { region: "nearby" }].map((patch) => JSON.stringify({ version: 1, ...patch }))]) {
      writeFileSync(file, raw);
      assert.deepEqual(loadUpdateSettings(file), { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false }, raw);
    }
    writeFileSync(file, JSON.stringify({ version: 1, autoCheck: false, channel: "beta", region: "cn", autoDownload: true }));
    assert.deepEqual(loadUpdateSettings(file), { autoCheck: false, autoDownload: true, autoInstall: false, channel: "beta", region: "cn" });
    // v1 files written before autoInstall existed stay valid; the new flag loads as written.
    writeFileSync(file, JSON.stringify({ version: 1, autoInstall: true }));
    assert.deepEqual(loadUpdateSettings(file), { ...DEFAULT_UPDATE_SETTINGS, autoInstall: true });
  });
  test("atomic save writes only versioned updater settings and preserves fake sibling account state", (t) => {
    const root = temporaryDirectory(t), account = join(root, "state.json"), file = join(root, "updates", "settings.json");
    const accountBytes = '{"version":2,"accounts":[{"id":"fake","apiKeyRef":"TEST_ONLY"}]}\n';
    writeFileSync(account, accountBytes);
    saveUpdateSettings(file, { autoCheck: false, autoDownload: true, channel: "beta", region: "cn", apiKey: "never-persist" });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { version: 1, autoCheck: false, autoDownload: true, autoInstall: false, channel: "beta", region: "cn" });
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
