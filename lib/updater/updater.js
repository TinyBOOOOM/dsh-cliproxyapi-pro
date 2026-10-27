// The plugin updater: checks with region racing, candidate generations, downloads and preferences.
import { BOOLEAN_SETTINGS, DEFAULT_UPDATE_SETTINGS, MAX_METADATA_BYTES, MAX_PACKAGE_BYTES, UPDATE_PACKAGE, UPDATE_REGISTRIES, UPDATE_TAGS } from "./constants.js";
import { UpdateError, fail } from "./errors.js";
import { fetchBytes, validateUpdateMetadata } from "./registry.js";
import { normalizeUpdateSettings } from "./settings.js";
import { verifyUpdatePackage } from "./verify.js";
import { compareUpdateVersions } from "./version.js";

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
    // The page shows only the localized code; the concrete reason goes to the Host log.
    if (error instanceof UpdateError && error.detail) deps.logger?.warn?.(`[dsh-cliproxyapi] update ${code}: ${error.detail}`);
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
      for (const key of BOOLEAN_SETTINGS) if (Object.hasOwn(patch, key) && typeof patch[key] !== "boolean") fail("invalid-settings");
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
