// Host-side quota engine public surface; implementation modules remain internal.
// Host-side quota engine for dsh-cliproxyapi-pro.
//
// Reads a CLIProxyAPI (CPA) server's credentials through its management API
// (`/v0/management/auth-files`, `/auth-files/models`, `/api-call` with
// `$TOKEN$` substitution) and queries the upstream quota endpoints that the
// providers expose (Codex, Claude, Antigravity, Gemini CLI, Kimi, xAI, Devin,
// Meta), plus CPA's own normalized quota route for plugin providers. It
// produces a JSON-serializable snapshot without keys, tokens or raw upstream
// bodies, and maps DSH model ids to the credentials that serve them.
//
// Upstream protocol knowledge follows the MIT-licensed "CliProxyAPI quota"
// browser plugin, re-implemented here for the host.

export { QUOTA_TTL_MS, DEFAULT_QUOTA_TIMEOUT_MS, DEFAULT_QUOTA_CONCURRENCY, MAX_QUOTA_RESPONSE_BYTES } from "./constants.js";
export { managementKeyRef, managementOrigin } from "./management.js";
export { matchCredentials } from "./matching.js";
export { createQuotaController } from "./controller.js";
