// SRI, gzip and restricted tar verification without extraction.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  packageFilePatterns, verifyUpdatePackage,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, requiredFiles, hasCode, integrity, SHIPPED_FILES, manifest, packageEntries, tarBytes, fixture, goodPackage, metadata,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

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
  test("new files declared in the package's own files field verify without an updater change", () => {
    const files = [...SHIPPED_FILES, "lib/*.js", "CHANGELOG.en.md", "assets", "docs/**/*.md"];
    const extra = ["CHANGELOG.en.md", "locale/ja.json", "assets/logo.png", "assets/icons/small.svg", "docs/guide.md", "docs/zh/guide.md", "lib/extra.js", "NOTICE"];
    const pkg = fixture({ entries: [...packageEntries(VERSION, { files }), { name: "package/assets/", type: "5" }, ...extra.map((name) => ({ name: `package/${name}`, data: "inert" }))] });
    assert.equal(verifyUpdatePackage(pkg.bytes, pkg.expected).version, VERSION);
    // Long paths use the ustar prefix field.
    const deep = fixture({ entries: [...packageEntries(VERSION, { files: [...SHIPPED_FILES, "assets"] }), { prefix: "package/assets/a", name: "b/c.png", data: "inert" }] });
    assert.equal(verifyUpdatePackage(deep.bytes, deep.expected).version, VERSION);
  });
  test("files missing from the files field are rejected with a logged reason, not a hard-coded list", () => {
    for (const [name, files] of [["CHANGELOG.en.md", SHIPPED_FILES], ["lib/extra.mjs", SHIPPED_FILES], ["docs/guide.txt", [...SHIPPED_FILES, "docs/*.md"]], ["secret.md", [...SHIPPED_FILES, "!secret.md"]]]) {
      const pkg = fixture({ entries: [...packageEntries(VERSION, { files }), { name: `package/${name}`, data: "inert" }] });
      assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), (error) => hasCode("invalid-package")(error) && error.detail.includes(name));
    }
  });
  test("a broad files pattern never admits dotfiles, node_modules, deep or unusual names", () => {
    for (const name of ["package/.npmrc", "package/lib/.hidden.js", "package/node_modules/evil/index.js", "package/a/b/c/d/e/f/g.js", "package/lib/evil file.js", "package/lib/é.js", "package/lib/$(x).js"]) {
      const pkg = fixture({ entries: [...packageEntries(VERSION, { files: ["*", "**"] }), { name, data: "inert" }] });
      assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"), name);
    }
  });
  test("files field must be a usable list; traversing or absolute patterns never match", () => {
    for (const files of [undefined, [], "lib", [1], Array(201).fill("lib")]) {
      const pkg = fixture({ patch: { files } });
      assert.throws(() => verifyUpdatePackage(pkg.bytes, pkg.expected), hasCode("invalid-package"));
    }
    const pkg = fixture({ entries: [...packageEntries(VERSION, { files: [...SHIPPED_FILES, "../outside", "/abs", "./docs/"] }), { name: "package/docs/a.md", data: "x" }] });
    assert.equal(verifyUpdatePackage(pkg.bytes, pkg.expected).version, VERSION);
    const outside = fixture({ entries: [...packageEntries(VERSION, { files: [...SHIPPED_FILES, "../outside", "/abs"] }), { name: "package/abs", data: "x" }] });
    assert.throws(() => verifyUpdatePackage(outside.bytes, outside.expected), hasCode("invalid-package"));
  });
  test("the repository's real package.json and shipped files pass verification", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const real = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    // Expand `files` like npm does (globs included) over the working tree.
    const patterns = packageFilePatterns(real.files);
    const shipped = new Set(["package.json"]);
    const walk = (dir) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const name = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(name);
        else if (patterns.some((re) => re.test(name))) shipped.add(name);
      }
    };
    walk("");
    for (const required of ["lib/index.js", "lib/client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json"]) assert.ok(shipped.has(required), required);
    const entries = [...shipped].map((name) => ({ name: `package/${name}`, data: readFileSync(join(root, name)) }));
    const pkg = fixture({ version: real.version, entries });
    assert.equal(verifyUpdatePackage(pkg.bytes, pkg.expected).version, real.version);
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
