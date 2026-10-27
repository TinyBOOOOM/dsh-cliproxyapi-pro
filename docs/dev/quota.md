[Back to AGENTS.md](../../AGENTS.md)

# Quota engine

- `lib/quota/`: `createQuotaController()` (fed by `controller.quotaAccounts()`: id, endpoint, owned `routes`, `pickerModels`) returns cached snapshots, refreshes stale accounts in the background, locks an account out of background refresh after any cycle failure until `saveKey`/account-specific manual refresh, and never touches the management API without a key.
- Failed credential quota probes are independently quarantined (`pausedCredentials`, safe model/error metadata only); background cycles and refresh-all skip their model reads, token downloads and upstream probes while healthy credentials continue.
- Account-specific refresh and `saveKey` retry paused credentials; a failure pauses them again.
- Snapshots expose `autoRefreshPaused` on accounts and credentials.
- Pauses live in the Host controller (survive page reloads, reset on plugin reload/Host restart); cycle-local maps and generation fencing prevent cancelled work from changing quarantine state. `matchCredentials()` is the single source of model → credential mapping (`modelIndex`/`modelMatch` in each snapshot account): prefixed ids only to that prefix, bare ids prefer un-prefixed credentials, family heuristics only when model lists are missing.
- Snapshots never contain keys, tokens or raw upstream bodies.

- Quota probes (`PROBES`, keyed by normalized provider) mirror CLIProxyAPI's management center (`src/features/quota/providers/*` in router-for-me/Cli-Proxy-API-Management-Center): codex, claude, antigravity, gemini-cli, kimi (kimi.com / kimi.ai hosts, retry the other on 401/403), xai, devin (`GetUserStatus`, account-wide daily/weekly windows without a model filter), meta.
- Upstream tokens normally stay inside CPA via `$TOKEN$`; the one exception is Meta, whose endpoint needs the credential's `dca_token`: `meta` reads only that field from `/v0/management/auth-files/download` for one request and must never store, log or return it.
- Any other credential with `supports_quota` goes through `pluginProbe` → `POST /v0/management/quota/fetch` (CPA's normalized `pluginapi.QuotaFetchResponse`, parsed by `groupedQuotaWindows()`).
- Never add probes that spend money (e.g.
- CPA's paid-xAI chat-completion health check); background refresh uses a 30-minute cache interval and never retries quarantined credentials automatically.
- When CPA adds a quota provider, compare against the management center first.

<!-- MODULE-MAP: filled in by the coordinator -->
