import { outsideHmrTransaction, accountPatchFromInput } from "./host/apply-utils.js";
import { renderAccountStatus, renderQuotaText, renderStatusText } from "./host/status-text.js";
import { MOUNTED, WAITERS, mountedSet, mountWaiters, mountOnce } from "./host/mount-guard.js";
import { ROUTES, sendJson, loopbackAuthority, admitRequest, sameAuthorityOrigin, admitUpdateRequest, readJsonBody } from "./host/http-gate.js";
import { serializeSettings, createCpaController } from "./host/controller.js";
import { sleep, sameJson, MANAGED_ROUTE_FIELDS, stripManagedFields, mutateSettingsSafe, formatModelView, CpaRuntime } from "./host/runtime.js";
import { positiveInteger, firstPositiveInteger, stringArray, catalogArray, rawReasoningEfforts, parseReasoningLevels, parseReasoningWire, normalizeCpaRoot, discoveryCandidates, parseCatalog, readBoundedJson, fetchListing, mergeListing, discoverCpa } from "./host/discovery.js";
import { resolveStateFilePath, loadPersistedState, savePersistedState } from "./host/state-store.js";
import { pickAccount, pickFields, plainObject, normalizeState, mergeHostConfig, accountConflicts, assertNoConflicts, newAccountDefaults, patchAccount } from "./host/accounts.js";
import { nativeProtocol, modelProtocol, routeKeyFor, routeBaseURL, supportedReasoning, claudeUsesAdaptiveThinking, applyModelOverride, protocolCompat, toPiAiModelProfile, isChatModel, buildPiAiRoutes, managedRouteKeys } from "./host/routes.js";
import { splitPrefixes, filterModels, modelFamily, modelVersion, compareVersionDescending, sortModelsNewestFirst, recommendModels } from "./host/models.js";
import { PACKAGE_NAME, name, inject, DEFAULT_ACCOUNT_ID, DEFAULT_PROVIDER, DEFAULT_DISPLAY_NAME, DEFAULT_API_KEY_ENV, STATE_VERSION, ACCOUNT_ID_PATTERN, ACCOUNT_FIELDS, GLOBAL_FIELDS, DEFAULT_REFRESH_INTERVAL_SECONDS, DEFAULT_PROBE_TIMEOUT_MS, LOCAL_CANDIDATES, MAX_RECOMMENDED_MODELS, MAX_CATALOG_BYTES, PI_AI_NS, REASONING_LEVELS, PROTOCOLS, PROTOCOL_ROUTES, DEFAULT_MODEL_NS, REF_PATTERN, toCredentialRef, getEnvValue, readVolatile, normalizeStringList, OVERRIDE_LIMITS, normalizePositiveInteger, normalizeModelOverrides, resolveConfig, normalizeAccountId } from "./host/config.js";
// Zero-external-dependency host plugin for DSH CLIProxyAPI auto-discovery, model selection & sync.
// Uses only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.webServer`).
// It deliberately registers no agent tool: accounts are managed in the Settings
// page, HTTP routes and slash commands, so nothing adds to model context.
// Image / video models (lib/media.js) are classified and kept out of the
// chat routes; their preferences live in media-settings.json.

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import {
  createPluginUpdater, loadUpdateSettings, saveUpdateSettings, storeUpdatePackage,
  UPDATE_INTERVAL_MS, UpdateError,
} from "./updater.js";
import { createQuotaController } from "./quota.js";
import {
  accountKindOverrides, applyMediaPatch, chooseMediaModel, createMediaSessionStore, detectMediaKind,
  diagnoseMedia, effectiveKind, generateImages, IMAGE_ASPECTS, loadMediaSettings, MAX_REFERENCE_IMAGES,
  mediaAliasTarget, MediaError, mediaModelEnabled, mediaOptions, normalizeMediaSettings, outputDirectory,
  outputStem, parseImageCommand, recentEntry, saveMediaSettings, validCommandId, validSessionId, writeOutputFiles,
  createMediaJobStore, downloadVideo, MAX_VIDEO_BYTES, parseVideoCommand, retrieveVideo, submitVideo, VIDEO_ASPECTS, VIDEO_JOB_TTL_MS,
  fitReferenceImage, REFERENCE_MAX_EDGE,
  EDIT_SOURCE_MAX_SECONDS, EXTEND_SOURCE_SECONDS, parseVideoEditCommand, submitVideoEdit, VIDEO_EDIT_MODEL,
  isMp4, mp4Duration, videoImageBudget, VIDEO_UPLOAD_MAX_BYTES,
  interpretationLabels, interpretationRequest, parseInterpretation,
  agentPolicy, applySessionPolicy, approvalText, chargeSeconds, GENERATE_MEDIA, GENERATE_MEDIA_OUTPUT, GENERATE_MEDIA_TOOL, parseToolArgs,
  sniffImageType, toolCommandLine, toolRunId,
} from "./media.js";

// #region Constants & Config Resolution



// #endregion

// #region Accounts





// #endregion

// #region Persistent State Store



// #endregion

// #region Discovery & Catalog Parsing



// #endregion

// #region Profile & Model Builder





// #endregion

// #region Runtime Synchronizer





// #endregion

// #region HTTP Gate & WebServer Routes



// #endregion

// #region Mount Once Guard



// #endregion

// #region Plugin Apply Implementation







