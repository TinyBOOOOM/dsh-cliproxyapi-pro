// Plugin update checks and verified offline downloads. Never writes installed code.
// Only Node.js built-ins; npm / DSH remain responsible for installation.
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

export const UPDATE_PACKAGE = "dsh-cliproxyapi-pro";
export const UPDATE_REGISTRIES = Object.freeze({
  global: "https://registry.npmjs.org",
  cn: "https://registry.npmmirror.com",
});
export const UPDATE_TAGS = Object.freeze({ stable: "latest", beta: "beta", dev: "dev" });
export const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_UPDATE_SETTINGS = Object.freeze({
  autoCheck: true, autoDownload: false, channel: "stable", region: "auto",
});
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
const PACKAGE_FILES = /^(?:package\.json|README(?:\.en)?\.md|CHANGELOG\.md|LICENSE|icon\.svg|cordis\.patch\.yml|lib\/[A-Za-z0-9_-]+\.js|locale\/(?:en|zh)\.json)$/;

export class UpdateError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new UpdateError(code); };

export function normalizeUpdateSettings(raw = {}) {
  return {
    autoCheck: typeof raw?.autoCheck === "boolean" ? raw.autoCheck : true,
    autoDownload: raw?.autoDownload === true,
    channel: Object.hasOwn(UPDATE_TAGS, raw?.channel ?? "") ? raw.channel : "stable",
    region: ["auto", "global", "cn"].includes(raw?.region) ? raw.region : "auto",
  };
}

export function loadUpdateSettings(file) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.version !== 1 ||
        ["autoCheck", "autoDownload"].some((key) => raw[key] !== undefined && typeof raw[key] !== "boolean") ||
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

// Strict SemVer, including prerelease precedence. Never reuse model-name sorting.
export function parseUpdateVersion(value) {
  if (typeof value !== "string" || value.length > 128) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n))) return null;
  const pre = match[4]?.split(".") ?? [];
  if (pre.some((p) => /^\d+$/.test(p) && (p.length > 1 && p.startsWith("0") || !Number.isSafeInteger(Number(p))))) return null;
  return { parts, pre };
}

export function compareUpdateVersions(a, b) {
  const x = parseUpdateVersion(a), y = parseUpdateVersion(b);
  if (!x || !y) fail("invalid-metadata");
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
  if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined || y.pre[i] === undefined) return x.pre[i] === undefined ? -1 : 1;
    const p = x.pre[i], q = y.pre[i];
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) > Number(q) ? 1 : -1;
    if (pn !== qn) return pn ? -1 : 1;
    return p > q ? 1 : -1;
  }
  return 0;
}

function integrityDigest(integrity) {
  if (typeof integrity !== "string") fail("invalid-metadata");
  const token = integrity.split(/\s+/).find((part) => /^sha512-[A-Za-z0-9+/]{86}==$/.test(part));
  if (!token) fail("invalid-metadata");
  const digest = Buffer.from(token.slice(7), "base64");
  if (digest.length !== 64) fail("invalid-metadata");
  return digest;
}

