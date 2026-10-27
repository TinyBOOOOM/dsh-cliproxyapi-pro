// Image admission and background generation, output persistence and settlement.

import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { chooseMediaModel, generateImages, MAX_REFERENCE_IMAGES, MediaError, outputDirectory, outputStem, parseImageCommand, recentEntry, validCommandId, validSessionId, writeOutputFiles } from "../../media.js";
import { name } from "../config.js";

export function createImageJobs(shared) {
  const { ctx, controller, mediaSessions, mediaChoicesFor, mediaAccountsSummary, REFERENCES_MAX_BYTES, readReference, interpretParams, interpretedRecord, mediaFailureText, mediaJobs, settleWith, publishSessionStatus, settleSessionStatus, syncHeartbeat, recordRun, folderLabel } = shared;
  /** Run one admitted image request in the background; resolves when it has settled and been recorded. */
  const startImageJob = ({ sessionId, commandId, option, args: admitted, references, cwd, outputDir, endpoint, interpret }) => {
    const key = commandId ?? `job-${++shared.mediaJobSeq}`;
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    const started = Date.now();
    return settleWith(key, (async () => {
      try {
        let args = admitted;
        if (interpret !== undefined) {
          if (commandId !== undefined) shared.videoLive.set(commandId, { phase: "interpreting" });
          const result = await interpret(abort.signal);
          if (commandId !== undefined) shared.videoLive.delete(commandId);
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
        if (commandId !== undefined) shared.videoLive.delete(commandId);
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

  return { startImageJob, runImageCommand };
}