function applyImpl(ctx, config) {
  const stateFilePath = resolveStateFilePath(ctx);
  const persisted = loadPersistedState(stateFilePath);

  const readExistingPiAiRoute = (provider) => {
    try {
      const descriptors = ctx.settings.describe();
      const piAi = descriptors.find((d) => d.ns === PI_AI_NS);
      return piAi?.value?.providers?.[provider];
    } catch {
      return undefined;
    }
  };

  const readDefaultModel = () => {
    try {
      const value = ctx.settings.describe().find((d) => d.ns === DEFAULT_MODEL_NS)?.value;
      return typeof value?.provider === "string" && typeof value?.model === "string"
        ? { provider: value.provider, model: value.model }
        : undefined;
    } catch {
      return undefined;
    }
  };

  // Seed a selection from every managed route, not just the base one, so a
  // restart after protocol routing keeps Messages / Responses models checked.
  const existingManagedIds = (provider) =>
    managedRouteKeys(provider).flatMap((key) => {
      const route = readExistingPiAiRoute(key);
      return Array.isArray(route?.models)
        ? route.models.map((m) => m?.id).filter((id) => typeof id === "string" && id.trim() !== "")
        : [];
    });

  // Migrate a legacy single-account file into `accounts[]`, keeping a copy.
  if (Object.keys(persisted).length > 0 && !Array.isArray(persisted.accounts)) {
    savePersistedState(stateFilePath.replace(/\.json$/, ".v1.json"), persisted);
  }

  // An account without a saved selection keeps the models already on its
  // pi-ai routes when that is a curated list (<= 35). Otherwise it stays
  // unset and its first successful probe seeds recommendModels().
  let memState = normalizeState(mergeHostConfig(persisted, config));
  memState = {
    ...memState,
    accounts: memState.accounts.map((account) => {
      if (account.selectedModels !== undefined) return account;
      const existingIds = existingManagedIds(account.provider);
      return existingIds.length > 0 && existingIds.length <= 35
        ? { ...account, selectedModels: existingIds }
        : account;
    }),
  };
  savePersistedState(stateFilePath, memState);

  // The state file is re-read on every access so hand edits take effect.
  const readState = () => {
    const fresh = loadPersistedState(stateFilePath);
    if (Object.keys(fresh).length > 0) memState = normalizeState(fresh);
    return memState;
  };
  const writeState = (state) => {
    memState = state;
    savePersistedState(stateFilePath, state);
  };

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
  const currentVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
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

  let timer;
  let startupTimeout;

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
    if (timer !== undefined) clearInterval(timer);
    timer = outsideHmrTransaction(ctx, () =>
      setInterval(() => {
        void controller.refreshAll().finally(() => syncAgentTool());
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

  // Quota ("额度" tab + composer badge): management keys live in the
  // credentials service under their own refs, never in account state.
  const quota = createQuotaController({
    listAccounts: () => controller.quotaAccounts(),
    resolveKey: (ref) => resolveApiKey(ref),
    describeKey: (ref) => describeApiKey(ref),
    setKey: async (ref, value) => {
      const credentials = ctx.get("credentials");
      if (credentials === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await credentials.set(ref, value);
    },
    unsetKey: async (ref) => {
      await ctx.get("credentials")?.unset(ref);
    },
    logger: ctx.logger,
  });
  ctx.effect(() => () => quota.dispose(), "cpa: quota");

  /** Media page payload: preferences (without per-account maps) and each account's media models. */
  const mediaStatus = () => {
    const { settings, error } = readMedia();
    const { accounts: perAccount, ...global } = settings;
    return {
      settings: global,
      ...(error === undefined ? {} : { settingsError: error }),
      accounts: controller.mediaAccounts().map((account) => {
        const overrides = accountKindOverrides(settings, account.id);
        return {
          ...account,
          disabledModels: perAccount[account.id]?.disabledModels ?? [],
          kindOverrides: overrides,
          models: account.models.map((m) => ({
            ...m,
            enabled: mediaModelEnabled(settings, account.id, m.id),
            overridden: overrides[m.id] !== undefined,
          })),
        };
      }),
    };
  };

  const saveMedia = async (body) => {
    const accountId = body?.account?.accountId;
    if (accountId !== undefined && !controller.mediaAccounts().some((a) => a.id === accountId)) {
      throw new MediaError("invalid-account");
    }
    const { settings, kindsChanged } = applyMediaPatch(readMedia().settings, body);
    saveMediaSettings(mediaSettingsPath, settings);
    // A reclassified model enters or leaves the chat routes on the next sync.
    if (kindsChanged === undefined) return { ok: true, media: mediaStatus() };
    await controller.refreshAccount(kindsChanged);
    return { ok: true, media: mediaStatus(), status: await controller.statusPayload() };
  };

  // Per-session model picks and recent outputs, in their own file.
  const mediaSessions = createMediaSessionStore(join(updateDirectory, "media-sessions.json"));

  const mediaChoices = () => {
    const { settings } = readMedia();
    const accounts = controller.mediaAccounts();
    return {
      settings,
      accounts,
      options: { image: mediaOptions(accounts, settings, "image"), video: mediaOptions(accounts, settings, "video") },
    };
  };

  /**
   * Choices for a generation command. When a needed kind is not offered and an
   * enabled account either has not read its catalog yet (just after a start
   * or reload) or reported a failed plain listing, sync once and look again
   * instead of failing on a timing race. An incomplete-catalog retry is
   * limited to once per 30 s so a permanently missing listing is not fetched
   * on every request.
   */
  let catalogRetryAt = 0;
  const mediaChoicesFor = async (kind) => {
    let choices = mediaChoices();
    const missing = (k) => choices.options[k].length === 0;
    const someMissing = kind === "any" ? missing("image") || missing("video") : missing(kind);
    const cold = choices.accounts.some((a) => a.enabled && a.discovered === 0);
    const incomplete = choices.accounts.some((a) => a.enabled && a.catalogIncomplete === true);
    const retryIncomplete = incomplete && Date.now() - catalogRetryAt >= 30_000;
    if (someMissing && (cold || retryIncomplete)) {
      catalogRetryAt = Date.now();
      await controller.refreshAll();
      choices = mediaChoices();
    }
    return choices;
  };

  /** One line per account for an empty choice: state and catalog counts, never keys or URLs. */
  const mediaAccountsSummary = (accounts, kind) =>
    accounts
      .map((a) => `${a.displayName || a.id}: ${a.enabled ? a.state : "disabled"}, ${a.discovered} model(s), ${a.models.filter((m) => m.kind === kind).length} ${kind}`)
      .join("; ") || "no account";

  /** What the composer button shows for one session (no network access). */
  const sessionView = (sessionId) => {
    const { settings, options, accounts } = mediaChoices();
    const entry = sessionId === undefined ? { recent: [] } : mediaSessions.get(sessionId);
    const current = {};
    for (const kind of ["image", "video"]) {
      try {
        const { option, source } = chooseMediaModel({
          options: options[kind],
          sessionRef: entry[kind],
          lastRef: settings.lastSelection[kind],
        });
        current[kind] = { ref: option.ref, source };
      } catch {
        current[kind] = null;
      }
    }
    const policy = agentPolicy(settings, entry);
    return {
      sessionId: sessionId ?? null,
      options,
      current,
      // Compatibility composer fallback; native questions never enter this map.
      pendingConfirmations: sessionId === undefined ? [] : [...pendingConfirms.entries()]
        .filter(([, waiting]) => waiting.sessionId === sessionId)
        .map(([commandId, { kind, en, zh, expiresAt }]) => ({ commandId, kind, en, zh, expiresAt })),
      // True while an enabled account's last catalog read missed the plain
      // listing; the composer button retries instead of keeping an old,
      // image-less list.
      catalogIncomplete: accounts.some((a) => a.enabled === true && a.catalogIncomplete === true),
      // The agent tool's rules for this session (shown while the tool is switched on).
      agent: {
        enabled: settings.agentTool === true,
        imageConfirm: policy.imageConfirm,
        videoConfirm: policy.videoConfirm,
        videoBudget: policy.budget,
        used: policy.used,
        sources: policy.sources,
        global: { imageConfirm: settings.imageConfirm, videoConfirm: settings.videoConfirm, videoBudget: settings.videoBudget },
      },
      recent: entry.recent
        .filter((r) => existsSync(r.file))
        .slice(0, 12)
        .map((r) => ({ id: r.id, kind: r.kind, name: basename(r.file), model: r.model, createdAt: r.createdAt })),
    };
  };

  /** Pick a model for one session (and remember it as the last pick); `ref: null` clears the session's pick. */
  const saveSessionPick = (body) => {
    // Agent-tool overrides for one session (no model pick in the same request).
    if (body?.kind === undefined && ["imageConfirm", "videoConfirm", "videoBudget"].some((k) => k in (body ?? {}))) {
      const sessionId = validSessionId(body.sessionId);
      if (sessionId === undefined) throw new MediaError("invalid-session");
      const { settings } = mediaChoices();
      mediaSessions.update(sessionId, (entry) => applySessionPolicy(entry, body, settings));
      return { ok: true, session: sessionView(sessionId) };
    }
    const kind = body?.kind;
    if (kind !== "image" && kind !== "video") throw new MediaError("invalid-request");
    const sessionId = body.sessionId === undefined || body.sessionId === null ? undefined : validSessionId(body.sessionId);
    if (body.sessionId !== undefined && body.sessionId !== null && sessionId === undefined) throw new MediaError("invalid-session");
    const ref = body.ref === null ? null : typeof body.ref === "string" ? body.ref : undefined;
    if (ref === undefined) throw new MediaError("invalid-model");
    const { settings, options } = mediaChoices();
    if (ref !== null && !options[kind].some((o) => o.ref === ref)) throw new MediaError("invalid-model");
    if (sessionId !== undefined) {
      mediaSessions.update(sessionId, (entry) => {
        if (ref === null) delete entry[kind];
        else entry[kind] = ref;
      });
    }
    if (ref !== null && settings.lastSelection[kind] !== ref) {
      saveMediaSettings(mediaSettingsPath, normalizeMediaSettings({ ...settings, lastSelection: { ...settings.lastSelection, [kind]: ref } }));
    }
    return { ok: true, session: sessionView(sessionId) };
  };

  const MEDIA_FILE_TYPES = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  };

  /**
   * One `Range: bytes=a-b` request against a file of `size` bytes: `[start, end]`,
   * `undefined` without a (usable single) range, `null` when unsatisfiable.
   */
  const byteRange = (header, size) => {
    if (typeof header !== "string" || header === "") return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (match === null || (match[1] === "" && match[2] === "")) return undefined;
    let start;
    let end;
    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (suffix === 0) return null;
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
    return [start, end];
  };
  // Request bodies carry references base64-encoded and upstreams cap the body
  // (xAI: "Failed to read request body: length limit exceeded"). Video
  // requests use the measured `videoImageBudget()`; image edits keep this
  // unmeasured share.
  const FIRST_FRAME_MAX_BYTES = 1_000_000;
  const REFERENCES_MAX_BYTES = 1_400_000;

  /**
   * One attached image within `maxBytes`: as stored when it fits; a PNG is
   * re-encoded here (JPEG on white, long edge ≤ 1280); another format asks
   * DSH's attachment store for a smaller request version.
   * @throws MediaError `reference-too-large`.
   */
  const readReference = async (store, block, maxBytes, signal) => {
    const stored = await store.readImage(block.attachment, signal);
    const image = { mediaType: stored.ref?.mediaType ?? block.attachment?.mediaType, data: stored.data };
    const fitted = fitReferenceImage(image, maxBytes);
    if (fitted !== undefined) return { mediaType: fitted.mediaType, data: fitted.data };
    const width = Number(stored.ref?.width ?? block.attachment?.width);
    const height = Number(stored.ref?.height ?? block.attachment?.height);
    if (typeof store.readImageRequest === "function" && width > 0 && height > 0) {
      const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(width, height));
      try {
        const smaller = await store.readImageRequest(
          block.attachment,
          { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), maxBytes },
          signal
        );
        if (smaller?.data?.byteLength <= maxBytes) return { mediaType: smaller.mediaType, data: smaller.data };
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    throw new MediaError("reference-too-large", String(Math.round(maxBytes / 1000)));
  };

  // #region Parameter interpretation (the session's chat model)
  const INTERPRET_TIMEOUT_MS = 30_000;
  const INTERPRET_MAX_TOKENS = 2000;

  /** The provider / model the session's agent last used (else its options, else the default model). */
  const sessionChatTarget = (agent) => {
    const valid = (t) => (t && typeof t.provider === "string" && t.provider !== "" && typeof t.model === "string" && t.model !== "" ? { provider: t.provider, model: t.model } : undefined);
    try {
      const header = valid(agent?.session?.requestHeader?.()?.config);
      if (header !== undefined) return header;
    } catch {
      // fall through
    }
    return valid(agent?.options) ?? valid(ctx.get?.("agentDefaultModel")?.currentSelection?.());
  };

  /**
   * Ask the session's chat model which parameters the prompt states.
   * Never throws: without an `llm` service or a model it returns undefined;
   * a failed call returns `{ failed: true, by }`.
   * @param fixed - fields the rule parser already set (they win).
   * @returns `{ by, values, prompt, items, failed? }` or undefined.
   */
  const interpretParams = async ({ agent, command, text, images = 0, fixed = [], signal }) => {
    const llm = ctx.get?.("llm");
    const target = sessionChatTarget(agent);
    if (typeof llm?.stream !== "function" || target === undefined) return undefined;
    const by = `${target.provider}/${target.model}`;
    const request = interpretationRequest({ command, text, images, fixed });
    const timeout = AbortSignal.timeout(INTERPRET_TIMEOUT_MS);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    try {
      const parts = new Map();
      for await (const chunk of llm.stream({
        provider: target.provider,
        model: target.model,
        system: request.system,
        messages: [{ role: "user", content: [{ type: "text", text: request.user }] }],
        maxTokens: INTERPRET_MAX_TOKENS,
        ...(agent?.session?.id === undefined ? {} : { sessionId: agent.session.id }),
        purpose: "cpa-media-params",
        signal: combined,
      })) {
        if (chunk?.type === "text-delta") parts.set(chunk.index, (parts.get(chunk.index) ?? "") + chunk.text);
        else if (chunk?.type === "block-end" && chunk.block?.type === "text") parts.set(chunk.index, chunk.block.text);
      }
      const answer = [...parts.values()].join("");
      const parsed = parseInterpretation(answer, { command, text, fields: request.fields, images });
      if (parsed === undefined) throw new Error("no JSON in the answer");
      return { by, ...parsed, items: interpretationLabels(parsed.values) };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      ctx.logger?.warn?.(`cpa: parameter interpretation with ${by} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { by, failed: true, values: {}, prompt: text, items: [] };
    }
  };

  /** The run-record field describing an interpretation. */
  const interpretedRecord = (result, original) =>
    result === undefined
      ? {}
      : { interpreted: { by: result.by, items: result.items, ...(result.failed ? { failed: true } : {}), ...(result.prompt !== original ? { prompt: true } : {}) } };
  // #endregion

  /** Plain-English host text for a media failure (slash command output and run records). */
  const mediaFailureText = (error, kind = "image") => {
    if (!(error instanceof MediaError)) return error instanceof Error ? error.message : String(error);
    const detail = error.detail;
    const video = kind === "video";
    const noun = video ? "video" : "image";
    switch (error.code) {
      case "missing-prompt": return video ? "add a prompt, for example: /cpa-video waves rolling onto a beach at sunset" : "add a prompt, for example: /cpa-image a red fox in the snow";
      case "invalid-option": return video
        ? `unknown option ${detail}; use -m <model>, --aspect <ratio>, -s <1-15>, -r <480p|720p>`
        : `unknown option ${detail}; use -m <model>, --aspect <ratio>, -n <1-4>`;
      case "invalid-aspect": return `--aspect must be one of ${(video ? VIDEO_ASPECTS : IMAGE_ASPECTS).join(", ")}`;
      case "invalid-count": return "-n must be 1 to 4";
      case "invalid-video-seconds": return "-s / --seconds must be a whole number from 1 to 15";
      case "invalid-video-resolution": return "-r / --resolution must be 480p or 720p";
      case "no-media-model": return `no ${noun} model is available (${detail || "no account"}); check Settings → CLIProxyAPI → Generation, or run /cpa-refresh if a catalog has not been read yet`;
      case "choose-model": return `several ${noun} models are available (${detail}); pick one with the button next to the composer or pass -m <model>`;
      case "model-not-found": return `no enabled ${noun} model matches; available: ${detail || "none"}`;
      case "model-ambiguous": return `several ${noun} models match (${detail}); be more specific`;
      case "workspace-not-local": return `the session's working directory is not a local folder, so the ${noun} cannot be saved`;
      case "unsupported-attachment": return detail === "edit"
        ? "attach one MP4 video as the source (images cannot be used here)"
        : video ? "only image attachments can be used for /cpa-video (first frame, references, first / last frames)" : "only image attachments can be used as references";
      case "too-many-references": return video ? `attach at most ${detail ?? "14"} images for this mode (more than 2 images are references)` : `attach at most ${MAX_REFERENCE_IMAGES} reference images`;
      case "frames-need-images": return "--ref / --last / --first-last need attached images: one for a reference or a last frame, two for first and last frame";
      case "needs-video-15": return "pinned first / last frames need grok-imagine-video-1.5; pick it with -m or the model button";
      case "invalid-extend-seconds": return "an extension adds 2 to 10 seconds (-s 2-10)";
      case "no-video-source": return "no source video: attach an MP4, or pass --video <path>, --url <public URL> or --from <command id>";
      case "video-source-expired": return "that video's file is gone and its short-lived xAI link has expired; attach the MP4 or pass --video <path>";
      case "one-video-source": return "use one source video: an attachment, --video, --url or --from";
      case "invalid-video-url": return "--url must be a public http(s) address without a user name or password";
      case "video-not-found": return `no video file at ${detail}`;
      case "video-not-mp4": return "the source video must be an MP4 file (H.264, H.265 or AV1)";
      case "source-too-large": return `the source video is ${detail} MiB; videos up to ${Math.round(VIDEO_UPLOAD_MAX_BYTES / 1024 / 1024)} MiB can be sent inline — shorten or compress it, or pass a public link with --url`;
      case "request-too-large": return video
        ? `the request is too large for this server (${detail ? `${Math.round(Number(detail) / 1024)} KB` : "body limit"}); attach smaller or fewer images`
        : "the request is too large for this server";
      case "route-unsupported": return `this server's upstream does not offer ${detail === "extensions" ? "video extension" : detail === "edits" ? "video editing" : detail} (HTTP 405); CPA may pause the credential for this model for about a minute`;
      case "edit-source-too-long": return `xAI edits videos of at most ${EDIT_SOURCE_MAX_SECONDS} seconds (this one has ${detail} s); extend it instead`;
      case "extend-source-length": return `xAI extends videos of ${EXTEND_SOURCE_SECONDS.min} to ${EXTEND_SOURCE_SECONDS.max} seconds (this one has ${detail} s)`;
      case "reference-too-large": return `an attached image could not be made smaller than ${detail ?? "1000"} KB; attach a smaller image`;
      case "upstream-error": return `CPA rejected the request (${detail})`;
      case "timeout": return video ? "CPA did not answer in time" : "CPA did not answer within 3 minutes";
      case "network": return "could not reach CPA";
      case "no-image": return "CPA returned no image";
      case "invalid-image":
      case "invalid-response": return video ? "CPA returned an answer this plugin does not understand" : "CPA returned data that is not a PNG, JPEG, WebP or GIF image";
      case "image-too-large": return "an image is larger than 32 MiB";
      case "video-too-large": return `the video is larger than ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MiB`;
      case "invalid-video": return "CPA returned data that is not an MP4, MOV or WebM video";
      case "video-failed": return `the video could not be generated${detail ? ` (${detail})` : ""}`;
      case "expired": return "CPA no longer knows this video: more than 3 hours have passed since it was submitted";
      case "download-failed": return `could not download the generated ${noun}`;
      case "write-failed": return `could not write the ${noun} file${detail ? ` (${detail})` : ""}`;
      case "no-endpoint": return "this account has no usable server address yet";
      case "invalid-account": return "the model's account no longer exists";
      case "interrupted": return "stopped because the plugin was reloaded or DSH closed";
      default: return error.code;
    }
  };
  // #region Background generation jobs and the session's "running" state
  //
  // `/cpa-image` returns as soon as the request is admitted, so the composer
  // clears the draft at once; the generation continues here and its chat row
  // follows it through `media/command`. DSH counts only agent turns as
  // running, so while a job runs this plugin publishes the host's own
  // `api-session/status` event for that session (the workspace list shows it
  // as running, then completed). It is republished every few seconds and
  // after the agent itself goes idle, because those reset it to idle.

  const mediaJobs = new Map(); // job key → { sessionId, abort }
  // job key → the promise of a job of this activation, until it settles (the agent tool waits on it).
  const jobPromises = new Map();
  const settleWith = (key, promise) => {
    jobPromises.set(key, promise);
    void promise.finally(() => {
      if (jobPromises.get(key) === promise) jobPromises.delete(key);
    });
    return promise;
  };
  let mediaJobSeq = 0;
  let mediaHeartbeat;
  const MEDIA_HEARTBEAT_MS = 5000;
  const jobSessions = () => new Set([...mediaJobs.values()].map((job) => job.sessionId).filter(Boolean));
  const agentRunning = (sessionId) => {
    try {
      return ctx.get?.("agents")?.get?.(sessionId)?.status === "running";
    } catch {
      return false;
    }
  };
  const publishSessionStatus = (sessionId, running) => {
    if (typeof ctx.emit !== "function") return;
    try {
      ctx.emit("api-session/status", sessionId, running);
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not publish the session status: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const settleSessionStatus = (sessionId) => {
    if (sessionId === undefined || jobSessions().has(sessionId) || agentRunning(sessionId)) return;
    publishSessionStatus(sessionId, false);
  };
  const syncHeartbeat = () => {
    if (mediaJobs.size > 0 && mediaHeartbeat === undefined) {
      mediaHeartbeat = setInterval(() => {
        for (const sessionId of jobSessions()) publishSessionStatus(sessionId, true);
      }, MEDIA_HEARTBEAT_MS);
      mediaHeartbeat.unref?.();
    } else if (mediaJobs.size === 0 && mediaHeartbeat !== undefined) {
      clearInterval(mediaHeartbeat);
      mediaHeartbeat = undefined;
    }
  };
  ctx.on?.("agent/status", (event) => {
    const sessionId = event?.agent?.id;
    if (event?.status === "running" || !jobSessions().has(sessionId)) return;
    // After the host's own idle notice for this transition.
    setTimeout(() => {
      if (jobSessions().has(sessionId)) publishSessionStatus(sessionId, true);
    }, 0);
  });
  ctx.effect(
    () => () => {
      const sessions = jobSessions();
      for (const job of mediaJobs.values()) job.abort.abort(new MediaError("interrupted"));
      mediaJobs.clear();
      syncHeartbeat();
      for (const sessionId of sessions) settleSessionStatus(sessionId);
    },
    "cpa: generation jobs"
  );

  /** Update one run record (and prepend new recent outputs) in the session store; never throws. */
  const recordRun = (sessionId, commandId, patch, recent = []) => {
    if (sessionId === undefined) return;
    try {
      mediaSessions.update(sessionId, (entry) => {
        if (recent.length > 0) entry.recent = [...recent, ...entry.recent];
        if (commandId === undefined) return;
        const index = entry.runs.findIndex((run) => run.commandId === commandId);
        if (index >= 0) entry.runs[index] = { ...entry.runs[index], ...patch };
        else entry.runs = [{ commandId, ...patch }, ...entry.runs];
      });
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not record a generation result: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** How the chat row names the save folder: relative to the working directory when inside it. */
  const folderLabel = (cwd, dir) => {
    const rel = relative(cwd, dir);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : basename(dir);
  };

  /** Run one admitted image request in the background; resolves when it has settled and been recorded. */
  const startImageJob = ({ sessionId, commandId, option, args: admitted, references, cwd, outputDir, endpoint, interpret }) => {
    const key = commandId ?? `job-${++mediaJobSeq}`;
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    const started = Date.now();
    return settleWith(key, (async () => {
      try {
        let args = admitted;
        if (interpret !== undefined) {
          if (commandId !== undefined) videoLive.set(commandId, { phase: "interpreting" });
          const result = await interpret(abort.signal);
          if (commandId !== undefined) videoLive.delete(commandId);
          if (result !== undefined) {
            args = { ...admitted, ...result.values, prompt: result.prompt };
            recordRun(sessionId, commandId, {
              prompt: args.prompt,
              ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
              count: args.count ?? 1,
              ...interpretedRecord(result, admitted.prompt),
            });
          }
        }
        const images = await generateImages({
          rootURL: endpoint.rootURL,
          apiKey: endpoint.apiKey,
          model: option.modelId,
          prompt: args.prompt,
          ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
          count: args.count ?? 1,
          references,
          signal: abort.signal,
        });
        const dir = outputDirectory(cwd, outputDir);
        const paths = writeOutputFiles(dir, outputStem(option.modelId, args.prompt), images);
        const revised = images.find((image) => image.revisedPrompt !== undefined)?.revisedPrompt;
        recordRun(
          sessionId,
          commandId,
          {
            status: "done",
            files: paths.length,
            folder: folderLabel(cwd, dir),
            finishedAt: new Date().toISOString(),
            ...(revised === undefined ? {} : { revisedPrompt: revised }),
          },
          paths.map((p) => recentEntry("image", p, option.ref, new Date(), commandId))
        );
        ctx.logger?.info?.(`cpa: /cpa-image wrote ${paths.length} image(s) with ${option.modelId} in ${Math.round((Date.now() - started) / 1000)} s`);
      } catch (thrown) {
        const error = abort.signal.aborted ? new MediaError("interrupted") : thrown;
        recordRun(sessionId, commandId, {
          status: "error",
          errorCode: error instanceof MediaError ? error.code : "failed",
          error: mediaFailureText(error),
          finishedAt: new Date().toISOString(),
        });
        ctx.logger?.warn?.(`cpa: /cpa-image failed: ${mediaFailureText(error)}`);
      } finally {
        if (commandId !== undefined) videoLive.delete(commandId);
        mediaJobs.delete(key);
        syncHeartbeat();
        settleSessionStatus(sessionId);
      }
    })());
  };

  // #endregion

  /**
   * `/cpa-image`: generate or (with attached images) edit, save into the
   * session's folder. Checks everything it can up front (options, model,
   * folder, references, endpoint), then returns while the generation runs as
   * a background job; the chat row shows its progress and result.
   */
  // Internal callers (the agent tool) add: `literal` (no plain-language
  // parsing or interpretation), `pickSession` (whose model pick applies) and
  // `gate(plan)` (confirmation / budget, run after every check and before
  // anything is recorded or sent; a thrown `gateError` passes through).
  const runImageCommand = async ({ agent, rawInput, attachments = [], signal, commandId, literal = false, pickSession, gate }) => {
    try {
      const args = parseImageCommand(rawInput, { literal });
      const blocks = Array.isArray(attachments) ? attachments : [];
      if (blocks.some((block) => block?.type !== "image")) throw new MediaError("unsupported-attachment");
      if (blocks.length > MAX_REFERENCE_IMAGES) throw new MediaError("too-many-references");
      const { settings, options, accounts } = await mediaChoicesFor("image");
      const sessionId = validSessionId(agent?.id);
      const pickId = validSessionId(pickSession) ?? sessionId;
      const entry = pickId === undefined ? {} : mediaSessions.get(pickId);
      let option;
      try {
        ({ option } = chooseMediaModel({
          options: options.image,
          requested: args.model,
          sessionRef: entry.image,
          lastRef: settings.lastSelection.image,
        }));
      } catch (error) {
        if (error instanceof MediaError && error.code === "no-media-model") {
          throw new MediaError("no-media-model", mediaAccountsSummary(accounts, "image"));
        }
        throw error;
      }
      const workingDirectory = ctx.get?.("workingDirectory");
      const cwd = agent !== undefined && workingDirectory !== undefined ? await workingDirectory.ensure(agent, signal) : undefined;
      if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new MediaError("workspace-not-local");
      const references = [];
      if (blocks.length > 0) {
        const store = ctx.get?.("attachments");
        if (store === undefined) throw new MediaError("unsupported-attachment");
        const each = Math.floor(REFERENCES_MAX_BYTES / blocks.length);
        for (const block of blocks) references.push(await readReference(store, block, each, signal));
      }
      const endpoint = await controller.mediaEndpoint(option.accountId);
      const id = validCommandId(commandId);
      const count = args.count ?? 1;
      if (gate !== undefined) {
        await gate({ kind: "image", mode: references.length > 0 ? "image-edit" : "image-text", option, prompt: args.prompt, count, references: references.length, aspect: args.aspect, cwd, outputDir: settings.outputDir });
      }
      recordRun(sessionId, id, {
        kind: "image",
        status: "running",
        model: option.ref,
        modelName: option.name || option.modelId,
        accountName: option.accountName,
        prompt: args.prompt,
        ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
        count,
        references: references.length,
        files: 0,
        startedAt: new Date().toISOString(),
      });
      void startImageJob({
        sessionId,
        commandId: id,
        option,
        args,
        references,
        cwd,
        outputDir: settings.outputDir,
        endpoint,
        ...(literal
          ? {}
          : {
              interpret: (jobSignal) =>
                interpretParams({ agent, command: "image", text: args.prompt, images: references.length, fixed: ["aspect", "count"].filter((k) => args[k] !== undefined), signal: jobSignal }),
            }),
      });
      const dir = outputDirectory(cwd, settings.outputDir);
      return {
        kind: "success",
        text: `${references.length > 0 ? "Editing" : "Generating"} ${count} image(s) with ${option.modelId} (${option.accountName}); files go to ${dir}`,
      };
    } catch (error) {
      if (signal?.aborted || error?.gateError === true) throw error;
      return { kind: "error", text: `/cpa-image: ${mediaFailureText(error)}` };
    }
  };

  // #region Video jobs (/cpa-video)
  //
  // A video is submitted once and cannot be cancelled (CPA and xAI have no
  // cancel route). The job is stored in media-jobs.json as soon as CPA
  // returns its request id, polled (5 s, then 10 s, then 15 s) and downloaded
  // through CPA into the session's folder. A reload or restart only pauses
  // the polling: the next activation resumes every stored job younger than
  // CPA's 3-hour request binding, and marks older ones expired.

  const mediaJobStore = createMediaJobStore(join(updateDirectory, "media-jobs.json"));
  // commandId → { phase: "submitting" | "queued" | "running" | "downloading", progress? } for the chat row.
  const videoLive = new Map();
  // commandId → { url, accountId, accountName, seconds, sessionId, commandId, at }: the short-lived
  // result URL of a finished video, for /cpa-video-edit and /cpa-video-extend.
  // In memory only (never stored, logged or sent to the page); a reload forgets it.
  const videoSources = new Map();
  // xAI calls its result URLs ephemeral without a number; offer them for an hour.
  const VIDEO_SOURCE_TTL_MS = 60 * 60 * 1000;
  const MAX_VIDEO_SOURCES = 100;
  const rememberSource = (job, status) => {
    if (job.commandId === undefined || status.sourceUrl === undefined) return;
    videoSources.delete(job.commandId);
    videoSources.set(job.commandId, {
      url: status.sourceUrl,
      accountId: job.accountId,
      seconds: status.seconds ?? job.seconds,
      sessionId: job.sessionId,
      commandId: job.commandId,
      at: Date.now(),
    });
    while (videoSources.size > MAX_VIDEO_SOURCES) videoSources.delete(videoSources.keys().next().value);
  };
  const usableSource = (commandId) => {
    const source = videoSources.get(commandId);
    return source !== undefined && Date.now() - source.at <= VIDEO_SOURCE_TTL_MS ? source : undefined;
  };

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      timer.unref?.();
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });

  const pollDelay = (elapsedMs) => (elapsedMs < 60_000 ? 5000 : elapsedMs < 180_000 ? 10_000 : 15_000);
  const MAX_POLL_FAILURES = 12;

  /** Poll, download and record one submitted video; a dispose abort leaves it stored for the next activation. */
  const followVideoJob = async (job, abort) => {
    const live = (patch) => {
      if (job.commandId !== undefined) videoLive.set(job.commandId, { ...(videoLive.get(job.commandId) ?? {}), ...patch });
    };
    const finish = (state, runPatch, recent = []) => {
      mediaJobStore.put({ ...job, state, finishedAt: new Date().toISOString() });
      recordRun(job.sessionId, job.commandId, { ...runPatch, finishedAt: new Date().toISOString() }, recent);
    };
    const fail = (error) => {
      const code = error instanceof MediaError ? error.code : "failed";
      finish(code === "expired" ? "expired" : "failed", { status: "error", errorCode: code, error: mediaFailureText(error, "video") });
      ctx.logger?.warn?.(`cpa: /cpa-video ${job.id} failed: ${mediaFailureText(error, "video")}`);
    };
    const submitted = Date.parse(job.submittedAt);
    let failures = 0;
    live({ phase: "queued" });
    try {
      for (;;) {
        if (Date.now() - submitted > VIDEO_JOB_TTL_MS) throw new MediaError("expired");
        let endpoint;
        let status;
        try {
          endpoint = await controller.mediaEndpoint(job.accountId);
          status = await retrieveVideo({ rootURL: endpoint.rootURL, apiKey: endpoint.apiKey, requestId: job.id, signal: abort.signal });
          failures = 0;
        } catch (error) {
          if (abort.signal.aborted) throw error;
          // A missing account or a refusal that keeps coming back ends the job;
          // network trouble and short CPA hiccups are retried.
          if (error instanceof MediaError && error.code === "invalid-account") throw error;
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) throw error;
          await sleep(pollDelay(Date.now() - submitted), abort.signal);
          continue;
        }
        if (status.state === "failed") throw new MediaError("video-failed", status.error);
        if (status.state === "done") {
          live({ phase: "downloading", progress: 100 });
          const dir = outputDirectory(job.cwd, job.outputDir);
          const path = await downloadVideo({
            rootURL: endpoint.rootURL,
            apiKey: endpoint.apiKey,
            requestId: job.id,
            dir,
            stem: outputStem(job.modelId, job.prompt),
            signal: abort.signal,
          });
          finish("done", { status: "done", files: 1, folder: folderLabel(job.cwd, dir) }, [recentEntry("video", path, job.ref, new Date(), job.commandId)]);
          rememberSource(job, status);
          ctx.logger?.info?.(`cpa: /cpa-video ${job.id} saved after ${Math.round((Date.now() - submitted) / 1000)} s`);
          return;
        }
        live({ phase: status.state, ...(status.progress === undefined ? {} : { progress: status.progress }) });
        await sleep(pollDelay(Date.now() - submitted), abort.signal);
      }
    } catch (error) {
      if (abort.signal.aborted) return; // paused by a reload; resumed by the next activation
      fail(error);
    }
  };

  /** Track one job in the session's running state until it settles. */
  const trackVideoJob = (key, sessionId, run) => {
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    return settleWith(key, (async () => {
      try {
        await run(abort);
      } finally {
        if (mediaJobs.get(key)?.abort === abort) mediaJobs.delete(key);
        videoLive.delete(key);
        syncHeartbeat();
        settleSessionStatus(sessionId);
      }
    })());
  };

  /**
   * Submit one admitted video through `submit(signal)` (generation, edit or
   * extension), store the job, then follow it.
   */
  const startVideoJob = ({ sessionId, commandId, accountId, modelId, ref, prompt, seconds, cwd, outputDir, submit, label }) => {
    const key = commandId ?? `job-${++mediaJobSeq}`;
    if (commandId !== undefined) videoLive.set(commandId, { phase: "submitting" });
    return trackVideoJob(key, sessionId, async (abort) => {
      let requestId;
      try {
        // `submit` may settle the final prompt / length first (parameter interpretation).
        const submitted = await submit(abort.signal);
        requestId = submitted.requestId;
        if (typeof submitted.prompt === "string") prompt = submitted.prompt;
        if (Number.isInteger(submitted.seconds)) seconds = submitted.seconds;
      } catch (thrown) {
        // Cut off before CPA answered: whether it was submitted is unknown.
        const error = abort.signal.aborted ? new MediaError("interrupted") : thrown;
        recordRun(sessionId, commandId, {
          status: "error",
          errorCode: error instanceof MediaError ? error.code : "failed",
          error: mediaFailureText(error, "video"),
          finishedAt: new Date().toISOString(),
        });
        ctx.logger?.warn?.(`cpa: ${label} was not submitted: ${mediaFailureText(error, "video")}`);
        return;
      }
      const job = mediaJobStore.put({
        id: requestId,
        state: "submitted",
        accountId,
        modelId,
        ref,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(commandId === undefined ? {} : { commandId }),
        cwd,
        outputDir,
        prompt,
        seconds,
        submittedAt: new Date().toISOString(),
      });
      recordRun(sessionId, commandId, { videoId: requestId });
      ctx.logger?.info?.(`cpa: ${label} submitted ${requestId} (${modelId}, ${seconds} s)`);
      await followVideoJob(job, abort);
    });
  };
  /** Resume every stored job that is still running (after a reload or restart). */
  const resumeVideoJobs = () => {
    let jobs;
    try {
      jobs = mediaJobStore.list().filter((job) => job.state === "submitted");
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not read media-jobs.json: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const job of jobs) {
      const key = job.commandId ?? `video-${job.id}`;
      if (mediaJobs.has(key)) continue;
      void trackVideoJob(key, job.sessionId, (abort) => followVideoJob(job, abort));
    }
  };

  /** Grok's 1.5 video family takes more references and pinned first / last frames. */
  const isVideo15 = (modelId) => /(^|\/)grok-imagine-video-1\.5/i.test(String(modelId ?? ""));

  /**
   * How attached images are used: none = text only; one = first frame
   * (`--ref`: a reference, `--last`: the last frame); two = references
   * (`--first-last` / `--last`: first and last frame); more = references.
   * @throws MediaError `frames-need-images` / `too-many-references` / `needs-video-15`.
   */
  const videoMode = (count, frames, modelId) => {
    if (count === 0) {
      if (frames !== undefined) throw new MediaError("frames-need-images");
      return "text";
    }
    let mode;
    if (count === 1) mode = frames === "reference" ? "reference" : frames === "last" ? "last-frame" : frames === "first-last" ? undefined : "first-frame";
    else if (count === 2) mode = frames === "first-last" || frames === "last" ? "first-last" : "reference";
    else mode = frames === undefined || frames === "reference" ? "reference" : undefined;
    if (mode === undefined) throw new MediaError(count === 1 ? "frames-need-images" : "too-many-references", count === 1 ? "2" : "2");
    const maxRefs = isVideo15(modelId) ? 14 : 7;
    if (mode === "reference" && count > maxRefs) throw new MediaError("too-many-references", String(maxRefs));
    if ((mode === "first-last" || mode === "last-frame") && !isVideo15(modelId)) throw new MediaError("needs-video-15");
    return mode;
  };

  /**
   * `/cpa-video`: submit a video — text only, from a first frame, from
   * reference images, or between pinned first / last frames — and return at
   * once; the chat row follows the background job.
   */
  const runVideoCommand = async ({ agent, rawInput, attachments = [], signal, commandId, literal = false, pickSession, gate }) => {
    try {
      const parsed = parseVideoCommand(rawInput, { literal });
      const blocks = Array.isArray(attachments) ? attachments : [];
      if (blocks.some((block) => block?.type !== "image")) throw new MediaError("unsupported-attachment");
      if (blocks.length > 14) throw new MediaError("too-many-references", "14");
      const { settings, options, accounts } = await mediaChoicesFor("video");
      const sessionId = validSessionId(agent?.id);
      const pickId = validSessionId(pickSession) ?? sessionId;
      const entry = pickId === undefined ? {} : mediaSessions.get(pickId);
      let option;
      try {
        ({ option } = chooseMediaModel({ options: options.video, requested: parsed.model, sessionRef: entry.video, lastRef: settings.lastSelection.video }));
      } catch (error) {
        if (error instanceof MediaError && error.code === "no-media-model") throw new MediaError("no-media-model", mediaAccountsSummary(accounts, "video"));
        throw error;
      }
      const mode = videoMode(blocks.length, parsed.frames, option.modelId);
      const workingDirectory = ctx.get?.("workingDirectory");
      const cwd = agent !== undefined && workingDirectory !== undefined ? await workingDirectory.ensure(agent, signal) : undefined;
      if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new MediaError("workspace-not-local");
      const images = [];
      if (blocks.length > 0) {
        const store = ctx.get?.("attachments");
        if (store === undefined) throw new MediaError("unsupported-attachment");
        // The generation route reads about 1 MiB of body (measured), so all images share that.
        const each = Math.min(FIRST_FRAME_MAX_BYTES, videoImageBudget(parsed.prompt, blocks.length));
        for (const block of blocks) images.push(await readReference(store, block, each, signal));
      }
      const framesFor = (m) =>
        m === "first-frame" ? { image: images[0] }
        : m === "last-frame" ? { lastFrame: images[0] }
        : m === "first-last" ? { image: images[0], lastFrame: images[1] }
        : m === "reference" ? { references: images }
        : {};
      const endpoint = await controller.mediaEndpoint(option.accountId);
      const args = { ...parsed, seconds: parsed.seconds ?? settings.defaultVideoSeconds, resolution: parsed.resolution ?? settings.defaultVideoResolution };
      const id = validCommandId(commandId);
      if (gate !== undefined) {
        await gate({ kind: "video", mode, option, prompt: args.prompt, seconds: args.seconds, resolution: args.resolution, aspect: args.aspect, references: images.length, cwd, outputDir: settings.outputDir });
      }
      recordRun(sessionId, id, {
        kind: "video",
        status: "running",
        mode,
        model: option.ref,
        modelName: option.name || option.modelId,
        accountName: option.accountName,
        prompt: args.prompt,
        ...(args.aspect === undefined ? {} : { aspect: args.aspect }),
        seconds: args.seconds,
        resolution: args.resolution,
        count: 1,
        references: images.length,
        files: 0,
        startedAt: new Date().toISOString(),
      });
      void startVideoJob({
        sessionId,
        commandId: id,
        accountId: option.accountId,
        modelId: option.modelId,
        ref: option.ref,
        prompt: args.prompt,
        seconds: args.seconds,
        cwd,
        outputDir: settings.outputDir,
        label: "/cpa-video",
        submit: async (jobSignal) => {
          // The session's chat model reads what the rules did not (explicit options and recognized words win).
          if (id !== undefined && !literal) videoLive.set(id, { phase: "interpreting" });
          const fixed = ["seconds", "resolution", "aspect", "frames"].filter((k) => parsed[k] !== undefined);
          const result = literal ? undefined : await interpretParams({ agent, command: "video", text: parsed.prompt, images: images.length, fixed, signal: jobSignal });
          let final = args;
          let finalMode = mode;
          if (result !== undefined) {
            final = { ...args, ...result.values, prompt: result.prompt };
            if (result.values.frames !== undefined) finalMode = videoMode(images.length, result.values.frames, option.modelId);
            recordRun(sessionId, id, {
              mode: finalMode,
              prompt: final.prompt,
              ...(final.aspect === undefined ? {} : { aspect: final.aspect }),
              seconds: final.seconds,
              resolution: final.resolution,
              ...interpretedRecord(result, parsed.prompt),
            });
          }
          if (id !== undefined) videoLive.set(id, { phase: "submitting" });
          const submitted = await submitVideo({
            rootURL: endpoint.rootURL,
            apiKey: endpoint.apiKey,
            model: option.modelId,
            prompt: final.prompt,
            seconds: final.seconds,
            ...(final.aspect === undefined ? {} : { aspect: final.aspect }),
            resolution: final.resolution,
            ...framesFor(finalMode),
            signal: jobSignal,
          });
          return { ...submitted, prompt: final.prompt, seconds: final.seconds };
        },
      });
      return {
        kind: "success",
        text: `Submitting a ${args.seconds} s ${args.resolution} video (${mode}) to ${option.modelId} (${option.accountName}); a submitted video cannot be cancelled. Files go to ${outputDirectory(cwd, settings.outputDir)}`,
      };
    } catch (error) {
      if (signal?.aborted || error?.gateError === true) throw error;
      return { kind: "error", text: `/cpa-video: ${mediaFailureText(error, "video")}` };
    }
  };

  // `${accountId}/${route}` the upstream answered 405 for in this activation:
  // asked again only after a reload (CPA pauses the credential after a 405).
  const unsupportedRoutes = new Set();
  const editRoute = (mode) => (mode === "extend" ? "extensions" : "edits");

  /** The newest existing video file the session recorded (for one command, or any). */
  const sessionVideoFile = (sessionId, commandId) => {
    if (sessionId === undefined) return undefined;
    return mediaSessions.get(sessionId).recent.find((r) => r.kind === "video" && (commandId === undefined || r.commandId === commandId) && existsSync(r.file));
  };
  /** The account a recorded run used (`accountId/modelId`), if it still exists. */
  const runAccountId = (sessionId, commandId, accounts) => {
    if (sessionId === undefined || commandId === undefined) return undefined;
    const run = mediaSessions.get(sessionId).runs.find((r) => r.commandId === commandId);
    const id = typeof run?.model === "string" ? run.model.split("/", 1)[0] : undefined;
    return accounts.some((a) => a.id === id) ? id : undefined;
  };
  const checkVideoBytes = (data) => {
    if (!isMp4(data)) throw new MediaError("video-not-mp4");
    return mp4Duration(data);
  };
  const tooLarge = (bytes) => new MediaError("source-too-large", (bytes / 1024 / 1024).toFixed(1));
  /** A local MP4 read whole (at most {@link VIDEO_UPLOAD_MAX_BYTES}) for an inline upload. */
  const readLocalVideo = (path, name = basename(path)) => {
    let info;
    try {
      info = statSync(path);
    } catch {
      info = undefined;
    }
    if (info === undefined || !info.isFile()) throw new MediaError("video-not-found", name);
    if (info.size > VIDEO_UPLOAD_MAX_BYTES) throw tooLarge(info.size);
    const data = new Uint8Array(readFileSync(path));
    return { data, seconds: checkVideoBytes(data), name };
  };
  /** An MP4 attached to the command (a DSH file attachment `{ attachmentId, name, bytes }`). */
  const readAttachedVideo = async (store, ref, signal) => {
    const name = basename(String(ref?.name ?? "video.mp4"));
    if (Number(ref?.bytes) > VIDEO_UPLOAD_MAX_BYTES) throw tooLarge(Number(ref.bytes));
    let hostPath;
    try {
      hostPath = store.fileHostPath?.(ref);
    } catch {
      hostPath = undefined;
    }
    if (typeof hostPath === "string" && existsSync(hostPath)) return readLocalVideo(hostPath, name);
    if (typeof store.readFileStream !== "function") throw new MediaError("unsupported-attachment", "edit");
    const chunks = [];
    let size = 0;
    for await (const chunk of store.readFileStream(ref, signal)) {
      size += chunk.byteLength;
      if (size > VIDEO_UPLOAD_MAX_BYTES) throw tooLarge(size);
      chunks.push(chunk);
    }
    const data = new Uint8Array(Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
    return { data, seconds: checkVideoBytes(data), name };
  };

  /**
   * `/cpa-video-edit` and `/cpa-video-extend`: change or continue any MP4.
   * Sources: an attached MP4, `--video <path>`, `--url <public URL>`,
   * `--from <command id>`, or by default the session's newest video. A video
   * this plugin made goes by xAI's own short-lived link while it is
   * remembered (about an hour, this activation), otherwise its file is sent
   * inline; local files go inline as a base64 data URI (CPA has no file
   * upload route; the edit routes read bodies of 20 MiB, measured), a URL is
   * downloaded by xAI itself.
   */
  const runVideoEditCommand = (mode) => async ({ agent, rawInput, attachments = [], signal, commandId, literal = false, pickSession, gate }) => {
    const name = mode === "extend" ? "/cpa-video-extend" : "/cpa-video-edit";
    try {
      const parsed = parseVideoEditCommand(rawInput, mode, { literal });
      const blocks = Array.isArray(attachments) ? attachments : [];
      if (blocks.some((block) => block?.type !== "file")) throw new MediaError("unsupported-attachment", "edit");
      const named = [parsed.from, parsed.video, parsed.url].filter((v) => v !== undefined).length;
      if (blocks.length > 1 || (blocks.length === 1 && named > 0)) throw new MediaError("one-video-source");
      const sessionId = validSessionId(agent?.id);
      const workingDirectory = ctx.get?.("workingDirectory");
      const cwd = agent !== undefined && workingDirectory !== undefined ? await workingDirectory.ensure(agent, signal) : undefined;
      if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new MediaError("workspace-not-local");
      const { settings, options, accounts } = await mediaChoicesFor("video");

      // source: { url? | data?, seconds?, accountId?, commandId?, name? }
      let source;
      const linkOf = (id) => {
        const link = usableSource(id);
        return link !== undefined && link.sessionId === sessionId ? link : undefined;
      };
      const fromLink = (link) => ({ url: link.url, seconds: link.seconds, accountId: link.accountId, commandId: link.commandId });
      const fromFile = (record) => ({ ...readLocalVideo(record.file), commandId: record.commandId, accountId: runAccountId(sessionId, record.commandId, accounts) });
      if (blocks.length === 1) {
        const store = ctx.get?.("attachments");
        if (store === undefined) throw new MediaError("unsupported-attachment", "edit");
        source = await readAttachedVideo(store, blocks[0].attachment, signal);
      } else if (parsed.video !== undefined) {
        source = readLocalVideo(isAbsolute(parsed.video) ? parsed.video : join(cwd, parsed.video));
      } else if (parsed.url !== undefined) {
        source = { url: parsed.url, name: new URL(parsed.url).hostname };
      } else if (parsed.from !== undefined) {
        const link = linkOf(parsed.from);
        const record = link === undefined ? sessionVideoFile(sessionId, parsed.from) : undefined;
        if (link !== undefined) source = fromLink(link);
        else if (record !== undefined) source = fromFile(record);
        else throw new MediaError(videoSources.has(parsed.from) ? "video-source-expired" : "no-video-source");
      } else {
        const record = sessionVideoFile(sessionId);
        const link = record !== undefined ? linkOf(record.commandId) : [...videoSources.values()].reverse().map((s) => linkOf(s.commandId)).find(Boolean);
        if (link !== undefined) source = fromLink(link);
        else if (record !== undefined) source = fromFile(record);
        else throw new MediaError("no-video-source");
      }
      if (source.seconds !== undefined) {
        if (mode === "edit" && source.seconds > EDIT_SOURCE_MAX_SECONDS) throw new MediaError("edit-source-too-long", String(source.seconds));
        if (mode === "extend" && (source.seconds < EXTEND_SOURCE_SECONDS.min || source.seconds > EXTEND_SOURCE_SECONDS.max)) {
          throw new MediaError("extend-source-length", String(source.seconds));
        }
      }

      // The account: the source video's own, unless -m names a model; else the session's video model.
      let accountId = parsed.model === undefined ? source.accountId : undefined;
      if (accountId === undefined) {
        const pickId = validSessionId(pickSession) ?? sessionId;
        const entry = pickId === undefined ? {} : mediaSessions.get(pickId);
        try {
          ({ option: { accountId } } = chooseMediaModel({ options: options.video, requested: parsed.model, sessionRef: entry.video, lastRef: settings.lastSelection.video }));
        } catch (error) {
          if (error instanceof MediaError && error.code === "no-media-model") throw new MediaError("no-media-model", mediaAccountsSummary(accounts, "video"));
          throw error;
        }
      }
      const account = accounts.find((a) => a.id === accountId);
      if (account === undefined) throw new MediaError("invalid-account");
      const route = editRoute(mode);
      if (unsupportedRoutes.has(`${accountId}/${route}`)) throw new MediaError("route-unsupported", route);
      const endpoint = await controller.mediaEndpoint(accountId);
      const known = source.seconds === undefined ? undefined : Math.max(1, Math.min(15, Math.round(source.seconds)));
      const seconds = mode === "extend" ? parsed.seconds ?? 6 : known;
      const id = validCommandId(commandId);
      const accountName = account.displayName || account.id;
      if (gate !== undefined) {
        await gate({
          kind: "video",
          mode,
          option: { ref: `${accountId}/${VIDEO_EDIT_MODEL}`, modelId: VIDEO_EDIT_MODEL, accountId, accountName },
          prompt: parsed.prompt,
          // Billed as the new footage: an edit re-renders the source, an extension adds `seconds`.
          seconds: seconds ?? 6,
          sourceName: source.name ?? (source.commandId !== undefined ? source.commandId : undefined),
          references: 0,
          cwd,
          outputDir: settings.outputDir,
        });
      }
      recordRun(sessionId, id, {
        kind: "video",
        status: "running",
        mode,
        ...(source.commandId === undefined ? {} : { sourceCommandId: source.commandId }),
        ...(source.name === undefined ? {} : { sourceName: source.name }),
        sourceKind: source.data !== undefined ? "upload" : source.commandId !== undefined ? "link" : "url",
        ...(Array.isArray(parsed.ignored) ? { ignored: parsed.ignored } : {}),
        model: `${accountId}/${VIDEO_EDIT_MODEL}`,
        modelName: VIDEO_EDIT_MODEL,
        accountName,
        prompt: parsed.prompt,
        ...(seconds === undefined ? {} : { seconds }),
        count: 1,
        references: 0,
        files: 0,
        startedAt: new Date().toISOString(),
      });
      const { url: sourceUrl, data: sourceData } = source;
      void startVideoJob({
        sessionId,
        commandId: id,
        accountId,
        modelId: VIDEO_EDIT_MODEL,
        ref: `${accountId}/${VIDEO_EDIT_MODEL}`,
        prompt: parsed.prompt,
        // An extension returns the source plus the new part.
        seconds: mode === "extend" ? Math.min(15, (known ?? 0) + seconds) : seconds ?? 6,
        cwd,
        outputDir: settings.outputDir,
        label: name,
        submit: async (jobSignal) => {
          // The session's chat model reads an extension length or other wording the rules missed.
          if (id !== undefined && !literal) videoLive.set(id, { phase: "interpreting" });
          const fixed = mode === "extend" && parsed.seconds !== undefined ? ["seconds"] : [];
          const result = literal ? undefined : await interpretParams({ agent, command: mode, text: parsed.prompt, fixed, signal: jobSignal });
          let prompt = parsed.prompt;
          let added = seconds;
          if (result !== undefined) {
            prompt = result.prompt;
            if (mode === "extend" && result.values.seconds !== undefined) added = result.values.seconds;
            recordRun(sessionId, id, { prompt, ...(added === undefined ? {} : { seconds: added }), ...interpretedRecord(result, parsed.prompt) });
          }
          if (id !== undefined) videoLive.set(id, { phase: "submitting" });
          try {
            const submitted = await submitVideoEdit({
              rootURL: endpoint.rootURL,
              apiKey: endpoint.apiKey,
              mode,
              ...(sourceData !== undefined ? { sourceData } : { sourceUrl }),
              prompt,
              ...(mode === "extend" ? { seconds: added } : {}),
              signal: jobSignal,
            });
            return { ...submitted, prompt, ...(mode === "extend" ? { seconds: Math.min(15, (known ?? 0) + added) } : {}) };
          } catch (error) {
            if (error instanceof MediaError && error.code === "route-unsupported") unsupportedRoutes.add(`${accountId}/${route}`);
            throw error;
          }
        },
      });
      const skipped = Array.isArray(parsed.ignored) && parsed.ignored.length > 0
        ? ` Ignored ${parsed.ignored.join(", ")}: ${mode === "extend" ? "an extension keeps the source's resolution and ratio" : "an edit keeps the source's length, resolution and ratio"}.`
        : "";
      const how = sourceData !== undefined ? `uploading ${source.name} (${(sourceData.byteLength / 1024 / 1024).toFixed(1)} MiB)` : source.name !== undefined ? `from ${source.name}` : "from xAI's link";
      return {
        kind: "success",
        text: `${mode === "extend" ? `Extending the video by ${seconds} s` : "Editing the video"} with ${VIDEO_EDIT_MODEL} (${accountName}), ${how}; a submitted video cannot be cancelled. Files go to ${outputDirectory(cwd, settings.outputDir)}.${skipped}`,
      };
    } catch (error) {
      if (signal?.aborted || error?.gateError === true) throw error;
      return { kind: "error", text: `${name}: ${mediaFailureText(error, "video")}` };
    }
  };
  /** `/cpa-video-status`: this session's video jobs, newest first (text). */
  const runVideoStatusCommand = async ({ agent }) => {
    const sessionId = validSessionId(agent?.id);
    const jobs = mediaJobStore.list().filter((job) => job.sessionId !== undefined && job.sessionId === sessionId).slice(0, 20);
    if (jobs.length === 0) return { kind: "success", text: "No video jobs in this session." };
    const lines = jobs.map((job) => {
      const live = job.commandId === undefined ? undefined : videoLive.get(job.commandId);
      const state = job.state === "submitted" ? (live?.phase ?? "waiting") + (live?.progress === undefined ? "" : ` ${live.progress}%`) : job.state;
      const prompt = job.prompt.length > 40 ? `${job.prompt.slice(0, 40)}…` : job.prompt;
      return `${job.submittedAt.slice(0, 19).replace("T", " ")}  ${state.padEnd(14)} ${job.modelId}, ${job.seconds} s  ${prompt}  (${job.id})`;
    });
    return { kind: "success", text: lines.join("\n") };
  };

  // #endregion

  // #region Agent tool generate_media (off by default; design §5, §7, §8)
  //
  // One optional tool, registered only while the Generation tab's switch is
  // on and some enabled account offers a generation model. A call runs the
  // same admission as the slash commands (literally: no plain-language
  // parsing or interpretation), with a gate between admission and the
  // request that asks for approval and enforces the video seconds budget of
  // the root session, then waits up to 10 minutes for the background job.
  const TOOL_WAIT_MS = 10 * 60_000;
  const TOOL_IMAGE_MAX_BYTES = 32 * 1024 * 1024;
  const TOOL_PREVIEWS = 4;
  let toolsCtx;
  let toolOff;

  const gateError = (message) => Object.assign(new Error(message), { gateError: true });

  /** The top-level agent a (sub-)agent was created under: its session holds picks and the budget. */
  const rootAgentOf = (agent) => {
    const agents = ctx.get?.("agents");
    let current = agent;
    if (typeof agents?.list !== "function" || typeof agents.isOwnedBy !== "function") return current;
    for (let depth = 0; depth < 16; depth += 1) {
      const owner = agents.list().find((candidate) => candidate !== current && agents.isOwnedBy(current.id, candidate));
      if (owner === undefined) break;
      current = owner;
    }
    return current;
  };

  // Legacy fallback only when the native userQuestions service is absent. Cost
  // confirmation is independent of DSH's execution-approval permission policy.
  // runId → { sessionId, kind, en, zh, expiresAt, settle(outcome) }, in memory only.
  const pendingConfirms = new Map();
  const pendingNativeConfirms = new Set();
  const CONFIRM_WAIT_MS = 10 * 60_000;
  const CONFIRM_ALLOW = "Allow / 允许";
  const CONFIRM_DECLINE = "Decline / 拒绝";
  const cancelConfirms = () => {
    for (const cancel of [...pendingNativeConfirms]) cancel();
    for (const waiting of [...pendingConfirms.values()]) waiting.settle("cancelled");
  };

  /** Compatibility composer/row consent without userQuestions (`allowed` / `rejected` / `timeout` / `cancelled`). */
  const askInRow = (exec, runId, sessionId, text, kind) =>
    new Promise((resolve) => {
      if (exec.signal?.aborted || toolOff === undefined || toolsCtx === undefined) return resolve("cancelled");
      const timer = setTimeout(() => settle("timeout"), CONFIRM_WAIT_MS);
      timer.unref?.();
      const onAbort = () => settle("cancelled");
      const settle = (outcome) => {
        if (pendingConfirms.get(runId)?.settle !== settle) return;
        pendingConfirms.delete(runId);
        clearTimeout(timer);
        exec.signal?.removeEventListener("abort", onAbort);
        resolve(outcome);
      };
      exec.signal?.addEventListener("abort", onAbort, { once: true });
      pendingConfirms.set(runId, { sessionId, kind, en: text.en, zh: text.zh, expiresAt: new Date(Date.now() + CONFIRM_WAIT_MS).toISOString(), settle });
    });

  /** Anonymous questions block in the native composer, not in a folded tool call. */
  const askNativeConfirm = (questions, exec, text, kind, runId) =>
    new Promise((resolve) => {
      if (exec.signal?.aborted || toolOff === undefined || toolsCtx === undefined) return resolve("cancelled");
      const controller = new AbortController();
      const questionId = `media-confirm-${runId}`;
      let settled = false;
      const onAbort = () => finish("cancelled");
      const cancel = () => finish("cancelled");
      const timer = setTimeout(() => finish("timeout"), CONFIRM_WAIT_MS);
      timer.unref?.();
      const finish = (outcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        exec.signal?.removeEventListener("abort", onAbort);
        pendingNativeConfirms.delete(cancel);
        // Remove the composer's pending request on every settlement, even if
        // an answerer ignores cancellation or rejects after the local deadline.
        controller.abort();
        resolve(outcome);
      };
      pendingNativeConfirms.add(cancel);
      exec.signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve().then(() => {
        if (settled) return;
        return questions.ask({
          agent: rootAgentOf(exec.agent),
          signal: controller.signal,
          questions: [{
            id: questionId,
            header: kind === "video" ? "Video confirmation / 视频确认" : "Image confirmation / 图像确认",
            question: `${text.zh}\n\n${text.en}`,
            options: [{ label: CONFIRM_ALLOW }, { label: CONFIRM_DECLINE }],
            multiSelect: false,
          }],
          // Do not supply wait/callId: anonymous requests publish the native
          // blocking PendingQuestion instead of a continued tool-call card.
        });
      }).then((answer) => {
        const item = Array.isArray(answer?.answers) && answer.answers.length === 1 ? answer.answers[0] : undefined;
        const allowed = item?.id === questionId && item.custom === undefined &&
          Array.isArray(item.selected) && item.selected.length === 1 && item.selected[0] === CONFIRM_ALLOW;
        finish(allowed ? "allowed" : "rejected");
      }, () => finish("unavailable"));
    });

  /** Cost consent is not an execution approval and never falls back after a native error. */
  const askApproval = async (exec, text, kind, runId, sessionId) => {
    const questions = ctx.get?.("userQuestions");
    const what = kind === "video" ? "this video" : "these images";
    let answer;
    if (questions === undefined || questions === null) {
      const ownerId = validSessionId(rootAgentOf(exec.agent)?.id) ?? sessionId;
      if (ownerId === undefined) throw gateError(`${what} needs the user's confirmation, but this call has no session to ask in`);
      answer = await askInRow(exec, runId, ownerId, text, kind);
    } else {
      answer = await askNativeConfirm(questions, exec, text, kind, runId);
    }
    if (answer === "allowed") return;
    if (answer === "rejected") throw gateError(`the user declined ${what}; do not retry unless the user asks`);
    if (answer === "timeout") throw gateError(`the user did not answer the confirmation for ${what} within 10 minutes; ask the user before trying again`);
    if (answer === "cancelled") throw gateError(`the confirmation for ${what} was cancelled`);
    throw gateError(`the confirmation for ${what} could not be shown; ask the user before trying again`);
  };

  /** Attached-image blocks for local image paths (saved in DSH's attachment store, like composer images). */
  const toolImageBlocks = async (paths, cwd, signal) => {
    if (paths === undefined) return [];
    const store = ctx.get?.("attachments");
    if (typeof store?.saveImage !== "function") throw new Error("images cannot be read: DSH's attachment store is not available");
    const blocks = [];
    for (const raw of paths) {
      const path = isAbsolute(raw) ? raw : join(cwd, raw);
      let info;
      try {
        info = statSync(path);
      } catch {
        info = undefined;
      }
      if (info === undefined || !info.isFile()) throw new Error(`image not found: ${raw}`);
      if (info.size > TOOL_IMAGE_MAX_BYTES) throw new Error(`image is larger than 32 MiB: ${raw}`);
      const data = new Uint8Array(readFileSync(path));
      const mediaType = sniffImageType(data);
      if (mediaType === undefined) throw new Error(`not a PNG, JPEG, WebP or GIF image: ${raw}`);
      signal?.throwIfAborted();
      const ref = await store.saveImage({ data, mediaType, name: basename(path) });
      blocks.push({ type: "image", attachment: ref });
    }
    return blocks;
  };

  /** Whether the calling route declares image input (as DSH's own read_image checks). */
  const routeSeesImages = async (agent, signal) => {
    const target = sessionChatTarget(agent);
    const llm = ctx.get?.("llm");
    if (target === undefined || typeof llm?.resolveModelInfo !== "function") return false;
    try {
      const info = await llm.resolveModelInfo(target.provider, target.model, signal);
      return Array.isArray(info?.inputModalities) && info.inputModalities.includes("image");
    } catch {
      return false;
    }
  };

  /** Smaller copies of generated images for the model (DSH's attachment store normalizes them). */
  const imagePreviews = async (paths, agent, signal) => {
    const store = ctx.get?.("attachments");
    if (paths.length === 0 || typeof store?.saveImage !== "function" || !(await routeSeesImages(agent, signal))) return [];
    const previews = [];
    for (const path of paths.slice(0, TOOL_PREVIEWS)) {
      try {
        const data = new Uint8Array(readFileSync(path));
        const mediaType = sniffImageType(data);
        if (mediaType === undefined) continue;
        const ref = await store.saveImage({ data, mediaType, name: basename(path) });
        previews.push({
          attachmentId: String(ref.attachmentId),
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          ...(ref.name === undefined ? {} : { name: ref.name }),
          ...(ref.originalDimensions === undefined ? {} : { originalDimensions: { width: ref.originalDimensions.width, height: ref.originalDimensions.height } }),
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        ctx.logger?.warn?.(`cpa: could not attach a preview of ${basename(path)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return previews;
  };

  /** Wait for a job of this activation: "settled", "timeout" or "aborted" (the job keeps running). */
  const waitForJob = (key, signal, ms) => {
    const promise = jobPromises.get(key);
    if (promise === undefined) return Promise.resolve("settled");
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish("timeout"), ms);
      timer.unref?.();
      const onAbort = () => finish("aborted");
      const finish = (how) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(how);
      };
      if (signal?.aborted) return finish("aborted");
      signal?.addEventListener("abort", onAbort, { once: true });
      promise.then(() => finish("settled"), () => finish("settled"));
    });
  };

  // Not submitted (CPA refused it at once): the seconds go back to the budget.
  const NOT_SUBMITTED = new Set(["upstream-error", "request-too-large", "route-unsupported", "no-endpoint", "invalid-account"]);

  const executeGenerateMedia = async (args, exec) => {
    const t = parseToolArgs(args);
    if (exec.agent === undefined) throw new Error("generate_media needs an agent session");
    const agent = exec.agent;
    const sessionId = validSessionId(agent.id);
    const root = rootAgentOf(agent);
    const rootId = validSessionId(root?.id) ?? sessionId;
    const runId = toolRunId(exec.callId) ?? `tool-${randomUUID()}`;
    const workingDirectory = ctx.get?.("workingDirectory");
    const cwd = workingDirectory === undefined ? undefined : await workingDirectory.ensure(agent, exec.signal);
    if (typeof cwd !== "string" || !isAbsolute(cwd) || !existsSync(cwd)) throw new Error(mediaFailureText(new MediaError("workspace-not-local"), t.kind));
    const blocks = await toolImageBlocks(t.images, cwd, exec.signal);
    const line = toolCommandLine(t);
    const handler = t.kind === "image" ? runImageCommand : t.mode === "generate" ? runVideoCommand : runVideoEditCommand(t.mode);
    // The client groups native tool events at turn level; never impersonate
    // a user slash command. Retain the deprecated output flag for old clients.
    const commandRow = false;
    let charged = 0;
    let planned;
    const gate = async (plan) => {
      planned = plan;
      const { settings } = mediaChoices();
      const policy = agentPolicy(settings, rootId === undefined ? {} : mediaSessions.get(rootId));
      if (plan.kind === "video") {
        if (policy.videoConfirm === "auto" && policy.limit !== undefined && policy.used + plan.seconds > policy.limit) {
          throw gateError(`this session's agent video budget is ${policy.limit} s and ${policy.used} s are used; this video needs ${plan.seconds} s. Ask the user to raise the limit (the media button next to the composer) or to confirm videos one by one`);
        }
        if (policy.videoConfirm === "ask") await askApproval(exec, approvalText(plan, policy), "video", runId, sessionId);
        if (rootId !== undefined) {
          mediaSessions.update(rootId, (entry) => chargeSeconds(entry, agentPolicy(settings, entry), plan.seconds));
          charged = plan.seconds;
        }
      } else if (policy.imageConfirm === "ask") {
        await askApproval(exec, approvalText(plan, policy), "image", runId, sessionId);
      }
    };
    const refund = () => {
      if (charged === 0 || rootId === undefined) return;
      const { settings } = mediaChoices();
      mediaSessions.update(rootId, (entry) => chargeSeconds(entry, agentPolicy(settings, entry), -charged));
      charged = 0;
    };
    const outcome = await handler({ agent, rawInput: line, attachments: blocks, signal: exec.signal, commandId: runId, literal: true, pickSession: rootId, gate });
    if (outcome?.kind !== "success") {
      refund();
      throw new Error(String(outcome?.text ?? "the request was refused").replace(/^\/cpa-[a-z-]+:\s*/, ""));
    }
    const waited = await waitForJob(runId, exec.signal, TOOL_WAIT_MS);
    const entry = sessionId === undefined ? { runs: [], recent: [] } : mediaSessions.get(sessionId);
    const run = entry.runs.find((r) => r.commandId === runId);
    const files = entry.recent.filter((r) => r.commandId === runId && existsSync(r.file)).map((r) => r.file);
    const option = planned?.option;
    const base = {
      kind: t.kind,
      ...(t.kind === "video" ? { mode: t.mode } : {}),
      model: option?.modelId ?? run?.modelName ?? "",
      ...(option?.accountName ? { account: option.accountName } : {}),
      run: runId,
      commandRow,
      files,
      folder: outputDirectory(cwd, planned?.outputDir ?? mediaChoices().settings.outputDir),
      ...(Number.isInteger(run?.seconds) ? { seconds: run.seconds } : {}),
      ...(typeof run?.resolution === "string" ? { resolution: run.resolution } : {}),
      ...(typeof run?.aspect === "string" ? { aspect: run.aspect } : {}),
    };
    if (waited !== "settled" || run?.status === "running") {
      return {
        status: "running",
        ...base,
        note:
          waited === "aborted"
            ? "Stopped waiting. The generation keeps running in the background (and is billed); the file will be saved in the folder above and shown in this call's row."
            : "Still generating after 10 minutes. It keeps running in the background; the file will be saved in the folder above and shown in this call's row.",
      };
    }
    if (run === undefined || run.status === "error") {
      if (run === undefined || (run.videoId === undefined && NOT_SUBMITTED.has(run.errorCode))) refund();
      throw new Error(run?.error ?? "the generation failed");
    }
    const previews = t.kind === "image" ? await imagePreviews(files, agent, exec.signal) : [];
    return {
      status: "done",
      ...base,
      ...(typeof run.revisedPrompt === "string" ? { revisedPrompt: run.revisedPrompt } : {}),
      ...(previews.length > 0 ? { previews } : {}),
    };
  };

  /** The model-facing content: a short summary, then any image previews. */
  const renderGenerateMedia = (_args, value) => {
    const lines = [
      `${value.status === "done" ? "Saved" : "Running"}: ${value.kind}${value.mode && value.mode !== "generate" ? ` (${value.mode})` : ""} with ${value.model}${value.account ? ` (${value.account})` : ""}${value.seconds ? `, ${value.seconds} s` : ""}${value.resolution ? `, ${value.resolution}` : ""}${value.aspect ? `, ${value.aspect}` : ""}`,
      ...value.files.map((file) => file),
      ...(value.files.length === 0 ? [`Folder: ${value.folder}`] : []),
      ...(value.revisedPrompt ? [`Revised prompt: ${value.revisedPrompt}`] : []),
      ...(value.note ? [value.note] : []),
    ];
    return [
      { type: "text", text: lines.join("\n") },
      ...(value.previews ?? []).map((p) => ({
        type: "image",
        attachment: {
          attachmentId: p.attachmentId,
          mediaType: p.mediaType,
          bytes: p.bytes,
          width: p.width,
          height: p.height,
          ...(p.name === undefined ? {} : { name: p.name }),
          ...(p.originalDimensions === undefined ? {} : { originalDimensions: { ...p.originalDimensions } }),
        },
      })),
    ];
  };

  const generateMediaTool = {
    name: GENERATE_MEDIA,
    description: GENERATE_MEDIA_TOOL.description,
    parameters: GENERATE_MEDIA_TOOL.parameters,
    output: {
      schema: GENERATE_MEDIA_OUTPUT,
      render: renderGenerateMedia,
      presentationMeta: (_args, value) => ({ run: value.run, status: value.status, commandRow: value.commandRow === true }),
    },
    execute: executeGenerateMedia,
  };

  /** Register or unregister the tool to match the switch and the offered models. */
  const syncAgentTool = () => {
    let wanted = false;
    try {
      const { settings, options } = mediaChoices();
      wanted = settings.agentTool === true && options.image.length + options.video.length > 0;
    } catch {
      wanted = false;
    }
    if (wanted && toolOff === undefined && toolsCtx !== undefined) {
      try {
        const off = toolsCtx.tools.register(generateMediaTool);
        toolOff = typeof off === "function" ? off : () => {};
        ctx.logger?.info?.("cpa: generate_media tool registered");
      } catch (error) {
        ctx.logger?.warn?.(`cpa: could not register generate_media: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (!wanted && toolOff !== undefined) {
      cancelConfirms();
      const off = toolOff;
      toolOff = undefined;
      try {
        off();
      } catch {
        // already gone with its scope
      }
      ctx.logger?.info?.("cpa: generate_media tool unregistered");
    }
  };
  // #endregion

  reschedule();
  resumeVideoJobs();
  startupTimeout = outsideHmrTransaction(ctx, () =>
    setTimeout(() => {
      startupTimeout = undefined;
      void controller.refreshAll().finally(() => syncAgentTool());
    }, 600)
  );

  ctx.on("credentials/reference-updated", (ref) => {
    for (const id of controller.accountsUsingKey(ref)) {
      void controller.refreshAccount(id);
    }
  });

  ctx.effect(
    () => () => {
      if (timer !== undefined) clearInterval(timer);
      if (startupTimeout !== undefined) clearTimeout(startupTimeout);
      controller.dispose();
    },
    "cpa: refresh loop"
  );

  // Register slash commands (/cpa-status, /cpa-refresh)
  ctx.inject(["commands"], (cmdCtx) => {
    cmdCtx.effect(() => {
      const offStatus = cmdCtx.commands.register({
        name: "cpa-status",
        description: "Show CLIProxyAPI discovery and model synchronization status of every account.",
        handler: async () => {
          const payload = await controller.statusPayload();
          const quotaText = renderQuotaText(await quota.snapshot());
          return { kind: "success", text: [renderStatusText(payload), quotaText].filter(Boolean).join("\n\n") };
        },
      });
      const offRefresh = cmdCtx.commands.register({
        name: "cpa-refresh",
        description: "Probe every CLIProxyAPI account now and refresh the synchronized DSH model catalog.",
        handler: async () => {
          const payload = await controller.refresh(undefined);
          syncAgentTool();
          const failed = payload.accounts.some((a) => a.status.state === "error");
          return { kind: failed ? "error" : "success", text: renderStatusText(payload) };
        },
      });
      const offVideo = cmdCtx.commands.register({
        name: "cpa-video",
        description: "Generate a video with a CLIProxyAPI video model: text only, one image as the first frame, reference images (--ref, or 2+ images), or pinned first / last frames (--first-last, --last). A submitted video cannot be cancelled.",
        input: { hint: "[-m <model>] [--aspect 16:9] [-s 1-15] [-r 480p|720p] [--ref|--first-last|--last] <prompt>", attachments: true },
        handler: runVideoCommand,
      });
      const offVideoEdit = cmdCtx.commands.register({
        name: "cpa-video-edit",
        description: "Edit any MP4 of up to 8.7 s with grok-imagine-video: attach it, or pass --video <path>, --url <public URL> or --from <command id> (default: this session's newest video). A submitted video cannot be cancelled.",
        input: { hint: "[--video <path> | --url <URL> | --from <command id>] [-m <model>] <what to change>", attachments: true },
        handler: runVideoEditCommand("edit"),
      });
      const offVideoExtend = cmdCtx.commands.register({
        name: "cpa-video-extend",
        description: "Continue any MP4 of 2-15 s by 2-10 seconds: attach it, or pass --video <path>, --url <public URL> or --from <command id> (default: this session's newest video). A submitted video cannot be cancelled.",
        input: { hint: "[--video <path> | --url <URL> | --from <command id>] [-m <model>] [-s 2-10] <what happens next>", attachments: true },
        handler: runVideoEditCommand("extend"),
      });
      const offVideoStatus = cmdCtx.commands.register({
        name: "cpa-video-status",
        description: "List this session's CLIProxyAPI video jobs and their state.",
        handler: runVideoStatusCommand,
      });
      const offImage = cmdCtx.commands.register({
        name: "cpa-image",
        description: "Generate an image with a CLIProxyAPI image model; attach images to edit them. Files go to the session's working directory.",
        input: { hint: "[-m <model>] [--aspect 16:9] [-n 1-4] <prompt>", attachments: true },
        handler: runImageCommand,
      });
      return () => {
        offStatus?.();
        offRefresh?.();
        offImage?.();
        offVideo?.();
        offVideoStatus?.();
        offVideoEdit?.();
        offVideoExtend?.();
      };
    }, "cpa: commands");
  });

  // The optional agent tool (registered only while switched on; see syncAgentTool).
  ctx.inject(["tools"], (scope) => {
    scope.effect(() => {
      toolsCtx = scope;
      syncAgentTool();
      return () => {
        cancelConfirms();
        const off = toolOff;
        toolOff = undefined;
        toolsCtx = undefined;
        try {
          off?.();
        } catch {
          // disposed with its scope
        }
      };
    }, "cpa: agent tool");
  });

  // Register HTTP API Routes on webServer for the Web UI
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const route = (path, method, run, errorStatus = 500) =>
        webCtx.webServer.register({
          kind: "exact",
          path,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, method)) return;
            try {
              const body = method === "POST" ? (await readJsonBody(req)) ?? {} : {};
              const result = await run(body, req);
              // Account, model and Generation-tab changes may switch the agent tool on or off.
              if (method === "POST") syncAgentTool();
              sendJson(res, 200, result);
            } catch (error) {
              sendJson(res, errorStatus, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      const updateRoute = (path, method, run) => webCtx.webServer.register({
        kind: "exact", path,
        handler: async (req, res) => {
          if (!admitUpdateRequest(ctx, req, res, method)) return;
          try {
            const body = method === "POST" ? await readJsonBody(req, 8192) : {};
            if (!plainObject(body)) throw new UpdateError("invalid-settings");
            if (path === ROUTES.updateDownload && (Object.keys(body).some((key) => key !== "version") || typeof body.version !== "string")) {
              throw new UpdateError("stale-version");
            }
            if (path === ROUTES.updateCheck && Object.keys(body).length) throw new UpdateError("invalid-settings");
            const update = await run(body);
            sendJson(res, 200, { ok: true, update });
          } catch (error) {
            const errorCode = error instanceof UpdateError ? error.code : "invalid-settings";
            sendJson(res, errorCode === "busy" ? 409 : 400, { ok: false, errorCode, error: errorCode, update: updater.status() });
          }
        },
      });
      const disposers = [
        updateRoute(ROUTES.updateStatus, "GET", () => updater.status()),
        updateRoute(ROUTES.updateCheck, "POST", () => updater.check()),
        updateRoute(ROUTES.updateSave, "POST", (body) => updater.save(body)),
        updateRoute(ROUTES.updateDownload, "POST", (body) => updater.download(body.version)),
        route(ROUTES.status, "GET", () => controller.statusPayload()),
        route(ROUTES.refresh, "POST", (body) => controller.refresh(body.accountId)),
        route(
          ROUTES.save,
          "POST",
          (body) => {
            const patch = accountPatchFromInput(body);
            const hasAccountFields = Object.keys(patch).some((k) => !GLOBAL_FIELDS.includes(k));
            return body.accountId === undefined && !hasAccountFields
              ? controller.updateGlobals(patch)
              : controller.updateAccount(body.accountId, patch);
          },
          400
        ),
        route(ROUTES.addAccount, "POST", (body) => controller.addAccount(accountPatchFromInput(body)), 400),
        route(ROUTES.removeAccount, "POST", (body) => controller.removeAccount(body.accountId), 400),
        route(ROUTES.testAccount, "POST", (body) => controller.testConnection(body.accountId, { baseURL: body.baseURL, apiKey: body.apiKey }), 400),
        route(ROUTES.quotaStatus, "GET", async () => ({ ok: true, quota: await quota.snapshot() })),
        route(ROUTES.quotaRefresh, "POST", async (body) => ({
          ok: true,
          quota: await quota.refresh(typeof body.accountId === "string" && body.accountId !== "" ? body.accountId : undefined, { wait: false }),
        })),
        route(
          ROUTES.quotaSave,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") {
              throw new Error("dsh-cliproxyapi: saving a management key needs accountId");
            }
            const managementKey = typeof body.managementKey === "string" ? body.managementKey.trim() : "";
            return {
              ok: true,
              quota: await quota.saveKey(body.accountId, {
                ...(managementKey === "" ? {} : { managementKey }),
                ...(body.clear === true ? { clear: true } : {}),
              }, { wait: false }),
            };
          },
          400
        ),
        route(ROUTES.mediaStatus, "GET", async () => ({ ok: true, media: mediaStatus() })),
        route(ROUTES.mediaSave, "POST", saveMedia, 400),
        route(
          ROUTES.mediaDiagnose,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") throw new MediaError("invalid-account");
            return { ok: true, diagnostic: await controller.diagnoseMedia(body.accountId) };
          },
          400
        ),
        route(
          ROUTES.mediaSession,
          "GET",
          async (_body, req) => {
            const raw = new URL(req.url ?? "/", "http://host").searchParams.get("sessionId");
            const sessionId = raw === null || raw === "" ? undefined : validSessionId(raw);
            if (raw !== null && raw !== "" && sessionId === undefined) throw new MediaError("invalid-session");
            // Right after a start the catalogs may not be read yet; sync once
            // instead of letting the composer button wait for its next retry.
            await mediaChoicesFor("any");
            return { ok: true, session: sessionView(sessionId) };
          },
          400
        ),
        route(ROUTES.mediaSessionSave, "POST", async (body) => saveSessionPick(body), 400),
        // The user's answer to a generate_media confirmation shown in its chat row.
        route(
          ROUTES.mediaConfirm,
          "POST",
          async (body) => {
            const sessionId = validSessionId(body.sessionId);
            const commandId = validCommandId(body.commandId);
            if (sessionId === undefined || commandId === undefined || typeof body.allow !== "boolean") throw new MediaError("invalid-request");
            const waiting = pendingConfirms.get(commandId);
            if (waiting === undefined || waiting.sessionId !== sessionId) throw new MediaError("confirm-expired");
            waiting.settle(body.allow ? "allowed" : "rejected");
            return { ok: true };
          },
          400
        ),
        // One slash-command run's record and files (its chat row shows them).
        // The absolute paths let the page open or reveal a file through DSH's
        // own Session Remote (`session.openWorkspacePath`), which re-verifies
        // them on the Host.
        route(
          ROUTES.mediaCommand,
          "GET",
          async (_body, req) => {
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const commandId = validCommandId(params.get("commandId") ?? "");
            if (sessionId === undefined || commandId === undefined) throw new MediaError("invalid-request");
            const entry = mediaSessions.get(sessionId);
            const files = entry.recent
              .filter((r) => r.commandId === commandId && existsSync(r.file))
              .map((r) => ({ id: r.id, kind: r.kind, name: basename(r.file), path: r.file }));
            let run = entry.runs.find((r) => r.commandId === commandId) ?? null;
            // A run recorded as running that no job of this activation owns was
            // cut off by a reload or a restart.
            if (run?.status === "running" && !mediaJobs.has(commandId)) {
              run = { ...run, status: "error", errorCode: "interrupted", error: mediaFailureText(new MediaError("interrupted"), run.kind) };
            } else if (run?.status === "running" && videoLive.has(commandId)) {
              // A video's phase (submitting / queued / running / downloading) and CPA's progress, if it reports one.
              run = { ...run, ...videoLive.get(commandId) };
            }
            // Which file manager "show in folder" opens, to name the menu item.
            const desktop = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "finder" : "filemanager";
            // Edit / extend this video: by xAI's short-lived link while it is
            // remembered, else by sending its file inline when small enough.
            let actions;
            if (run?.kind === "video" && run.status === "done") {
              const source = usableSource(commandId);
              const video = files.find((f) => f.kind === "video");
              let size;
              try {
                size = video === undefined ? undefined : statSync(video.path).size;
              } catch {
                size = undefined;
              }
              if (source !== undefined || (size !== undefined && size <= VIDEO_UPLOAD_MAX_BYTES)) {
                const seconds = source?.seconds ?? run.seconds;
                const accountId = source?.accountId ?? String(run.model).split("/", 1)[0];
                actions = {
                  edit: seconds === undefined || seconds <= EDIT_SOURCE_MAX_SECONDS,
                  extend:
                    (seconds === undefined || (seconds >= EXTEND_SOURCE_SECONDS.min && seconds <= EXTEND_SOURCE_SECONDS.max)) &&
                    !unsupportedRoutes.has(`${accountId}/extensions`),
                  ...(source === undefined ? {} : { expiresAt: new Date(source.at + VIDEO_SOURCE_TTL_MS).toISOString() }),
                };
              }
            }
            // A generate_media call waiting for the user's confirmation in this row.
            const waiting = pendingConfirms.get(commandId);
            const confirm = waiting !== undefined && waiting.sessionId === sessionId ? { kind: waiting.kind, en: waiting.en, zh: waiting.zh, expiresAt: waiting.expiresAt } : undefined;
            return {
              ok: true,
              run,
              files,
              desktop,
              ...(files.length > 0 ? { folderPath: dirname(files[0].path) } : {}),
              ...(actions === undefined ? {} : { actions }),
              ...(confirm === undefined ? {} : { confirm }),
            };
          },
          400
        ),
        // Serves only files this plugin wrote and recorded for that session.
        webCtx.webServer.register({
          kind: "exact",
          path: ROUTES.mediaFile,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, "GET")) return;
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const record = sessionId === undefined ? undefined : mediaSessions.get(sessionId).recent.find((r) => r.id === params.get("id"));
            const type = record === undefined ? undefined : MEDIA_FILE_TYPES[extname(record.file).toLowerCase()];
            if (record === undefined || type === undefined || !existsSync(record.file)) {
              sendJson(res, 404, { ok: false, error: "not-found" });
              return;
            }
            try {
              if (!type.startsWith("video/")) {
                const bytes = readFileSync(record.file);
                res.writeHead(200, {
                  "cache-control": "no-store",
                  "content-type": type,
                  "content-length": String(bytes.byteLength),
                  "x-content-type-options": "nosniff",
                });
                res.end(bytes);
                return;
              }
              // Videos are streamed, with single byte ranges so <video> can seek.
              const size = statSync(record.file).size;
              const range = byteRange(req.headers?.range, size);
              if (range === null) {
                res.writeHead(416, { "content-range": `bytes */${size}` });
                res.end();
                return;
              }
              const [start, end] = range ?? [0, size - 1];
              res.writeHead(range === undefined ? 200 : 206, {
                "cache-control": "no-store",
                "content-type": type,
                "accept-ranges": "bytes",
                "content-length": String(size === 0 ? 0 : end - start + 1),
                ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${size}` }),
                "x-content-type-options": "nosniff",
              });
              if (size === 0) {
                res.end();
                return;
              }
              const stream = createReadStream(record.file, { start, end });
              stream.on("error", () => res.destroy?.());
              res.on?.("close", () => stream.destroy());
              stream.pipe(res);
            } catch {
              sendJson(res, 404, { ok: false, error: "not-found" });
            }
          },
        }),
      ];
      return () => {
        for (const dispose of disposers) dispose?.();
      };
    }, "cpa: webserver routes");
  });
}

