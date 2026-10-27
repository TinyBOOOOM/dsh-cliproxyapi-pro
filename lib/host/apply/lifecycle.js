// Refresh startup, video resume, credential listener and refresh-loop disposal.

import { outsideHmrTransaction } from "../apply-utils.js";

export function createLifecycle(shared) {
  const { ctx, reschedule, controller, resumeVideoJobs, syncAgentTool } = shared;
  reschedule();
  resumeVideoJobs();
  shared.startupTimeout = outsideHmrTransaction(ctx, () =>
    setTimeout(() => {
      shared.startupTimeout = undefined;
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
      if (shared.timer !== undefined) clearInterval(shared.timer);
      if (shared.startupTimeout !== undefined) clearTimeout(shared.startupTimeout);
      controller.dispose();
    },
    "cpa: refresh loop"
  );

  return {  };
}
