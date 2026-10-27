[Back to AGENTS.md](../../AGENTS.md)

# Architecture and Host pipeline

| Surface | Where |
|---|---|
| Host plugin (Cordis, ESM) | `lib/index.js` — exports `name`, `inject`, `apply` |
| Web UI client module | `lib/client.js` — account/model page in the `settings.section` slot (Settings left nav, id `cliproxyapi`); update-only page in `plugins.bundle.config` and `settings.plugins.tab` |
| Offline updater (internal ESM) | `lib/updater/` — preferences, channel/region checks, verified offline package downloads; never installs |
| Quota engine (internal ESM) | `lib/quota/` — CPA management API (auth-files, per-credential models, upstream quota via api-call), 30-minute cache, model → credential matching; management keys only through credentials refs `CLI_PROXY_MANAGEMENT_KEY[_<ID>]` |
| Quota HTTP routes | `/api/dsh-cliproxyapi/quota/{status,refresh,save}` |
| Media engine (internal ESM) | `lib/media/` — chat / image / video classification, `media-settings.json` preferences, `media-sessions.json` per-session picks, run records and recent outputs, `media-jobs.json` video jobs, image generation / editing, video submit / poll / download, output files, read-only diagnostic (design: `docs/design/media-generation.md`, repository only) |
| Media HTTP routes | `/api/dsh-cliproxyapi/media/{status,save,diagnose,session,session/save,file,command,confirm}` |
| Market installation (client) | `lib/client.js` — dshmarket Update API v1 one-click install and opt-in auto-install; the market installs |
| Bundle patch | `cordis.patch.yml` — inserts row `dsh-cliproxyapi-pro` |
| Display metadata | `locale/en.json`, `locale/zh.json` (`meta.title`, `meta.description`), `icon.svg` |
| Agent tool | `generate_media` only, **off by default** (Generation tab switch); registered only while switched on and a generation model is offered (see the invariant below) |
| Slash commands | `/cpa-status`, `/cpa-refresh`, `/cpa-image` (image generation; accepts image attachments), `/cpa-video` (video generation; images = first frame / references / pinned first-last frames), `/cpa-video-edit`, `/cpa-video-extend`, `/cpa-video-status` |
| Account HTTP routes | `/api/dsh-cliproxyapi/{status,refresh,save,accounts/add,accounts/remove,accounts/test}` |
| Update HTTP routes | `/api/dsh-cliproxyapi/updates/{status,check,save,download}` |
| Tests (`node:test`) | `tests/<area>/*.test.mjs` (host, media, quota, updater, client); shared fixtures in `tests/helpers/` |
| User docs | `README.md` (中文, default), `README.en.md` (English); synchronized topics in `docs/zh/`, `docs/en/`; developer detail in `docs/dev/` |
| CI / release | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |

Repository: <https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro> (default branch `main`).

## Module map

The Host entry `lib/index.js` only re-exports; behavior lives in these modules (no import cycles; engines are imported only through their barrels `lib/media/index.js`, `lib/quota/index.js`, `lib/updater/index.js`).

