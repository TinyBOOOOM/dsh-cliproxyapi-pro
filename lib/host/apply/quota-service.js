// Quota controller wiring through account facts and credential references.

import { createQuotaController } from "../../quota/index.js";

export function createQuotaService(shared) {
  const { ctx, resolveApiKey, describeApiKey, controller } = shared;
  // Quota ("额度" tab + composer badge): management keys live in the
  // credentials service under their own refs, never in account state.
  const quota = createQuotaController({
    listAccounts: () => controller.quotaAccounts(),
    resolveKey: (ref) => resolveApiKey(ref),
    describeKey: (ref) => describeApiKey(ref),
    setKey: async (ref, value) => {
      const credentials = ctx.get("credentials");
      if (credentials === undefined) {
        throw new Error("Credentials service is not available on this host");
      }
      await credentials.set(ref, value);
    },
    unsetKey: async (ref) => {
      await ctx.get("credentials")?.unset(ref);
    },
    logger: ctx.logger,
  });
  ctx.effect(() => () => quota.dispose(), "cpa: quota");

  return { quota };
}