export function validateUpdateMetadata(raw, channel) {
  if (!Object.hasOwn(UPDATE_TAGS, channel)) fail("invalid-metadata");
  const parsed = parseUpdateVersion(raw?.version);
  if (raw?.name !== UPDATE_PACKAGE || !parsed || channel === "stable" && parsed.pre.length) fail("invalid-metadata");
  // Keep channels honest even if an upstream dist-tag is accidentally moved.
  if (channel !== "stable" && parsed.pre.length && !parsed.pre.some((p) => p === channel)) fail("invalid-metadata");
  let url;
  try { url = new URL(raw?.dist?.tarball); } catch { fail("invalid-metadata"); }
  const hosts = ["registry.npmjs.org", "registry.npmmirror.com"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) fail("invalid-metadata");
  if (url.pathname !== `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${raw.version}.tgz`) fail("invalid-metadata");
  integrityDigest(raw.dist.integrity);
  return { version: raw.version, integrity: raw.dist.integrity };
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); fail("invalid-package"); }
  const chunks = [];
  let length = 0;
  if (!response.body) fail("network-error");
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); fail("invalid-package"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

function allowedDownloadUrl(value, version, region) {
  let url;
  try { url = new URL(value); } catch { fail("invalid-package"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) fail("invalid-package");
  const registryPath = `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${version}.tgz`;
  const cdnPath = `/packages/${UPDATE_PACKAGE}/${version}/${UPDATE_PACKAGE}-${version}.tgz`;
  if (region === "global") {
    if (url.hostname !== "registry.npmjs.org" || url.pathname !== registryPath) fail("invalid-package");
  } else if (!(url.hostname === "registry.npmmirror.com" && url.pathname === registryPath ||
               url.hostname === "cdn.npmmirror.com" && url.pathname === cdnPath)) fail("invalid-package");
  return url.href;
}

async function fetchBytes(fetcher, url, signal, limit, download = null) {
  // npmmirror redirects tarballs to its official CDN. Follow only bounded,
  // exact package/version URLs; never let fetch follow an unvalidated location.
  for (let redirects = 0; ; redirects++) {
    const response = await fetcher(url, {
      signal, redirect: download ? "manual" : "error", credentials: "omit",
      headers: { accept: "application/json, application/octet-stream" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!download || redirects >= 3 || !location) fail("invalid-package");
      let next;
      try { next = new URL(location, url).href; } catch { fail("invalid-package"); }
      url = allowedDownloadUrl(next, download.version, download.region);
      continue;
    }
    if (response.status === 404) { await response.body?.cancel(); fail("channel-unavailable"); }
    if (!response.ok) { await response.body?.cancel(); fail("network-error"); }
    return readBounded(response, limit);
  }
}

/** Validate checksum and a restricted npm tar archive without extracting any file. */
export function verifyUpdatePackage(bytes, expected) {
  const digest = createHash("sha512").update(bytes).digest();
  if (!timingSafeEqual(digest, integrityDigest(expected.integrity))) fail("integrity-error");
  let tar;
  try { tar = gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED_BYTES }); }
  catch { fail("invalid-package"); }
  const seen = new Set();
  let manifest;
  let ended = false;
  const text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (tar.subarray(offset).some((b) => b !== 0)) fail("invalid-package");
      ended = true;
      break;
    }
    const octal = (buffer) => {
      const value = text(buffer).trim();
      if (!/^[0-7]+$/.test(value)) fail("invalid-package");
      return parseInt(value, 8);
    };
    const size = octal(header.subarray(124, 136));
    const checksum = octal(header.subarray(148, 156));
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== checksum || size > MAX_UNPACKED_BYTES || offset + 512 + size > tar.length) fail("invalid-package");
    const prefix = text(header.subarray(345, 500));
    const path = `${prefix ? `${prefix}/` : ""}${text(header.subarray(0, 100))}`;
    if (!path.startsWith("package/") || path.includes("\\") || path.split("/").some((p) => p === ".." || p === ".") || seen.has(path)) fail("invalid-package");
    seen.add(path);
    const type = header[156];
    if (type === 53) {
      if (size !== 0 || !["package/", "package/lib/", "package/locale/"].includes(path)) fail("invalid-package");
    } else if ((type === 0 || type === 48) && PACKAGE_FILES.test(path.slice(8))) {
      if (path === "package/package.json") {
        try { manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString("utf8")); }
        catch { fail("invalid-package"); }
      }
    } else fail("invalid-package");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const required = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json"];
  if (!ended || required.some((p) => !seen.has(`package/${p}`)) || manifest?.name !== UPDATE_PACKAGE || manifest?.version !== expected.version || manifest?.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("invalid-package");
  if (["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies"].some((key) => manifest[key] && Object.keys(manifest[key]).length)) fail("invalid-package");
  if (Object.keys(manifest.scripts ?? {}).some((key) => /^(?:preinstall|install|postinstall|prepare|prepublish|prepublishOnly|prepack|postpack)$/.test(key))) fail("invalid-package");
  return manifest;
}

