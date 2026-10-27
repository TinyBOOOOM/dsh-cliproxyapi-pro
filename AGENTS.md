# AGENTS.md — working on dsh-cliproxyapi-pro

Guide for coding agents (and humans). Read this entry point before editing; load the topic guides below before changing their area. Keep architecture and both user-documentation languages current.

## What this is

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) bundle connecting one or more [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) servers. It discovers their catalogs and synchronizes selected chat models into `llm-pi-ai` provider routes for the DSH model picker; quota, generation and plugin updates are separate services.
Repository: <https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro>, default branch `main`.

## Module map

| Path | Owns |
|---|---|
| `lib/index.js` | Cordis entry (`name`, `inject`, `apply`) and the public re-export barrel; keep every existing export |
| `lib/host/` | Account config, state, discovery, model/route building, `CpaRuntime`, `createCpaController`, HTTP gate, mount guard |
| `lib/host/apply/` | `applyImpl` as factories over one explicit activation context: state, updates, quota, media service, image/video jobs, agent tool, commands, HTTP routes, lifecycle |
| `lib/media/` | Media engine (barrel `index.js`): classification, preferences, stores, parsers, image/video requests, interpretation, codecs, tool schema |
| `lib/quota/` | Quota engine (barrel `index.js`): management API, parsers, matching, `probes/`, controller |
| `lib/updater/` | Offline updater (barrel `index.js`): preferences, SemVer, registry metadata, package verification, storage |
| `src/client/` | Web client sources, assembled in `src/client/manifest.json` order into the generated `lib/client.js` |
| `tests/<area>/`, `tests/helpers/` | `node:test` suites per area (`host`, `media`, `quota`, `updater`, `client`) and shared fakes |

