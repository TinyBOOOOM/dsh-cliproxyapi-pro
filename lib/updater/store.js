// Atomic storage of a verified offline package; no extraction, install or profile edits.
import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { UPDATE_PACKAGE } from "./constants.js";
import { fail } from "./errors.js";
import { parseUpdateVersion } from "./version.js";

/** Atomic same-directory writes; no package extraction, install or profile edits. */
export function storeUpdatePackage(directory, version, bytes) {
  if (!parseUpdateVersion(version)) fail("invalid-package");
  const path = join(directory, `${UPDATE_PACKAGE}-${version}.tgz`);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch {}
    fail("storage-error");
  }
  return path;
}
