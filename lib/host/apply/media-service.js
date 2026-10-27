// Media settings, catalog choices, session views/picks and file range helpers.

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { accountKindOverrides, applyMediaPatch, chooseMediaModel, createMediaSessionStore, MediaError, mediaModelEnabled, mediaOptions, normalizeMediaSettings, saveMediaSettings, validSessionId, agentPolicy, applySessionPolicy } from "../../media.js";

export function createMediaService(shared) {
  const { updateDirectory, mediaSettingsPath, readMedia, controller } = shared;
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
      pendingConfirmations: sessionId === undefined ? [] : [...shared.pendingConfirms.entries()]
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

  return { mediaStatus, saveMedia, mediaSessions, mediaChoices, mediaChoicesFor, mediaAccountsSummary, sessionView, saveSessionPick, MEDIA_FILE_TYPES, byteRange };
}
