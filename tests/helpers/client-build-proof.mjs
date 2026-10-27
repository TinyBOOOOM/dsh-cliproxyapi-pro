// Manual generator contract checks, separate from the unchanged 61 client tests.
// Run without other writers: temporarily mutates and always restores owned files.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const output = new URL("lib/client.js", root);
const source = new URL("src/client/core/api.js", root);
const originalOutput = readFileSync(output);
const originalSource = readFileSync(source);
const run = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL("scripts/build-client.mjs", root)), ...args], {
  cwd: fileURLToPath(root), encoding: "utf8",
});
try {
  assert.equal(run("--check").status, 0);
  assert.equal(run().status, 0);
  assert.deepEqual(readFileSync(output), originalOutput, "first rebuild is deterministic");
  assert.equal(run().status, 0);
  assert.deepEqual(readFileSync(output), originalOutput, "second rebuild is deterministic");

  writeFileSync(output, originalOutput.toString("utf8") + "// stale output\n");
  const stale = run("--check");
  assert.notEqual(stale.status, 0);
  assert.ok(stale.stderr.includes("lib/client.js is out of date; run npm run build:client"));
  assert.ok(readFileSync(output, "utf8").endsWith("// stale output\n"), "--check never overwrites output");

  writeFileSync(output, originalOutput.toString("utf8").replaceAll("\n", "\r\n"));
  writeFileSync(source, originalSource.toString("utf8").replaceAll("\n", "\r\n"));
  assert.equal(run("--check").status, 0, "CRLF source/output compare with normalized line endings");
  assert.equal(run().status, 0);
  assert.deepEqual(readFileSync(output), originalOutput, "build always writes LF");

  writeFileSync(source, originalSource.toString("utf8") + "const = ;\n");
  const invalid = run("--check");
  assert.notEqual(invalid.status, 0);
  assert.ok(invalid.stderr.includes("SyntaxError"), "--check parses freshly assembled text, not stale output");
  assert.deepEqual(readFileSync(output), originalOutput, "syntax rejection never writes output");
  console.log("Generator contracts passed: deterministic, stale nonzero/message, read-only check, CRLF normalization, LF output, assembled syntax rejection.");
} finally {
  writeFileSync(source, originalSource);
  writeFileSync(output, originalOutput);
}
