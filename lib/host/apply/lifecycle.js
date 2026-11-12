// Refresh startup, online model info schedule, video resume, credential listener and refresh-loop disposal.

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

  // Online model info: first look ~5 s after start, then hourly checks that
  // download only when a source is a day old (or an hour after a failure).
  const { modelInfo } = shared;
  ctx.effect(() => {
    const run = () => void modelInfo.refresh().catch(() => {});
    const timers = outsideHmrTransaction(ctx, () => ({
      first: setTimeout(run, 5000),
      every: setInterval(run, 60 * 60 * 1000),
    }));
    return () => {
      clearTimeout(timers.first);
      clearInterval(timers.every);
      modelInfo.dispose();
    };
  }, "cpa: online model info");

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
