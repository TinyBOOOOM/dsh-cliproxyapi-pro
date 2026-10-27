// Quota controller wiring through account facts and credential references.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createQuotaController } from "../../quota/index.js";

export function createQuotaService(shared) {
  const { ctx, resolveApiKey, describeApiKey, controller, updateDirectory } = shared;
  // Quota ("额度" tab + composer badge): management keys live in the
  // credentials service under their own refs, never in account state.
  // Consecutive management-key rejections per account (never the key itself),
  // so a wrong key stays stopped across reloads and restarts.
  const quotaStatePath = join(updateDirectory, "quota-state.json");
  const quota = createQuotaController({
    authStore: {
      read: () => (existsSync(quotaStatePath) ? JSON.parse(readFileSync(quotaStatePath, "utf8")) : undefined),
      write: (value) => {
        mkdirSync(dirname(quotaStatePath), { recursive: true });
        const tmp = `${quotaStatePath}.${Date.now().toString(36)}.tmp`;
        writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        renameSync(tmp, quotaStatePath);
      },
    },
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
