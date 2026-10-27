// Account state migration, curated-route seeding and fresh state access.

import { normalizeState, mergeHostConfig } from "../accounts.js";
import { PI_AI_NS, DEFAULT_MODEL_NS } from "../config.js";
import { managedRouteKeys } from "../routes.js";
import { resolveStateFilePath, loadPersistedState, savePersistedState } from "../state-store.js";

export function createState(shared) {
  const { ctx, config } = shared;
  const stateFilePath = resolveStateFilePath(ctx);
  const persisted = loadPersistedState(stateFilePath);

  const readExistingPiAiRoute = (provider) => {
    try {
      const descriptors = ctx.settings.describe();
      const piAi = descriptors.find((d) => d.ns === PI_AI_NS);
      return piAi?.value?.providers?.[provider];
    } catch {
      return undefined;
    }
  };

  const readDefaultModel = () => {
    try {
      const value = ctx.settings.describe().find((d) => d.ns === DEFAULT_MODEL_NS)?.value;
      return typeof value?.provider === "string" && typeof value?.model === "string"
        ? { provider: value.provider, model: value.model }
        : undefined;
    } catch {
      return undefined;
    }
  };

  // Seed a selection from every managed route, not just the base one, so a
  // restart after protocol routing keeps Messages / Responses models checked.
  const existingManagedIds = (provider) =>
    managedRouteKeys(provider).flatMap((key) => {
      const route = readExistingPiAiRoute(key);
      return Array.isArray(route?.models)
        ? route.models.map((m) => m?.id).filter((id) => typeof id === "string" && id.trim() !== "")
        : [];
    });

  // Migrate a legacy single-account file into `accounts[]`, keeping a copy.
  if (Object.keys(persisted).length > 0 && !Array.isArray(persisted.accounts)) {
    savePersistedState(stateFilePath.replace(/\.json$/, ".v1.json"), persisted);
  }

  // An account without a saved selection keeps the models already on its
  // pi-ai routes when that is a curated list (<= 35). Otherwise it stays
  // unset and its first successful probe seeds recommendModels().
  let memState = normalizeState(mergeHostConfig(persisted, config));
  memState = {
    ...memState,
    accounts: memState.accounts.map((account) => {
      if (account.selectedModels !== undefined) return account;
      const existingIds = existingManagedIds(account.provider);
      return existingIds.length > 0 && existingIds.length <= 35
        ? { ...account, selectedModels: existingIds }
        : account;
    }),
  };
  savePersistedState(stateFilePath, memState);

  // The state file is re-read on every access so hand edits take effect.
  const readState = () => {
    const fresh = loadPersistedState(stateFilePath);
    if (Object.keys(fresh).length > 0) memState = normalizeState(fresh);
    return memState;
  };
  const writeState = (state) => {
    memState = state;
    savePersistedState(stateFilePath, state);
  };


  return { stateFilePath, readExistingPiAiRoute, readDefaultModel, readState, writeState };
}
