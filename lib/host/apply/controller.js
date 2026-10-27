// Credentials, media preferences, account controller and refresh scheduling.

import { join } from "node:path";
import { accountKindOverrides, loadMediaSettings } from "../../media/index.js";
import { outsideHmrTransaction } from "../apply-utils.js";
import { toCredentialRef, getEnvValue } from "../config.js";
import { createCpaController } from "../controller.js";

export function createController(shared) {
  const { ctx, readExistingPiAiRoute, readDefaultModel, readState, writeState, updateDirectory } = shared;
  shared.timer = undefined;
  shared.startupTimeout = undefined;

  const resolveApiKey = async (refName) => {
    try {
      const ref = toCredentialRef(refName);
      const credentials = ctx.get("credentials");
      const stored = credentials === undefined ? undefined : await credentials.resolve(ref);
      const raw = stored?.value ?? getEnvValue(ctx, ref);
      const value = raw?.trim();
      return value === undefined || value === "" ? undefined : value;
    } catch {
      return undefined;
    }
  };

  const describeApiKey = async (refName) => {
    try {
      const ref = toCredentialRef(refName);
      const credentials = ctx.get("credentials");
      if (credentials !== undefined) {
        return await credentials.describe(ref);
      }
      const envVal = getEnvValue(ctx, ref);
      return {
        configured: envVal !== undefined && envVal.length > 0,
        writable: false,
      };
    } catch {
      return { configured: false, writable: true };
    }
  };

  const reschedule = () => {
    if (shared.timer !== undefined) clearInterval(shared.timer);
    shared.timer = outsideHmrTransaction(ctx, () =>
      setInterval(() => {
        void controller.refreshAll().finally(() => shared.syncAgentTool());
      }, readState().refreshIntervalSeconds * 1000)
    );
  };

  // Media preferences (lib/media.js) live in their own file next to the
  // account state, never inside it, so no state migration is involved.
  const mediaSettingsPath = join(updateDirectory, "media-settings.json");
  let mediaWarned = false;
  const readMedia = () => {
    const loaded = loadMediaSettings(mediaSettingsPath);
    if (loaded.error === undefined) {
      mediaWarned = false;
    } else if (!mediaWarned) {
      mediaWarned = true;
      ctx.logger?.warn?.(
        `dsh-cliproxyapi: ${mediaSettingsPath} is unreadable; default media settings apply until it is saved again (the damaged file is then kept as *.corrupt-*.json)`
      );
    }
    return loaded;
  };

  const controller = createCpaController({
    settings: ctx.settings,
    readState,
    writeState,
    mediaKindOverrides: (id) => accountKindOverrides(readMedia().settings, id),
    resolveApiKey,
    describeApiKey,
    setCredential: async (ref, value) => {
      const credentials = ctx.get("credentials");
      if (credentials === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await credentials.set(ref, value);
    },
    unsetCredential: async (ref) => {
      await ctx.get("credentials")?.unset(ref);
    },
    readExistingPiAiRoute,
    readDefaultModel,
    setTimeout: (fn, ms) => outsideHmrTransaction(ctx, () => setTimeout(fn, ms)),
    environmentBaseURL: () => getEnvValue(ctx, "CLIPROXYAPI_BASE_URL"),
    logger: ctx.logger,
    onGlobalsChanged: () => reschedule(),
  });

  return { resolveApiKey, describeApiKey, reschedule, mediaSettingsPath, readMedia, controller };
}
