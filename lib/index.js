// Zero-external-dependency host plugin for DSH CLIProxyAPI auto-discovery, model selection & sync.
// Uses only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.webServer`).
// It deliberately registers no agent tool: accounts are managed in the Settings
// page, HTTP routes and slash commands, so nothing adds to model context.
// Image / video models (lib/media/) are classified and kept out of the
// chat routes; their preferences live in media-settings.json.

import { PACKAGE_NAME } from "./host/config.js";
import { mountOnce } from "./host/mount-guard.js";
import { applyImpl } from "./host/apply/index.js";

export { pickAccount, normalizeState, mergeHostConfig, accountConflicts, assertNoConflicts, newAccountDefaults, patchAccount } from "./host/accounts.js";
export { PACKAGE_NAME, name, inject, DEFAULT_ACCOUNT_ID, DEFAULT_PROVIDER, DEFAULT_DISPLAY_NAME, DEFAULT_API_KEY_ENV, STATE_VERSION, ACCOUNT_FIELDS, DEFAULT_REFRESH_INTERVAL_SECONDS, DEFAULT_PROBE_TIMEOUT_MS, LOCAL_CANDIDATES, MAX_RECOMMENDED_MODELS, PROTOCOLS, normalizeModelOverrides, resolveConfig, normalizeAccountId } from "./host/config.js";
export { serializeSettings, createCpaController } from "./host/controller.js";
export { normalizeCpaRoot, discoveryCandidates, parseCatalog, discoverCpa } from "./host/discovery.js";
export { ROUTES } from "./host/http-gate.js";
export { filterModels, modelFamily, sortModelsNewestFirst, recommendModels } from "./host/models.js";
export { nativeProtocol, modelProtocol, routeKeyFor, applyModelOverride, isChatModel, buildPiAiRoutes, managedRouteKeys } from "./host/routes.js";
export { CpaRuntime } from "./host/runtime.js";
export { resolveStateFilePath, loadPersistedState, savePersistedState } from "./host/state-store.js";
export { renderQuotaText, renderStatusText } from "./host/status-text.js";

export const apply = mountOnce(PACKAGE_NAME, applyImpl);
