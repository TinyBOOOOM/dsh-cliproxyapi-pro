// Slash-command registration and ordered command disposal.

import { renderQuotaText, renderStatusText } from "../status-text.js";

export function createCommands(shared) {
  const { ctx, controller, quota, runImageCommand, runVideoCommand, runVideoEditCommand, runVideoStatusCommand, syncAgentTool } = shared;
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

  return {};
}
