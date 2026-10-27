// Reproducible pure-move proof against the pre-refactor git revision and TAP titles.
// Run manually: node tests/helpers/client-move-proof.mjs [baseline-ref]
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baseline = JSON.parse(readFileSync(new URL("client-baseline.json", import.meta.url), "utf8"));
const ref = process.argv[2] ?? baseline.baseline;
const original = execFileSync("git", ["show", `${ref}:lib/client.js`], { cwd: root });
const generated = readFileSync(new URL("../../lib/client.js", import.meta.url));
const marker = Buffer.from("    // GENERATED from src/client by scripts/build-client.mjs - edit the sources, then run npm run build:client\n");
const at = generated.indexOf(marker);
assert.ok(at >= 0, "exact GENERATED notice must exist");
assert.equal(generated.indexOf(marker, at + marker.length), -1, "notice occurs exactly once");
// Strip exactly the one added comment-only line, without normalizing or parsing
// anything else. This compares bytes, preserving whitespace and literal text.
const stripped = Buffer.concat([generated.subarray(0, at), generated.subarray(at + marker.length)]);
assert.deepEqual(stripped, original, "generated artifact differs from original beyond the exact notice");
assert.ok(generated.toString("utf8").startsWith("window.__ModuleLoader__.load({\n"));
assert.equal(generated.toString("utf8").split("return module.exports;").length, 2);
console.log(`Byte-equivalent to ${ref}:lib/client.js after removing exactly one notice line (${original.length} bytes).`);
console.log(`SHA-256: ${createHash("sha256").update(stripped).digest("hex")}`);

const files = readdirSync(new URL("../client/", import.meta.url)).filter((name) => name.endsWith(".test.mjs")).sort();
const tap = execFileSync(process.execPath, ["--test", "--test-reporter=tap", ...files.map((name) => root + "tests/client/" + name)], { cwd: root, encoding: "utf8" });
const titles = [...tap.matchAll(/^\s*# Subtest: (.+)$/gm)].map((match) => match[1]).sort();
assert.deepEqual(titles, baseline.titles, "sorted suite/test titles changed");
assert.ok(tap.includes(`# tests ${baseline.tests}\n`));
assert.ok(tap.includes(`# suites ${baseline.suites}\n`));
assert.ok(tap.includes(`# pass ${baseline.tests}\n`));
assert.ok(tap.includes("# fail 0\n"));
console.log(`Identical sorted passing titles: ${baseline.tests} tests / ${baseline.suites} suites before and after.`);
