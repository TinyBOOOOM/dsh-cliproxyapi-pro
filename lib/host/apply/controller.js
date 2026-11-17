// Credentials, media preferences, online model info, account controller and refresh scheduling.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { accountKindOverrides, loadMediaSettings } from "../../media/index.js";
import { outsideHmrTransaction } from "../apply-utils.js";
import { toCredentialRef, getEnvValue } from "../config.js";
import { createCpaController } from "../controller.js";
import { createModelInfo } from "../model-info.js";
import { sanitizeAssembly } from "../prompt-sanitize.js";

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

  // Media preferences (lib/media/settings.js) live in their own file next to the
  // account state, never inside it, so no state migration is involved.
  const mediaSettingsPath = join(updateDirectory, "media-settings.json");
  let mediaWarned = false;
  // Generation is off for a new profile; one that already picked a model or
  // generated something before the switch existed (session or job file, no
  // readable settings file) keeps it on.
  const mediaUsedBefore = () =>
    existsSync(join(updateDirectory, "media-sessions.json")) || existsSync(join(updateDirectory, "media-jobs.json"));
  const readMedia = () => {
    const loaded = loadMediaSettings(mediaSettingsPath);
    if ((loaded.error !== undefined || !existsSync(mediaSettingsPath)) && mediaUsedBefore()) {
      loaded.settings = { ...loaded.settings, enabled: true };
    }
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

  // Public model catalogs for recommendations (download only; global switch, default on).
  // Timers live in lifecycle.js; new data re-syncs the accounts once.
  const modelInfo = createModelInfo({
    cachePath: join(updateDirectory, "model-info.json"),
    enabled: () => readState().onlineModelInfo !== false,
    logger: ctx.logger,
    onChange: () => {
      void controller.refreshAll().finally(() => shared.syncAgentTool?.());
    },
  });

  const controller = createCpaController({
    settings: ctx.settings,
    readState,
    writeState,
    modelInfo,
    onModelInfoToggled: () => {
      void modelInfo.refresh().finally(() => controller.refreshAll().finally(() => shared.syncAgentTool?.()));
    },
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

  // Some upstreams (Antigravity-backed Gemini accounts) return an unexplained
  // 429 whenever the system prompt contains the exact phrase "DeepSeek
  // Harness", and CPA cools the whole account down over that one rejection.
  // The assemble waterfall is the last point where the prompt text is still
  // editable; matching steps get a copy with the phrase rewritten. This fires
  // once per model step, so the per-request work stays a regex over already
  // built strings — a sanitizing failure degrades to the unsanitized prompt.
  ctx.on("system-prompt/assemble", (assembly, context, next) => {
    const provider = context?.modelSelection?.provider;
    const replacement = typeof provider === "string" ? controller.sanitizePromptRoutes().get(provider) : undefined;
    if (replacement === undefined) return next();
    return next().then((resolved) => {
      try {
        return sanitizeAssembly(resolved, replacement);
      } catch (error) {
        ctx.logger?.warn?.(
          `dsh-cliproxyapi: prompt sanitizing failed, sending the prompt unchanged: ${error instanceof Error ? error.message : String(error)}`
        );
        return resolved;
      }
    });
  });

  return { resolveApiKey, describeApiKey, reschedule, mediaSettingsPath, readMedia, controller, modelInfo };
}
