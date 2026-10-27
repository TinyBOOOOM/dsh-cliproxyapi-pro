// Update package identity, registries, channels, default preferences and package limits.

export const UPDATE_PACKAGE = "dsh-cliproxyapi-pro";
export const UPDATE_REGISTRIES = Object.freeze({
  global: "https://registry.npmjs.org",
  cn: "https://registry.npmmirror.com",
});
export const UPDATE_TAGS = Object.freeze({ stable: "latest", beta: "beta", dev: "dev" });
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_UPDATE_SETTINGS = Object.freeze({
  autoCheck: true, autoDownload: false, autoInstall: false, channel: "stable", region: "auto",
});
export const BOOLEAN_SETTINGS = ["autoCheck", "autoDownload", "autoInstall"];
export const MAX_METADATA_BYTES = 512 * 1024;
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
export const MAX_PACKAGE_ENTRIES = 1000;
export const MAX_PATH_SEGMENTS = 6;
// Plain names only: no dotfiles, spaces, shell/glob characters or non-ASCII.
export const SAFE_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
// npm packs these root files whether or not `files` lists them.
export const ALWAYS_PACKED = /^(?:package\.json|(?:README|LICEN[CS]E|NOTICE)(?:\.[A-Za-z0-9_-]+)*)$/i;
export const REQUIRED_FILES = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json"];
