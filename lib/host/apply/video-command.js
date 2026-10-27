// Video generation admission, frame modes and interpreted submission parameters.

import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { chooseMediaModel, MediaError, outputDirectory, validCommandId, validSessionId, parseVideoCommand, submitVideo, videoImageBudget } from "../../media.js";
import { name } from "../config.js";

export function createVideoCommand(shared) {
  const { ctx, controller, mediaSessions, mediaChoicesFor, mediaAccountsSummary, FIRST_FRAME_MAX_BYTES, readReference, interpretParams, interpretedRecord, mediaFailureText, recordRun, videoLive, startVideoJob } = shared;
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

  return { isVideo15, videoMode, runVideoCommand };
}