Per-file maps live in the topic guides: [host](docs/dev/architecture.md#module-map), [media](docs/dev/media.md#module-map), [quota](docs/dev/quota.md#module-map), [updater](docs/dev/updater.md#module-map), [client](docs/dev/client.md#module-map), [tests](docs/dev/testing.md#test-layout). Keep them current when you add, rename or split a module; keep hand-written files at about 600 lines or fewer (800 at most).

User docs are `README.md` / `README.en.md` and `docs/zh/` / `docs/en/`; developer detail is `docs/dev/`, starting with the [surface inventory](docs/dev/architecture.md).

## Hard constraints

- **No runtime dependencies; nothing built at install time.** Node built-ins and Cordis services only. No `dependencies`, install scripts, TypeScript or bundlers; installs remain offline-safe.
- **Generated client.** The zero-dependency `scripts/build-client.mjs` builds `lib/client.js` from `src/client/`. Commit generated output; never edit it by hand. Preserve `window.__ModuleLoader__.load({ id, factory })` with the package-name id; React comes from `require("react")` inside the factory. Never require `@deepseek-ai/dsh-client-*`; `dsh.client.inject` only orders activation.
- **Native UI.** Use `--dsw-alias-*` theme tokens; native quota tokens need alias fallbacks. Visible text belongs in `zh` / `en` dictionaries via `ctx.locale`. Use `role="switch"` / `aria-checked`. Render only inside registered slots: no external DOM writes or `document.body` additions.
- **Effects and cleanup.** Create timers, listeners, registrations and styles in `apply`; dispose through `ctx.effect` / `ctx.on`. Settings-writing timers require `outsideHmrTransaction(ctx, …)`. Cancel component requests/timers on unmount and never update unmounted state.
- **Secrets.** Keys live only in credentials refs (`credentials.set/resolve/unset`), never state, settings, logs, tool output or commits. Never print resolved keys or send credentials to registries.
- **Update boundary.** Never run a package manager, uninstall, replace source/installed files or restart DSH. Installation belongs only to dshmarket's public Update API v1 (`/dsh-market/api/v1/*`, `dsh-market/update-api/v1`), called by the Web client with its session; no private routes or copied install algorithm. Without the market, check/download only; commands are inert text for use with DSH closed.
- **Manifest.** DSH compatibility is top-level `engines.dsh` (prereleases included). Keep `exports` and `files` aligned; `lib/**/*.js` ships internal modules without making them public exports. Preserve existing public entry points; see [architecture](docs/dev/architecture.md).
- **Documentation and release scope.** Keep Chinese/English changes in one commit, README file/image links absolute, screenshot provenance accurate, and changelog entries bilingual. Do not bump versions, pins or tags unless a release is requested; never introduce `NPM_TOKEN`.

## Most important invariants

- Each account owns only `managedRouteKeys(provider)`: base, `-responses` and `-messages`. Never touch `config.reservedKeys`; conflicts own nothing. Base routes retain Chat models and `followDefaultModel()` follows protocol relocations.
- Disabled accounts keep settings but lose routes; periodic refresh skips them, manual probing may inspect them. Explicit `baseURL` never falls back to another server. Account ids remain stable; removal keeps credentials.
- Unchanged sync performs zero writes (`sameJson`); preserve user route fields outside `MANAGED_ROUTE_FIELDS`. Missing `selectedModels` seeds catalog-derived recommendations once; `[]` explicitly means all. Never hard-code default model ids.
- State is re-read on access and normalized to `version: 2`. Format changes require lossless v1 migration in `normalizeState()` and tests. Update/media preferences remain outside account state and `GLOBAL_FIELDS`.
- At most one tool, `generate_media`, off by default and registered only with enabled generation models. No account/quota/update tools. Its compact static schema never lists models; prompts stay verbatim with no invented scene details.
- Media kinds never enter chat routes/recommendations; retain saved selections. Generation requires explicit user action, uses only the chosen account, never overwrites files, and never exposes keys, upstream URLs or raw bodies. Diagnostics are read-only GETs.
- Submitted videos cannot be cancelled or automatically resubmitted. Download only through CPA content routes; reload resumes submitted jobs only within `VIDEO_JOB_TTL_MS`. Dispose pauses, not fails, submitted jobs; result URLs stay in memory only.
- Manual generation has no consent/budget gate. Agent cost consent is independent of execution permission: exact native Allow only; timeout, abort, errors and malformed answers fail closed. Compatibility confirmation is only for missing native questions, bound to the root session, never chat rows.
- Agent video seconds count against the root session; limits block only in auto mode. Refund only not-submitted failures; reset on limit changes or ask→auto. Always settle generation `api-session/status` back to idle unless the agent still runs.
- Quota needs a management key; snapshots contain no secrets. Failures quarantine accounts/credentials until account-specific refresh or key save. Refresh-all/background work never retries paused credentials; cache is 30 minutes.
- Match quota only in the owning account: prefixed ids match their prefix, bare ids prefer unprefixed credentials. Never add spending probes; Meta's `dca_token` is one-request-only, never stored/logged/returned.
- Updates keep independent v1 preferences. Startup checks are ~3 s then 6 h; status/polling never contact registries. Channels never fall back or downgrade; regions affect updates only. Auto-download is not auto-install.
- Verify metadata origin/path, SHA-512 and bounded package structure against the package's own `files`; reject traversal, special entries, dependencies and install scripts. Never extract/execute packages or call integrity checks publisher signatures/provenance verification.
- Linked installs may check/download but receive no upgrade command or market install. Market auto-install requires an open page and explicit opt-in, never forces, tries each version at most once per 6 h, and never retries installed versions.
- HTTP POSTs retain host auth/trust policy; reject a present cross-origin `Origin`, but accept its absence after desktop session authentication. Check `update.errorCode` even with `ok: true`; localize errors, never backend stacks.
- Client updates never reload account drafts or bump `rev`. Preserve native details expansion across polling; clean activation-owned registrations/styles and use render-time retry for session model directories. Read [client detail](docs/dev/client.md) for slot and hook contracts.

The [full invariant list](docs/dev/invariants.md), [generation/consent detail](docs/dev/media.md) and [offline update invariants](docs/dev/updater.md) are mandatory when changing those paths.

## Commands

```powershell
npm run build:client  # regenerate committed lib/client.js from src/client/
npm test              # node --test "tests/**/*.test.mjs"
npm run check         # node scripts/check.mjs: syntax + client freshness + tests
npm run pack:check    # inspect packed files
node --test "tests/host/*.test.mjs" "tests/updater/*.test.mjs" "tests/client/*.test.mjs"
```

`npm run check` syntax-checks every `lib/**/*.js` and `scripts/**` file, runs `node scripts/build-client.mjs --check` and all tests. Areas: `host`, `media`, `quota`, `updater`, `client`; fixtures: `tests/helpers/`. Tests fake network, settings and credentials; never use a real profile. Add tests for behavior changes in `CpaRuntime` / `createCpaController`. Do not install React merely to validate. Details: [testing](docs/dev/testing.md).

## Working against a live Harness

A checkout may be live-linked, including the models serving this agent. Work in an approved scratch copy/worktree; test before approved deployment. Back up state before migration changes. Host reload and client refresh are separate; rebuild the generated client first. Plain unauthenticated `curl` receives 401. Never install an update, uninstall, restart DSH or overwrite linked source just to test; restore any test-time account/route edits. Read [live Harness precautions](docs/dev/live-harness.md) before touching a profile.

## Read before changing X

| Change area | Required detail |
|---|---|
| Host configuration, discovery, routes, HTTP admission | [Architecture and surface inventory](docs/dev/architecture.md), [full invariants](docs/dev/invariants.md) |
| Images/videos, commands, agent tool, consent, jobs | [Media engine and apply wiring](docs/dev/media.md), [media user guide](docs/en/media.md) |
| Quota matching, probes, caching/quarantine | [Quota engine](docs/dev/quota.md), [quota user guide](docs/en/quota.md) |
| Client slots, hooks, media rows, market client, polling | [Client surfaces and lifecycle](docs/dev/client.md) |
| Update checks, registry downloads, market installation | [Updater and offline invariants](docs/dev/updater.md), [update user guide](docs/en/updates.md) |
| Adding an account/global/update setting | [Adding settings](docs/dev/adding-settings.md), bilingual [HTTP reference](docs/en/reference.md) |
| Tests, generated-client checks, validation commands | [Testing](docs/dev/testing.md) |
| Live profiles, reloads, linked installations | [Live Harness](docs/dev/live-harness.md) |
| READMEs, user guides, screenshots, shipped files | [Documentation rules](docs/dev/documentation.md) |
| CI, tags, npm trusted publishing, release checklist | [CI and release](docs/dev/release.md) |

Keep account UI in the Settings `cliproxyapi` section and update-only UI in plugin config/tab slots. Preserve session-bound media picks and exact account-scoped quota matching. Never use navigation DOM patches, private market APIs or synthetic command events to reproduce native surfaces; the detailed client guide records the slot ids, durable tool lifecycle and compatibility behavior.

Before committing, rebuild client output if its sources changed, run the checks, inspect packed-file scope if shipped files changed, and review the synchronized documentation. Release CI and trusted publishing have additional strict contracts; use the linked checklist rather than improvising release commands.
