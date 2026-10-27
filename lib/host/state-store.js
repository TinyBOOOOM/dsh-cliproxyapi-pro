// Profile state path resolution and atomic account state persistence.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function resolveStateFilePath(ctx) {
  try {
    const profileCtx = ctx?.get?.("profileContext");
    if (profileCtx && typeof profileCtx.dir === "string" && profileCtx.dir.trim() !== "") {
      return join(profileCtx.dir.trim(), ".dsh-cliproxyapi", "state.json");
    }
  } catch {}
  const dshHome =
    process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ""
      ? process.env.DSH_HOME.trim()
      : join(homedir(), ".dsh");
  return join(dshHome, "dsh-cliproxyapi", "state.json");
}

export function loadPersistedState(filePath) {
  try {
    if (!existsSync(filePath)) return {};
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function savePersistedState(filePath, state) {
  try {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, filePath);
  } catch {}
}