function quotedArgument(value) {
  // CLI examples must not turn local paths/profile names into shell syntax.
  // Both PowerShell and POSIX shells accept single-quoted strings without apostrophes.
  if (typeof value !== "string" || /['\r\n\0]/.test(value)) return null;
  return `'${value}'`;
}

/** Injected I/O makes every update test offline and independent of the real profile. */
export function createPluginUpdater(deps) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date().toISOString());
  let settings = normalizeUpdateSettings(deps.readSettings());
  let candidate = null;
  let generation = 0;
  let disposed = false;
  let checkPromise = null;
  let downloadPromise = null;
  let saving = false;
  const abort = new AbortController();
  const initial = {
    currentVersion: deps.currentVersion, latestVersion: null, available: false,
    effectiveRegion: null, lastCheckedAt: null, error: null, errorCode: null,
    downloadedVersion: null, downloadPath: null, upgradeCommand: null,
    blockedReason: deps.linkedInstall ? "linked-install" : null,
  };
  let state = { ...initial };
  const status = () => ({ ...state, ...settings, checking: checkPromise !== null, downloading: downloadPromise !== null });
  const assertLive = () => { if (disposed) fail("disposed"); };
  const recordError = (error) => {
    const code = error instanceof UpdateError ? error.code : "network-error";
    state.error = code;
    state.errorCode = code;
  };

  const lookup = async (region, snapshot, signal) => {
    const bytes = await fetchBytes(fetcher, `${UPDATE_REGISTRIES[region]}/${UPDATE_PACKAGE}/${UPDATE_TAGS[snapshot.channel]}`, signal, MAX_METADATA_BYTES);
    let raw;
    try { raw = JSON.parse(bytes.toString("utf8")); } catch { fail("invalid-metadata"); }
    return { ...validateUpdateMetadata(raw, snapshot.channel), region };
  };

  const download = (version) => {
    assertLive();
    if (downloadPromise) return downloadPromise;
    if (checkPromise || saving) fail("busy");
    if (!candidate || !state.available || version !== candidate.version) fail("stale-version");
    const selected = { ...candidate };
    state.error = state.errorCode = null;
    downloadPromise = Promise.resolve().then(async () => {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]);
      const url = `${UPDATE_REGISTRIES[selected.region]}/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${selected.version}.tgz`;
      const bytes = await fetchBytes(fetcher, url, signal, MAX_PACKAGE_BYTES, selected);
      assertLive();
      verifyUpdatePackage(bytes, selected);
      let path;
      try { path = await deps.storePackage(selected.version, bytes); }
      catch { fail("storage-error"); }
      assertLive();
      const profile = quotedArgument(deps.profileName);
      const target = quotedArgument(path);
      state.downloadedVersion = selected.version;
      state.downloadPath = path;
      state.upgradeCommand = !deps.linkedInstall && profile && target ? `dsh plugin --profile ${profile} add ${target}` : null;
    }).catch((error) => {
      recordError(error);
    }).finally(() => { downloadPromise = null; }).then(status);
    return downloadPromise;
  };

  const check = ({ automatic = false } = {}) => {
    assertLive();
    if (checkPromise) return checkPromise;
    if (downloadPromise || saving) fail("busy");
    if (automatic && !settings.autoCheck) return Promise.resolve(status());
    const snapshot = { ...settings };
    const revision = generation;
    state.error = state.errorCode = null;
    checkPromise = Promise.resolve().then(async () => {
      const winnerAbort = new AbortController();
      const signal = AbortSignal.any([abort.signal, winnerAbort.signal, AbortSignal.timeout(15_000)]);
      let result;
      try {
        result = snapshot.region === "auto"
          ? await Promise.any([lookup("global", snapshot, signal), lookup("cn", snapshot, signal)]).catch((error) => {
              const failures = error.errors ?? [];
              throw failures.find((e) => e.code === "invalid-metadata") ?? failures.find((e) => e.code === "channel-unavailable") ?? new UpdateError("network-error");
            })
          : await lookup(snapshot.region, snapshot, signal);
      } finally { winnerAbort.abort(); }
      assertLive();
      if (revision !== generation) return;
      candidate = result;
      state.latestVersion = result.version;
      state.available = compareUpdateVersions(result.version, deps.currentVersion) > 0;
      state.effectiveRegion = result.region;
      state.lastCheckedAt = now();
    }).catch((error) => {
      if (revision !== generation || disposed) return;
      candidate = null;
      state.available = false;
      state.latestVersion = null;
      state.lastCheckedAt = now();
      recordError(error);
    }).finally(() => { checkPromise = null; }).then(async () => {
      if (!disposed && automatic && settings.autoCheck && settings.autoDownload && revision === generation && state.available && state.downloadedVersion !== candidate?.version) {
        await download(candidate.version);
      }
      return status();
    });
    return checkPromise;
  };

  return {
    status, check, download,
    async save(patch = {}) {
      assertLive();
      if (checkPromise || downloadPromise || saving) fail("busy");
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) fail("invalid-settings");
      if (Object.keys(patch).some((key) => !Object.hasOwn(DEFAULT_UPDATE_SETTINGS, key))) fail("invalid-settings");
      if (Object.hasOwn(patch, "channel") && !Object.hasOwn(UPDATE_TAGS, patch.channel) || Object.hasOwn(patch, "region") && !["auto", "global", "cn"].includes(patch.region)) fail("invalid-settings");
      for (const key of ["autoCheck", "autoDownload"]) if (Object.hasOwn(patch, key) && typeof patch[key] !== "boolean") fail("invalid-settings");
      const next = normalizeUpdateSettings({ ...settings, ...patch });
      saving = true;
      try {
        try { await deps.writeSettings(next); } catch { fail("storage-error"); }
        assertLive();
        const changedSource = next.channel !== settings.channel || next.region !== settings.region;
        settings = next;
        state.error = state.errorCode = null;
        generation += 1;
        if (changedSource) { candidate = null; state = { ...initial }; }
        deps.onSettingsChanged?.(settings);
        return status();
      } finally { saving = false; }
    },
    dispose() { disposed = true; generation += 1; abort.abort(); },
  };
}

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
