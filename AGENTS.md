# AGENTS.md — working on dsh-cliproxyapi-pro

Guide for coding agents (and humans) changing this repository. Read it before editing; keep it current when the architecture changes.

## What this is

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) bundle that connects one or more [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) servers, discovers their model catalogs, and writes the selected models as provider routes into the `llm-pi-ai` settings namespace so they appear in the DSH model picker. It ships:

| Surface | Where |
|---|---|
| Host plugin (Cordis, ESM) | `lib/index.js` — exports `name`, `inject`, `apply` |
| Web UI client module | `lib/client.js` — Settings panel in `plugins.bundle.config` and `settings.plugins.tab` slots |
| Bundle patch | `cordis.patch.yml` — inserts row `dsh-cliproxyapi-pro` |
| Display metadata | `locale/en.json`, `locale/zh.json` (`meta.title`, `meta.description`), `icon.svg` |
| Agent tool | `cliproxyapi` (actions `status`, `refresh`, `configure`, `add_account`, `remove_account`) |
| Slash commands | `/cpa-status`, `/cpa-refresh` |
| HTTP routes | `/api/dsh-cliproxyapi/{status,refresh,save,accounts/add,accounts/remove}` |
| Tests | `tests/plugin.test.mjs` (`node:test`) |

## Hard constraints

