// HMR-safe callback execution and accepted account HTTP input fields.

import { GLOBAL_FIELDS } from "./config.js";
import { plainObject } from "./accounts.js";

/**
 * Run `fn` outside the HMR transaction's async context.
 *
 * dsh-hmr marks a running transaction with an AsyncLocalStorage store, and
 * this plugin's apply() runs inside the install/enable transaction. Timers
 * created there inherit that store forever, so every later settings write
 * from them fails with "HMR transactions cannot be nested". Creating the
 * timers under `executing.exit()` — what dsh-hmr does for its own watchers —
 * gives them a clean context.
 */
export function outsideHmrTransaction(ctx, fn) {
  try {
    const executing = ctx.get?.("hmr")?.executing;
    if (typeof executing?.exit === "function") return executing.exit(fn);
  } catch {}
  return fn();
}

/** Account fields the save and add routes accept, besides key handling. */
export function accountPatchFromInput(input) {
  const patch = {};
  for (const field of ["baseURL", "provider", "displayName", "protocol", "protocolMode", "includePrefix", "excludePrefix", "apiKeyEnv"]) {
    if (typeof input[field] === "string") patch[field] = input[field];
  }
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (Array.isArray(input.selectedModels)) patch.selectedModels = input.selectedModels;
  if (plainObject(input.modelOverrides) !== undefined) patch.modelOverrides = input.modelOverrides;
  if (typeof input.apiKey === "string" && input.apiKey.trim() !== "") patch.apiKey = input.apiKey.trim();
  if (input.clearApiKey === true) patch.clearApiKey = true;
  for (const field of GLOBAL_FIELDS) {
    if (input[field] !== undefined) patch[field] = input[field];
  }
  return patch;
}