export const apply = mountOnce(PACKAGE_NAME, applyImpl);

// #endregion

export { PACKAGE_NAME, name, inject, DEFAULT_ACCOUNT_ID, DEFAULT_PROVIDER, DEFAULT_DISPLAY_NAME, DEFAULT_API_KEY_ENV, STATE_VERSION, ACCOUNT_FIELDS, DEFAULT_REFRESH_INTERVAL_SECONDS, DEFAULT_PROBE_TIMEOUT_MS, LOCAL_CANDIDATES, MAX_RECOMMENDED_MODELS, PROTOCOLS, normalizeModelOverrides, resolveConfig, normalizeAccountId };

export { filterModels, modelFamily, sortModelsNewestFirst, recommendModels };

export { nativeProtocol, modelProtocol, routeKeyFor, applyModelOverride, isChatModel, buildPiAiRoutes, managedRouteKeys };

export { pickAccount, normalizeState, mergeHostConfig, accountConflicts, assertNoConflicts, newAccountDefaults, patchAccount };

export { resolveStateFilePath, loadPersistedState, savePersistedState };

export { normalizeCpaRoot, discoveryCandidates, parseCatalog, discoverCpa };

export { CpaRuntime };

export { serializeSettings, createCpaController };

export { ROUTES };

export {  };

export { renderQuotaText, renderStatusText };

export {  };