| Module | Owns |
|---|---|
| `lib/host/config.js` | Constants, `ACCOUNT_FIELDS` / `GLOBAL_FIELDS`, credential refs, `resolveConfig()`, `normalizeModelOverrides()` |
| `lib/host/accounts.js` | `normalizeState()` migration, `mergeHostConfig()`, conflicts, `newAccountDefaults()`, `patchAccount()` |
| `lib/host/state-store.js` | State path resolution and atomic `state.json` writes |
| `lib/host/discovery.js` | `discoveryCandidates()`, `discoverCpa()`, `parseCatalog()`, plain-listing merge |
| `lib/host/models.js` | Filtering, families, version ordering, `recommendModels()` |
| `lib/host/routes.js` | `nativeProtocol()`, overrides, `buildPiAiRoutes()`, `managedRouteKeys()` |
| `lib/host/runtime.js` | `CpaRuntime`: discover → build → diff-write → follow default model |
| `lib/host/controller.js` | `createCpaController()`, `serializeSettings()` |
| `lib/host/http-gate.js` | `ROUTES`, `admitRequest()` / `admitUpdateRequest()`, bounded JSON bodies |
| `lib/host/mount-guard.js` | Mount-once guard across HMR generations |
| `lib/host/status-text.js` | `/cpa-status` account and quota text |
| `lib/host/apply-utils.js` | `outsideHmrTransaction()`, `accountPatchFromInput()` |
| `lib/host/apply/index.js` | `applyImpl`: builds the activation context and wires the factories below in the original order |
| `lib/host/apply/state.js` | State migration on activation, route seeding, fresh reads |
| `lib/host/apply/controller.js` | Credentials, media preferences, account controller, refresh scheduling |
| `lib/host/apply/updates.js` | Update preferences, `createPluginUpdater()` wiring, startup / 6-hour schedule |
| `lib/host/apply/quota-service.js` | `createQuotaController()` wiring |
| `lib/host/apply/media-service.js` | Media status/save, generation choices, `sessionView()`, session picks, `byteRange()` |
| `lib/host/apply/references.js` | `readReference()` and request-image fitting |
| `lib/host/apply/interpret.js` | `sessionChatTarget()`, `interpretParams()` |
| `lib/host/apply/media-failures.js` | `mediaFailureText()` |
| `lib/host/apply/session-status.js` | Job map, `api-session/status` heartbeat, `recordRun()` |
| `lib/host/apply/image-jobs.js` | `runImageCommand`, `startImageJob()` |
| `lib/host/apply/video-jobs.js` | `startVideoJob()`, `followVideoJob()`, `trackVideoJob()`, `resumeVideoJobs()`, remembered sources |
| `lib/host/apply/video-command.js` | `runVideoCommand`, `videoMode()` |
| `lib/host/apply/video-edit.js` | `runVideoEditCommand(mode)`, sources, `runVideoStatusCommand` |
| `lib/host/apply/agent-tool.js` | `executeGenerateMedia()`, consent (`askNativeConfirm()` / fallback), budgets, `syncAgentTool()` |
| `lib/host/apply/commands.js` | Slash-command registration and disposal order |
| `lib/host/apply/http-routes.js` | Account / update / quota / media HTTP routes and `media/file` serving |
| `lib/host/apply/lifecycle.js` | Startup refresh, video resume, credential listener, disposal |

## Host responsibilities

