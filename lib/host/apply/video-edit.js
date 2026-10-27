// Video edit/extend admission, local/attached sources and session video status.

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { chooseMediaModel, MediaError, outputDirectory, validCommandId, validSessionId, EDIT_SOURCE_MAX_SECONDS, EXTEND_SOURCE_SECONDS, parseVideoEditCommand, submitVideoEdit, VIDEO_EDIT_MODEL, isMp4, mp4Duration, VIDEO_UPLOAD_MAX_BYTES } from "../../media.js";
import { name } from "../config.js";

export function createVideoEdit(shared) {
  const { ctx, source, controller, mediaSessions, mediaChoicesFor, mediaAccountsSummary, interpretParams, interpretedRecord, mediaFailureText, recordRun, mediaJobStore, videoLive, videoSources, usableSource, startVideoJob } = shared;
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

  return { unsupportedRoutes, editRoute, sessionVideoFile, runAccountId, checkVideoBytes, tooLarge, readLocalVideo, readAttachedVideo, runVideoEditCommand, runVideoStatusCommand };
}
