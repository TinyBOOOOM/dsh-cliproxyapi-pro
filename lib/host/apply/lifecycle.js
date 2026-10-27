// Refresh startup, video resume, credential listener and refresh-loop disposal.

import { outsideHmrTransaction } from "../apply-utils.js";

export function createLifecycle(shared) {
  const { ctx, reschedule, controller, quota, resumeVideoJobs, syncAgentTool } = shared;
  reschedule();
  resumeVideoJobs();
  shared.startupTimeout = outsideHmrTransaction(ctx, () =>
    setTimeout(() => {
      shared.startupTimeout = undefined;
      void controller.refreshAll().finally(() => syncAgentTool());
    }, 600)
  );

  ctx.on("credentials/reference-updated", (ref) => {
    // A management key changed (also from the DSH credentials page): start a new failure count.
    quota.keyChanged(ref);
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

  return {};
}
