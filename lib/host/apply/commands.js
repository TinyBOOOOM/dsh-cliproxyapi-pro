// Slash-command registration and ordered command disposal; the generation
// commands follow the Generation tab's master switch (syncMediaCommands).

import { renderQuotaText, renderStatusText } from "../status-text.js";

export function createCommands(shared) {
  const { ctx, controller, quota, readMedia, runImageCommand, runVideoCommand, runVideoEditCommand, runVideoStatusCommand, syncAgentTool } = shared;
  // The generation slash commands (registered only while generation is on).
  let commandsCtx;
  let mediaCommandsOff;

  /**
   * Register or unregister /cpa-image and the /cpa-video* commands to match
   * the Generation tab's master switch. Jobs already submitted keep running.
   */
  const syncMediaCommands = () => {
    let wanted = false;
    try {
      wanted = readMedia().settings.enabled === true;
    } catch {
      wanted = false;
    }
    if (wanted && mediaCommandsOff === undefined && commandsCtx !== undefined) {
      try {
        mediaCommandsOff = registerMediaCommands(commandsCtx);
        ctx.logger?.info?.("cpa: generation commands registered");
      } catch (error) {
        ctx.logger?.warn?.(`cpa: could not register the generation commands: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (!wanted && mediaCommandsOff !== undefined) {
      const off = mediaCommandsOff;
      mediaCommandsOff = undefined;
      try {
        off();
      } catch {
        // already gone with its scope
      }
      ctx.logger?.info?.("cpa: generation commands unregistered");
    }
  };

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
      commandsCtx = cmdCtx;
      syncMediaCommands();
      return () => {
        offStatus?.();
        offRefresh?.();
        commandsCtx = undefined;
        const off = mediaCommandsOff;
        mediaCommandsOff = undefined;
        try {
          off?.();
        } catch {
          // disposed with its scope
        }
      };
    }, "cpa: commands");
  });

  /** The generation commands, registered only while generation is switched on (see syncMediaCommands). */
  function registerMediaCommands(cmdCtx) {
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
      offImage?.();
      offVideo?.();
      offVideoStatus?.();
      offVideoEdit?.();
      offVideoExtend?.();
    };
  }

  return { syncMediaCommands };
}
