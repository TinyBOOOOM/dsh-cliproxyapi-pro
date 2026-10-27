// Optional generate_media tool, cost consent, session budgets and output presentation.

import { existsSync, readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, isAbsolute, join } from "node:path";
import { MediaError, outputDirectory, validSessionId, agentPolicy, approvalText, chargeSeconds, GENERATE_MEDIA, GENERATE_MEDIA_OUTPUT, GENERATE_MEDIA_TOOL, parseToolArgs, sniffImageType, toolCommandLine, toolRunId } from "../../media.js";

export function createAgentTool(shared) {
  const { ctx, mediaSessions, mediaChoices, sessionChatTarget, mediaFailureText, jobPromises, runImageCommand, runVideoCommand, runVideoEditCommand } = shared;
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

  const registerAgentTool = () => {
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
    };

  return { pendingConfirms, syncAgentTool, registerAgentTool };
}