1. **Constants & Config Resolution** — defaults, `ACCOUNT_FIELDS`, `resolveConfig()` (normalizes one account + globals; tolerant of bad input), `normalizeModelOverrides()`.
2. **Accounts** — `normalizeState()` (v1 flat file → `accounts[0]` with id `default`; dedupes ids), `mergeHostConfig()` (patch-row `config` overlay), `accountConflicts()` / `assertNoConflicts()`, `newAccountDefaults()` (`account-N`, `cli-proxy-N`, `CLI_PROXY_API_KEY_N`, disabled), `patchAccount()`.
3. **Persistent State Store** — `<profileDir>/.dsh-cliproxyapi/state.json`, atomic write via temp file + rename.
4. **Discovery & Catalog Parsing** — `discoveryCandidates()`, `discoverCpa()` (`/v1/models?client_version=pi` enriched catalog fetched in parallel with the plain `/v1/models` listing for `owned_by` and listing-only media models; the listing has its own deadline and one retry, and `listingOk: false` makes `CpaRuntime` re-read the catalog ~4 s later twice before falling back to the periodic refresh), `parseCatalog()`.
5. **Profile & Model Builder** — filtering, family/version sorting, `nativeProtocol()`, `buildPiAiRoutes()` (one route per protocol), `managedRouteKeys()`.
6. **Runtime Synchronizer** — `CpaRuntime` (one per account: discover → build → diff-write routes → follow default model), `serializeSettings()`, `createCpaController()` (owns account runtimes and state; all account UI/command/HTTP operations go through it).
7. **HTTP Gate** — `admitRequest()` enforces host connection policy, loopback/trusted host, same-origin for POST. `admitUpdateRequest()` additionally requires a Host and, when an `Origin` is present, the same authority under the Origin's own `http(s)` scheme (the host connection fence's rule).
A missing `Origin` is allowed: the DSH desktop shell (`forwardWebRequest` in the desktop main process) strips `origin`, `host` and `sec-fetch-site` before forwarding page requests with its session cookie, so requiring it rejects every desktop update POST (the 1.5.1 "check fails" bug; dshmarket hit the same, its #648).
8. **Mount Once Guard** — prevents double activation across HMR generations.
9. **Plugin Apply** — wires state file, credentials, timers, commands and HTTP routes to the controller, plus an independent updater and its disposed startup/6-hour schedule.

## Hard constraints in detail

- **No runtime dependencies; nothing built at install time.** Only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.webServer`, `ctx.logger`).
  Do not add `dependencies`, install scripts, TypeScript, or bundlers.
  Installation must stay offline-safe.
- **Client module format.** `lib/client.js` is generated from `src/client/` by the zero-dependency `scripts/build-client.mjs`, committed, never edited by hand, and formatted for `window.__ModuleLoader__.load({ id, factory })`; the id equals the package name.
  React comes from `require("react")` inside the factory.
  Never `require` any `@deepseek-ai/dsh-client-*` package — entries in `dsh.client.inject` only order activation.
- **Host UI conventions.** Style only with `--dsw-alias-*` theme tokens (literal colors only in artwork); to match native controls the quota UI also uses DSH design tokens (`--dsw-radius-*`, `--dsw-elevation-*`, `--dsw-menu-surface-fill` / `--dsw-menu-backdrop-filter`, `--dsw-alias-interactive-*` / `--dsw-alias-button-*`), always with a core `--dsw-alias-*` fallback, keep all visible text in the `zh`/`en` dictionaries registered through `ctx.locale`, use `role="switch"` + `aria-checked` for toggles, and render only inside the registered slots (no DOM writes outside the component, nothing appended to `document.body`).
- **Resources are effects.** Every timer, listener, registration and stylesheet is created inside `apply` and disposed via `ctx.effect` / `ctx.on`.
  Timers that later write settings must be created through `outsideHmrTransaction(ctx, …)`, otherwise writes fail with "HMR transactions cannot be nested".
  Component polling uses a cleaned-up `useEffect`, cancels requests, and never sets state after unmount.
- **Secrets.** API keys live only in the DSH credentials service (`credentials.set/resolve/unset` by ref).
  Never write keys to `state.json`, settings, logs, tool output, or commits.
  Never print a resolved key or forward credentials to update registries.
- **Updater boundary.** Current DSH rejects replacing an installed plugin while running.
  This plugin never runs a package manager, uninstalls, overwrites installed/source files, or restarts DSH by itself.
  Installation is delegated only to dshmarket's public, versioned Update API v1 (`/dsh-market/api/v1/*`, schema `dsh-market/update-api/v1`), called from the Web client with the page's session; never call the market's private `/dsh-market/*` routes or copy its installation algorithm.
  Without the market, the host updater checks and downloads only, and the displayed command is inert text for the user to run after closing DSH.
- **Manifest.** The DSH version range is top-level `engines.dsh` (DSH evaluates it with prereleases included).
  Keep `exports` (`.`, `./client`, `./locale/*.json`, `./icon`, `./cordis.patch.yml`, `./package.json`) and `files` in sync with every shipped file. `lib/updater/`, `lib/quota/` and `lib/media/` are internal relative imports, shipped in `files`, not public package exports.
