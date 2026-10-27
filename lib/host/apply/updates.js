// Independent update preferences, updater wiring and disposed startup/periodic checks.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPluginUpdater, loadUpdateSettings, saveUpdateSettings, storeUpdatePackage, UPDATE_INTERVAL_MS } from "../../updater/index.js";
import { outsideHmrTransaction } from "../apply-utils.js";
import { PACKAGE_NAME, getEnvValue } from "../config.js";
import { loadPersistedState } from "../state-store.js";

export function createUpdates(shared) {
  const { ctx, stateFilePath } = shared;
  // Update preferences and packages never share the account state or credentials.
  const updateDirectory = dirname(stateFilePath);
  const updateSettingsPath = join(updateDirectory, "update-settings.json");
  let profile;
  try { profile = ctx.get?.("profileContext"); } catch {}
  const source = typeof profile?.dir === "string"
    ? loadPersistedState(join(profile.dir, "package.json")).dependencies?.[PACKAGE_NAME]
    : undefined;
  const linkedInstall = typeof source === "string" &&
    (/^(?:link:|workspace:)/.test(source) || /^(?:file:)?(?:[A-Za-z]:[\\/]|\/|\.{1,2}[\\/])/.test(source) && !/\.(?:tgz|tar\.gz)$/i.test(source) || source.startsWith("file:") && !/\.(?:tgz|tar\.gz)$/i.test(source));
  const currentVersion = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
  let updateTimer;
  let updateStartup;
  const scheduleUpdates = (preferences) => {
    clearInterval(updateTimer);
    clearTimeout(updateStartup);
    if (!preferences.autoCheck) return;
    outsideHmrTransaction(ctx, () => {
      const run = () => { void Promise.resolve().then(() => updater.check({ automatic: true })).catch(() => {}); };
      updateStartup = setTimeout(run, 3000);
      updateTimer = setInterval(run, UPDATE_INTERVAL_MS);
    });
  };
  const updater = createPluginUpdater({
    currentVersion,
    linkedInstall,
    profileName: profile?.name ?? profile?.profile ?? getEnvValue(ctx, "DSH_PROFILE"),
    readSettings: () => loadUpdateSettings(updateSettingsPath),
    writeSettings: (preferences) => saveUpdateSettings(updateSettingsPath, preferences),
    storePackage: (version, bytes) => storeUpdatePackage(join(updateDirectory, "updates"), version, bytes),
    onSettingsChanged: scheduleUpdates,
    logger: ctx.logger,
  });
  ctx.effect(() => {
    scheduleUpdates(updater.status());
    return () => {
      clearInterval(updateTimer);
      clearTimeout(updateStartup);
      updater.dispose();
    };
  }, "cpa: plugin update checks");

  return { updateDirectory, updater };
}
