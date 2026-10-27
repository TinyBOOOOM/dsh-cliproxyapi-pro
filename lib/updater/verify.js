// Package verification without extraction: SHA-512 integrity, gzip/tar structure and declared files.
import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ALWAYS_PACKED, MAX_PACKAGE_ENTRIES, MAX_PATH_SEGMENTS, MAX_UNPACKED_BYTES, REQUIRED_FILES, SAFE_SEGMENT, UPDATE_PACKAGE } from "./constants.js";
import { fail, printable } from "./errors.js";
import { integrityDigest } from "./registry.js";

/**
 * Compile the package's own `files` field (npm semantics: a matched directory
 * includes its contents, `*` stays within a segment, `**` spans segments).
 * Negations only remove files from what npm packs, so they are ignored here;
 * absolute or traversing patterns never match.
 */
export function packageFilePatterns(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 200) fail("invalid-package", "package.json has no usable \"files\" list");
  const patterns = [];
  for (const raw of files) {
    if (typeof raw !== "string") fail("invalid-package", "package.json \"files\" contains a non-string entry");
    const pattern = raw.trim().replace(/^\.\//, "").replace(/\/+$/, "");
    if (!pattern || pattern.startsWith("!") || pattern.startsWith("/") || pattern.includes("\\") ||
        pattern.split("/").some((part) => part === "" || part === "." || part === "..")) continue;
    const parts = pattern.split("/");
    const body = parts.map((part, i) => {
      const last = i === parts.length - 1;
      if (part === "**") return last ? ".*" : "(?:[^/]+/)*";
      return part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + (last ? "" : "/");
    }).join("");
    patterns.push(new RegExp(`^${body}(?:/.*)?$`));
  }
  return patterns;
}

/**
 * Validate checksum and a restricted npm tar archive without extracting any file.
 * Which files may appear is not hard-coded: every regular file must be declared
 * by the package's own `files` field (or be one npm always packs), so a future
 * release can ship new files without this version rejecting it. Structural
 * safety rules (paths, entry types, sizes, dependencies, scripts) are fixed.
 */
export function verifyUpdatePackage(bytes, expected) {
  const digest = createHash("sha512").update(bytes).digest();
  if (!timingSafeEqual(digest, integrityDigest(expected.integrity))) fail("integrity-error");
  let tar;
  try { tar = gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED_BYTES }); }
  catch { fail("invalid-package", "not a gzip archive within the size limit"); }
  const seen = new Set();
  const files = [];
  const directories = [];
  let manifest;
  let ended = false;
  const text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (tar.subarray(offset).some((b) => b !== 0)) fail("invalid-package", "data after the tar terminator");
      ended = true;
      break;
    }
    const octal = (buffer) => {
      const value = text(buffer).trim();
      if (!/^[0-7]+$/.test(value)) fail("invalid-package", "malformed tar header");
      return parseInt(value, 8);
    };
    const size = octal(header.subarray(124, 136));
    const checksum = octal(header.subarray(148, 156));
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== checksum || size > MAX_UNPACKED_BYTES || offset + 512 + size > tar.length) fail("invalid-package", "corrupt tar entry");
    const prefix = text(header.subarray(345, 500));
    const path = `${prefix ? `${prefix}/` : ""}${text(header.subarray(0, 100))}`;
    const type = header[156];
    const directory = type === 53;
    let relative = path.startsWith("package/") ? path.slice(8) : null;
    if (directory && relative?.endsWith("/")) relative = relative.slice(0, -1);
    const parts = relative?.split("/") ?? [];
    if (relative === null || (relative !== "" || !directory) && (parts.length > MAX_PATH_SEGMENTS ||
        parts.some((part) => !SAFE_SEGMENT.test(part) || part === "node_modules")) || seen.has(path)) {
      fail("invalid-package", `unsafe path ${printable(path)}`);
    }
    seen.add(path);
    if (seen.size > MAX_PACKAGE_ENTRIES) fail("invalid-package", "too many entries");
    if (directory) {
      if (size !== 0) fail("invalid-package", `non-empty directory entry ${printable(path)}`);
      directories.push(relative);
    } else if (type === 0 || type === 48) {
      files.push(relative);
      if (relative === "package.json") {
        try { manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf8")); }
        catch { fail("invalid-package", "package.json is not valid JSON"); }
      }
    } else fail("invalid-package", `link or special entry ${printable(path)}`);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended) fail("invalid-package", "missing tar terminator");
  const missing = REQUIRED_FILES.find((p) => !files.includes(p));
  if (missing) fail("invalid-package", `missing ${missing}`);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.name !== UPDATE_PACKAGE ||
      manifest.version !== expected.version || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") {
    fail("invalid-package", "package.json does not describe this plugin version");
  }
  if (["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies"].some((key) => manifest[key] && Object.keys(manifest[key]).length)) fail("invalid-package", "declares dependencies");
  const script = Object.keys(manifest.scripts ?? {}).find((key) => /^(?:preinstall|install|postinstall|prepare|prepublish|prepublishOnly|prepack|postpack)$/.test(key));
  if (script) fail("invalid-package", `declares lifecycle script ${printable(script)}`);
  const patterns = packageFilePatterns(manifest.files);
  const undeclared = files.find((file) => !(!file.includes("/") && ALWAYS_PACKED.test(file)) && !patterns.some((re) => re.test(file)));
  if (undeclared) fail("invalid-package", `file not declared in package.json "files": ${printable(undeclared)}`);
  const stray = directories.find((dir) => dir !== "" && !files.some((file) => file.startsWith(`${dir}/`)));
  if (stray !== undefined) fail("invalid-package", `directory without files ${printable(stray)}`);
  return manifest;
}
