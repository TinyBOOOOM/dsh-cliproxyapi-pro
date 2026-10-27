// Syntax-check every shipped and tooling script, and verify that the generated
// client bundle matches its sources. Zero dependencies; run by `npm run check`.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function scripts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return scripts(path);
    return /\.(?:m?js)$/.test(entry.name) ? [path] : [];
  });
}

const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" }).status === 0;

let failed = false;
for (const file of [...scripts(join(root, "lib")), ...scripts(join(root, "scripts"))]) {
  if (!run(["--check", file])) {
    console.error(`syntax check failed: ${relative(root, file)}`);
    failed = true;
  }
}

const buildClient = join(root, "scripts", "build-client.mjs");
if (existsSync(buildClient) && !run([buildClient, "--check"])) failed = true;

if (failed) process.exit(1);
