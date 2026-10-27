// Plugin update checks and verified offline downloads. Never writes installed code.
// Only Node.js built-ins; npm / DSH remain responsible for installation.
// Barrel: the updater's public surface; the modules below stay internal.
export { DEFAULT_UPDATE_SETTINGS, UPDATE_INTERVAL_MS, UPDATE_PACKAGE, UPDATE_REGISTRIES, UPDATE_TAGS } from "./constants.js";
export { UpdateError } from "./errors.js";
export { loadUpdateSettings, normalizeUpdateSettings, saveUpdateSettings } from "./settings.js";
export { compareUpdateVersions, parseUpdateVersion } from "./version.js";
export { validateUpdateMetadata } from "./registry.js";
export { packageFilePatterns, verifyUpdatePackage } from "./verify.js";
export { createPluginUpdater } from "./updater.js";
export { storeUpdatePackage } from "./store.js";
