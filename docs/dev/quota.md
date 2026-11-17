[Back to AGENTS.md](../../AGENTS.md)

# Quota engine

- `lib/quota/`: `createQuotaController()` (fed by `controller.quotaAccounts()`: id, endpoint, owned `routes`, `pickerModels`) returns cached snapshots, refreshes stale accounts in the background, and never touches the management API without a key. Each snapshot also carries `sidebar` from the optional `deps.sidebar()` (the global `sidebarQuota` switch, read from account state by `lib/host/apply/quota-service.js`), so the page's sidebar entry learns it from its quota read.
- Management 401/403 answers count per account (`authFailures`, persisted through `deps.authStore` in `<profileDir>/.dsh-cliproxyapi/quota-state.json` via `normalizeQuotaAuthState()` in `lib/quota/auth-state.js`, never a key); they do not lock the account out, and background / refresh-all attempts continue at the TTL until `AUTH_FAILURE_LIMIT` (3; CPA bans an address for 30 minutes after 5 bad keys), then stop. Only a success, a new or cleared key (`saveKey`) or `keyChanged(ref)` (`lib/host/apply/lifecycle.js` forwards `credentials/reference-updated`) resets the count; a manual `refresh(id)` tries once without resetting it, so another rejection stops again. Network errors neither count nor reset. Snapshots report `authFailures` / `authFailureLimit` / `authPaused`.
- Every other cycle failure (network, timeout, HTTP, invalid response) locks the account out of background refresh and refresh-all (`lockedOut`, in memory) until `saveKey`, `keyChanged(ref)` or an account-specific manual refresh.
- Failed credential quota probes are independently quarantined (`pausedCredentials`, safe model/error metadata only); background cycles and refresh-all skip their model reads, token downloads and upstream probes while healthy credentials continue.
- Account-specific refresh and `saveKey` retry paused credentials; a failure pauses them again.
- Snapshots expose `autoRefreshPaused` on accounts (the `lockedOut` state) and credentials; the key-rejection pause is reported separately as `authPaused`.
- Pauses live in the Host controller (survive page reloads, reset on plugin reload/Host restart); cycle-local maps and generation fencing prevent cancelled work from changing quarantine state. `matchCredentials()` is the single source of model → credential mapping (`modelIndex`/`modelMatch` in each snapshot account): prefixed ids only to that prefix, bare ids prefer un-prefixed credentials, family heuristics only when model lists are missing.
- Snapshots never contain keys, tokens or raw upstream bodies.

- Quota probes (`PROBES`, keyed by normalized provider) mirror CLIProxyAPI's management center (`src/features/quota/providers/*` in router-for-me/Cli-Proxy-API-Management-Center): codex, claude, antigravity, gemini-cli, kimi (kimi.com / kimi.ai hosts, retry the other on 401/403), xai, devin (`GetUserStatus`, account-wide daily/weekly windows without a model filter), meta.
- Antigravity: every request (summary, per-model list, `loadCodeAssist`, `retrieveUserQuota`) sends the Antigravity Hub identity `AG_UA` (`antigravity/hub/2.23.0 darwin/arm64`, the one CPA and its management center send; Cloud Code omits groups and newer models for older clients). The `retrieveUserQuotaSummary` hosts are tried in the management center's fixed order (daily, daily sandbox, production — production's Gemini group can read 100% regardless of use), never reordered by an earlier answer; each pool family (`claude-gpt`, `gemini`, `argon`) is kept from the first host that reports it, until one supplies the Gemini pool. When none does, `fetchAvailableModels` (same order) supplies the missing families, with `retrieveUserQuota` only as a last resort.
- `antigravityModelWindows()` keys models by their public id (the `modelId` field is an internal placeholder), skips internal completion models (`isInternal`, `chat_*` / `tab_*`), and pools each family (Claude/GPT, Gemini Argon, other Gemini): one shared value becomes one prefix-matched family window (so Gemini ids the list omits still match); diverging values keep exact-id windows.
- Gemini Argon: some plans (e.g. Google AI Pro) give Argon a quota of its own. An Argon group or an Argon bucket inside the Gemini group gets prefixes `["argon", "gemini-<version>-argon"]` taken from its name (only the group *name* decides a group's family; its description may list Argon among the Gemini models). The client's `credentialWindows()` lets an Argon model's own windows replace the `gemini`-prefixed pool; without them it shares that pool. Peek rows shorten Antigravity pool names to Claude/GPT, Gemini and Argon.
- Matching a credential whose model list is unknown (CPA reports none while it is disabled): an Antigravity credential serves the union of its same-prefix Antigravity siblings' lists when any exists; otherwise the family heuristics apply, where a disabled Antigravity credential never claims Claude/GPT ids from its "Claude and GPT models" group alone.
- Upstream tokens normally stay inside CPA via `$TOKEN$`; the one exception is Meta, whose endpoint needs the credential's `dca_token`: `meta` reads only that field from `/v0/management/auth-files/download` for one request and must never store, log or return it.
- Any other credential with `supports_quota` goes through `pluginProbe` → `POST /v0/management/quota/fetch` (CPA's normalized `pluginapi.QuotaFetchResponse`, parsed by `groupedQuotaWindows()`).
- Never add probes that spend money (e.g. CPA's paid-xAI chat-completion health check); background refresh uses a 30-minute cache interval and never retries quarantined credentials automatically.
- When CPA adds a quota provider, compare against the management center first.

## Module map

`lib/quota/index.js` is the barrel (exactly the former `lib/quota.js` surface).

| Module | Owns |
|---|---|
| `constants.js` | Timing (`QUOTA_TTL_MS`), upstream endpoints, provider labels |
| `helpers.js` | Value normalization, quota windows, safe credential metadata |
| `management.js` | `managementOrigin()`, `managementKeyRef()`, bounded management HTTP and model reads |
| `parsers.js` | Upstream payloads → windows and plans (`groupedQuotaWindows()`) |
| `matching.js` | `matchCredentials()` and snapshot `modelIndex` / `modelMatch` |
| `probes/oauth.js` | codex, claude |
| `probes/google.js` | antigravity, gemini-cli (Code Assist loading, fallback order) |
| `probes/billing.js` | kimi, meta, xai, devin |
| `probes/plugin.js` | `pluginProbe` → `POST /v0/management/quota/fetch` |
| `controller.js` | `createQuotaController()`: cycles, quarantine (`pausedCredentials`), generation fencing, snapshots |
