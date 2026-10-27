// Independent update preferences: normalization, tolerant load and atomic save.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { BOOLEAN_SETTINGS, DEFAULT_UPDATE_SETTINGS, UPDATE_TAGS } from "./constants.js";
import { fail } from "./errors.js";

export function normalizeUpdateSettings(raw = {}) {
  return {
    autoCheck: typeof raw?.autoCheck === "boolean" ? raw.autoCheck : true,
    autoDownload: raw?.autoDownload === true,
    // Consumed by the Web client, which delegates installation to dshmarket.
    autoInstall: raw?.autoInstall === true,
    channel: Object.hasOwn(UPDATE_TAGS, raw?.channel ?? "") ? raw.channel : "stable",
    region: ["auto", "global", "cn"].includes(raw?.region) ? raw.region : "auto",
  };
}

export function loadUpdateSettings(file) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== 1 ||
        BOOLEAN_SETTINGS.some((key) => raw[key] !== undefined && typeof raw[key] !== "boolean") ||
        raw.channel !== undefined && !Object.hasOwn(UPDATE_TAGS, raw.channel) ||
        raw.region !== undefined && !["auto", "global", "cn"].includes(raw.region)) fail("invalid-settings");
    return normalizeUpdateSettings(raw);
  }
  catch (error) {
    if (error.code === "ENOENT") return { ...DEFAULT_UPDATE_SETTINGS };
    // Corrupt or unreadable settings must not silently enable network access.
    return { ...DEFAULT_UPDATE_SETTINGS, autoCheck: false };
  }
}

export function saveUpdateSettings(file, settings) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temporary, `${JSON.stringify({ version: 1, ...normalizeUpdateSettings(settings) }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } catch {
    try { unlinkSync(temporary); } catch {}
    fail("storage-error");
  }
}
