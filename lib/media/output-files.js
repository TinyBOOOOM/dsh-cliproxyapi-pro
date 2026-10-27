// Portable output names and exclusive, non-overwriting file writes.
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { bareModelId } from "./classify.js";
import { MediaError } from "./util.js";

// #region Output files

/** The output directory for a session: absolute settings are used as is, relative ones under `cwd`. */
export function outputDirectory(cwd, outputDir) {
  return isAbsolute(outputDir) ? outputDir : join(cwd, outputDir);
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** File stem `YYYYMMDD-HHmmss-<model>-<prompt slug>`; safe on Windows, macOS and Linux. */
export function outputStem(model, prompt, date = new Date()) {
  const modelPart = bareModelId(model).replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "model";
  const slug =
    String(prompt ?? "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "media";
  return `${stamp(date)}-${modelPart}-${slug}`;
}

/**
 * Write each file next to the others without ever replacing an existing
 * file (`wx`); a taken name gets the next free `-N` suffix.
 * @param files - `[{ bytes, ext }]`.
 * @returns absolute paths, in order.
 */
export function writeOutputFiles(dir, stem, files) {
  mkdirSync(dir, { recursive: true });
  const paths = [];
  files.forEach((file, index) => {
    const base = files.length > 1 ? `${stem}-${index + 1}` : stem;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const name = attempt === 0 ? `${base}.${file.ext}` : `${base}-${attempt + 1}.${file.ext}`;
      const path = join(dir, name);
      try {
        writeFileSync(path, file.bytes, { flag: "wx" });
        paths.push(path);
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw new MediaError("write-failed", error?.code ?? undefined);
      }
    }
    throw new MediaError("write-failed", "EEXIST");
  });
  return paths;
}

// #endregion
