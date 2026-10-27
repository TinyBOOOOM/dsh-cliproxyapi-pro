// Assemble the committed, single-file ModuleLoader client from ordered source fragments.
// Development only: Node built-ins, no runtime sibling requires or installation build.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const sourceRoot = new URL("src/client/", root);
const output = new URL("lib/client.js", root);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", sourceRoot), "utf8"));
const normalize = (text) => text.replace(/\r\n?/g, "\n");
const notice = "    // GENERATED from src/client by scripts/build-client.mjs - edit the sources, then run npm run build:client\n";
const prelude = 'window.__ModuleLoader__.load({\n  id: "dsh-cliproxyapi-pro",\n  factory: (require) => {\n' + notice
  + '    var module = { exports: {} };\n    var exports = module.exports;\n    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n\n';
const epilogue = "    return module.exports;\n  },\n});\n";

function readPart(path) {
  if (!/^[a-z0-9./-]+\.(?:js|css)$/.test(path) || path.split("/").includes("..")) {
    throw new Error(`Invalid client source path: ${path}`);
  }
  const text = normalize(readFileSync(new URL(path, sourceRoot), "utf8"));
  // The one-line ownership header is build metadata, not runtime text. In
  // particular, do not inject comments into dictionary or CSS literal values.
  const header = path.endsWith(".css") ? /^\/\* @client-source [^\n]+ \*\/\n/ : /^\/\/ @client-source [^\n]+\n/;
  if (!header.test(text)) throw new Error(`Missing ownership header: src/client/${path}`);
  const body = text.replace(header, "");
  // JavaScript fragments end with exactly one newline; the generator owns the
  // blank line between fragments (CSS parts are template text, kept verbatim).
  return path.endsWith(".js") ? body.replace(/\n+$/, "\n") : body;
}

function assemble(entry, index) {
  const gap = index === manifest.length - 1 ? "" : "\n";
  if (typeof entry === "string") return readPart(entry) + gap;
  if (entry.dictionary) {
    if (!["zh", "en"].includes(entry.dictionary)) throw new Error("Invalid dictionary name");
    return `    const ${entry.dictionary} = {\n` + entry.parts.map(readPart).join("") + "    };\n\n";
  }
  if (entry.css) return "    const CSS = `\n" + entry.css.map(readPart).join("") + "`;\n\n";
  // AccountPanel exceeds 800 lines. These two .part.js files are contiguous
  // text of that ONE unchanged function, not independent modules. Concatenate
  // with only the blank line that separated them, never wrappers, so closure
  // capture and hook order stay exact.
  if (entry.contiguous) return entry.contiguous.map(readPart).join("\n") + gap;
  throw new Error("Unknown client manifest entry");
}

const text = prelude + manifest.map((entry, index) => assemble(entry, index)).join("") + epilogue;
// Parse the entire assembled output even in --check mode, including literal
// fragments/continuations that are intentionally not standalone JavaScript.
new vm.Script(text, { filename: fileURLToPath(output) });
if (text.split("return module.exports;").length !== 2) {
  throw new Error("Client must contain exactly one return module.exports; harness anchor");
}
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) throw new Error("Usage: node scripts/build-client.mjs [--check]");
if (args.includes("--check")) {
  // .gitattributes already requests LF, but tolerate CRLF in Windows checkouts
  // for both the source fragments and the committed generated artifact.
  let committed = null;
  try { committed = normalize(readFileSync(output, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (committed !== text) {
    console.error("lib/client.js is out of date; run npm run build:client");
    process.exitCode = 1;
  } else {
    console.log("lib/client.js is up to date and syntax-valid");
  }
} else {
  writeFileSync(output, text, "utf8");
  console.log("Built lib/client.js from src/client/manifest.json");
}