- **Zero dependencies, no build.** Only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.tools`, `ctx.webServer`, `ctx.logger`). Do not add `dependencies`, install scripts, TypeScript, or bundlers. Installation must stay offline-safe.
- **Client module format.** `lib/client.js` is hand-written for `window.__ModuleLoader__.load({ id, factory })`; the id equals the package name. React comes from `require("react")` inside the factory. Never `require` any `@deepseek-ai/dsh-client-*` package — entries in `dsh.client.inject` only order activation.
- **Host UI conventions.** Style only with `--dsw-alias-*` theme tokens (literal colors only in artwork), keep all visible text in the `zh`/`en` dictionaries registered through `ctx.locale`, use `role="switch"` + `aria-checked` for toggles, and render only inside the registered slots (no DOM writes outside the component, nothing appended to `document.body`).
- **Resources are effects.** Every timer, listener, registration and stylesheet is created inside `apply` and disposed via `ctx.effect` / `ctx.on`. Timers that later write settings must be created through `outsideHmrTransaction(ctx, …)`, otherwise writes fail with "HMR transactions cannot be nested".
- **Secrets.** API keys live only in the DSH credentials service (`credentials.set/resolve/unset` by ref). Never write keys to `state.json`, settings, logs, tool output, or commits. Never print a resolved key.
- **Manifest.** The DSH version range is top-level `engines.dsh` (DSH evaluates it with prereleases included). Keep `exports` (`.`, `./client`, `./locale/*.json`, `./icon`, `./cordis.patch.yml`, `./package.json`) and `files` in sync with every shipped file.

## Architecture (lib/index.js, by `#region`)

1. **Constants & Config Resolution** — defaults, `ACCOUNT_FIELDS`, `resolveConfig()` (normalizes one account + globals; tolerant of bad input), `normalizeModelOverrides()`.
2. **Accounts** — `normalizeState()` (v1 flat file → `accounts[0]` with id `default`; dedupes ids), `mergeHostConfig()` (patch-row `config` overlay), `accountConflicts()` / `assertNoConflicts()`, `newAccountDefaults()` (`account-N`, `cli-proxy-N`, `CLI_PROXY_API_KEY_N`, disabled), `patchAccount()`.
3. **Persistent State Store** — `<profileDir>/.dsh-cliproxyapi/state.json`, atomic write via temp file + rename.
4. **Discovery & Catalog Parsing** — `discoveryCandidates()`, `discoverCpa()` (`/v1/models?client_version=pi` enriched catalog + plain `/v1/models` for `owned_by`), `parseCatalog()`.
5. **Profile & Model Builder** — filtering, family/version sorting, `nativeProtocol()`, `buildPiAiRoutes()` (one route per protocol), `managedRouteKeys()`.
6. **Runtime Synchronizer** — `CpaRuntime` (one per account: discover → build → diff-write routes → follow default model), `serializeSettings()`, `createCpaController()` (owns all runtimes and the state; every UI/tool/HTTP operation goes through it).
7. **HTTP Gate** — `admitRequest()` enforces host connection policy, loopback/trusted host, same-origin for POST.
8. **Mount Once Guard** — prevents double activation across HMR generations.
9. **Plugin Apply** — wires state file, credentials, timers, commands, tool and HTTP routes to the controller.

`lib/client.js`: `CpaSettingsPanel` (account bar, add/remove, fetch/save; owns server data) → `AccountPanel` (keyed by account id; drafts reload when `rev` changes after a save).

## Invariants — do not break

- An account owns exactly `managedRouteKeys(provider)` = `provider`, `provider-responses`, `provider-messages` under `llm-pi-ai.providers`. It never writes or unsets keys in `config.reservedKeys` (other accounts' keys). An account in conflict owns nothing and only reports an error.
- The base key (`provider`) always carries OpenAI Chat models so existing sessions and `agent-default-model` keep resolving; `followDefaultModel()` moves the default when protocol routing relocates its model.
- Disabled ⇒ the account's routes are removed, settings kept. Periodic refresh never probes disabled accounts; a manual refresh (`probe: true`) may, to list models.
- An explicit `baseURL` is the only candidate (`autoDiscover: false`); fallbacks (existing route URL, `CLIPROXYAPI_BASE_URL`, local `:8317`) apply only when `baseURL` is empty.
- Account ids are stable; renaming `provider` releases the old keys on the next sync. Removing an account tears down its runtime and unsets its routes but keeps its stored credential.
- Re-syncing unchanged data performs **zero** settings writes (diff via `sameJson`). User-set fields on managed routes (e.g. `retryPolicy`) survive; only `MANAGED_ROUTE_FIELDS` are replaced.
- `state.json` is re-read on every access so hand edits apply; always write the normalized shape (`version: 2`). Format changes need a migration in `normalizeState()` plus a test, and must keep a v1 file loading losslessly.

## Adding an account setting

Update, in order: `ACCOUNT_FIELDS` and `resolveConfig()` → `pickAccount()` → `accountPatchFromInput()` (tool + HTTP) → tool `parameters` schema and description → client draft state, the draft-loading `useEffect`, `onSave` payload and form control (with `zh`/`en` strings) → README tool/API tables → a test. Global (all-account) settings go in `GLOBAL_FIELDS` instead.

## Commands

```powershell
npm test              # node --test tests/*.test.mjs
npm run check         # syntax-check lib/*.js, then tests
npm run pack:check    # list the files a packed bundle would contain
```

Tests fake `fetch`, settings and credentials; they never touch the network or the real profile. Add a test for every behavior change in `CpaRuntime` / `createCpaController` (see the `multi-account` suite and its `harness()` helper). For client changes, at least `node --check lib/client.js`; a quick server render with any local `react` + `react-dom/server` catches runtime errors (patch `React.useState` before evaluating the module, because the client destructures hooks at load time).

## Working against a live Harness

- This directory may be installed **by link** into the user's profile (`plugin_manager list_bundles` shows `source: link:<this dir>`). Saved edits then become live on the next plugin reload — and the agent session itself may be using models routed through this plugin. Make risky changes in a scratch copy, get tests green, then copy back.
- Back up `<profileDir>/.dsh-cliproxyapi/state.json` before changing its format or migration logic.
- Reload host code: `plugin_manager set_plugin include:dsh-cliproxyapi-pro` `enabled:false`, then `enabled:true`. Routes already written to `llm-pi-ai` persist across the reload. Client code needs a page refresh.
- Verify through the `cliproxyapi` tool (`status` / `refresh`) or `/cpa-status`; the HTTP routes require the Web session's auth and return 401 to plain `curl`.
- Restore any account, selection or route you changed while testing.

## Release checklist

1. Bump `version` in `package.json` and the README title; add a `CHANGELOG.md` entry.
2. `npm run check` passes; `npm run pack:check` lists exactly `lib/index.js`, `lib/client.js`, `locale/*.json`, `cordis.patch.yml`, `icon.svg`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.
3. `locale/*.json` `meta` text still describes the plugin; `icon.svg` renders (≤ 256 KiB).
4. Reload in a live Harness, check the Settings panel in both languages and the tool output.
5. Commit (`type: summary`, e.g. `feat: multi-account support`, `fix: …`, `docs: …`), tag `v<version>`, `npm pack` for a `.tgz`.
