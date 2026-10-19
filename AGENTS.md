# AGENTS.md — working on dsh-cliproxyapi-pro

Guide for coding agents (and humans) changing this repository. Read it before editing; keep it current when the architecture changes.

## What this is

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) bundle that connects one or more [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) servers, discovers their model catalogs, and writes the selected models as provider routes into the `llm-pi-ai` settings namespace so they appear in the DSH model picker. It ships:

| Surface | Where |
|---|---|
| Host plugin (Cordis, ESM) | `lib/index.js` — exports `name`, `inject`, `apply` |
| Web UI client module | `lib/client.js` — Settings panel in `plugins.bundle.config` and `settings.plugins.tab` slots |
| Offline updater (internal ESM) | `lib/updater.js` — preferences, channel/region checks, verified offline package downloads; never installs |
| Bundle patch | `cordis.patch.yml` — inserts row `dsh-cliproxyapi-pro` |
| Display metadata | `locale/en.json`, `locale/zh.json` (`meta.title`, `meta.description`), `icon.svg` |
| Agent tool | `cliproxyapi` (actions `status`, `refresh`, `configure`, `add_account`, `remove_account`) |
| Slash commands | `/cpa-status`, `/cpa-refresh` |
| Account HTTP routes | `/api/dsh-cliproxyapi/{status,refresh,save,accounts/add,accounts/remove}` |
| Update HTTP routes | `/api/dsh-cliproxyapi/updates/{status,check,save,download}` |
| Tests (`node:test`) | `tests/plugin.test.mjs`, `tests/updater.test.mjs`, `tests/update-routes.test.mjs`, `tests/client.test.mjs` |
| User docs | `README.md` (中文, default) and `README.en.md` (English) — keep both in sync |
| CI / release | `.github/workflows/ci.yml`, `.github/workflows/release.yml` |

Repository: <https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro> (default branch `main`).

## Hard constraints

- **Zero dependencies, no build.** Only Node.js built-ins and Cordis context services (`ctx.settings`, `ctx.credentials`, `ctx.commands`, `ctx.tools`, `ctx.webServer`, `ctx.logger`). Do not add `dependencies`, install scripts, TypeScript, or bundlers. Installation must stay offline-safe.
- **Client module format.** `lib/client.js` is hand-written for `window.__ModuleLoader__.load({ id, factory })`; the id equals the package name. React comes from `require("react")` inside the factory. Never `require` any `@deepseek-ai/dsh-client-*` package — entries in `dsh.client.inject` only order activation.
- **Host UI conventions.** Style only with `--dsw-alias-*` theme tokens (literal colors only in artwork), keep all visible text in the `zh`/`en` dictionaries registered through `ctx.locale`, use `role="switch"` + `aria-checked` for toggles, and render only inside the registered slots (no DOM writes outside the component, nothing appended to `document.body`).
- **Resources are effects.** Every timer, listener, registration and stylesheet is created inside `apply` and disposed via `ctx.effect` / `ctx.on`. Timers that later write settings must be created through `outsideHmrTransaction(ctx, …)`, otherwise writes fail with "HMR transactions cannot be nested". Component polling uses a cleaned-up `useEffect`, cancels requests, and never sets state after unmount.
- **Secrets.** API keys live only in the DSH credentials service (`credentials.set/resolve/unset` by ref). Never write keys to `state.json`, settings, logs, tool output, or commits. Never print a resolved key or forward credentials to update registries.
- **Updater boundary.** Current DSH rejects replacing an installed plugin while running. This updater checks and downloads only: never call an installation service, run a package manager, uninstall, overwrite installed/source files, or restart DSH. The displayed command is inert text for the user to run after closing DSH.
- **Manifest.** The DSH version range is top-level `engines.dsh` (DSH evaluates it with prereleases included). Keep `exports` (`.`, `./client`, `./locale/*.json`, `./icon`, `./cordis.patch.yml`, `./package.json`) and `files` in sync with every shipped file. `lib/updater.js` is an internal relative import, shipped in `files`, not a public package export.

## Architecture (lib/index.js, by `#region`)

1. **Constants & Config Resolution** — defaults, `ACCOUNT_FIELDS`, `resolveConfig()` (normalizes one account + globals; tolerant of bad input), `normalizeModelOverrides()`.
2. **Accounts** — `normalizeState()` (v1 flat file → `accounts[0]` with id `default`; dedupes ids), `mergeHostConfig()` (patch-row `config` overlay), `accountConflicts()` / `assertNoConflicts()`, `newAccountDefaults()` (`account-N`, `cli-proxy-N`, `CLI_PROXY_API_KEY_N`, disabled), `patchAccount()`.
3. **Persistent State Store** — `<profileDir>/.dsh-cliproxyapi/state.json`, atomic write via temp file + rename.
4. **Discovery & Catalog Parsing** — `discoveryCandidates()`, `discoverCpa()` (`/v1/models?client_version=pi` enriched catalog + plain `/v1/models` for `owned_by`), `parseCatalog()`.
5. **Profile & Model Builder** — filtering, family/version sorting, `nativeProtocol()`, `buildPiAiRoutes()` (one route per protocol), `managedRouteKeys()`.
6. **Runtime Synchronizer** — `CpaRuntime` (one per account: discover → build → diff-write routes → follow default model), `serializeSettings()`, `createCpaController()` (owns account runtimes and state; all account UI/tool/HTTP operations go through it).
7. **HTTP Gate** — `admitRequest()` enforces host connection policy, loopback/trusted host, same-origin for POST. `admitUpdateRequest()` additionally requires an explicit exact `Origin` matching the actual connection scheme and Host for update POSTs; missing origins are rejected.
8. **Mount Once Guard** — prevents double activation across HMR generations.
9. **Plugin Apply** — wires state file, credentials, timers, commands, tool and HTTP routes to the controller, plus an independent updater and its disposed startup/6-hour schedule.

`lib/updater.js`: `loadUpdateSettings()` / `saveUpdateSettings()` own separate v1 preferences; `parseUpdateVersion()` / `compareUpdateVersions()` implement strict SemVer; `validateUpdateMetadata()` validates channel/package/HTTPS registry metadata; `createPluginUpdater()` owns checks, automatic region racing, candidate generations and abortable downloads; `verifyUpdatePackage()` checks registry-provided SHA-512 integrity and restricted gzip/tar structure without extraction; `storeUpdatePackage()` atomically saves the verified `.tgz`. Integrity from registry metadata is not a publisher signature or npm provenance verification.

`lib/client.js`: `CpaSettingsPanel` (account bar, add/remove, fetch/save; owns account server data) → independent `PluginUpdatePanel` (after the title card, before account forms; update-only state, requests and polling) + `AccountPanel` (keyed by account id; drafts reload when `rev` changes after a save). Update polling must never refetch account status or bump `rev`. `PluginUpdatePanel` renders a native `<details>` that starts closed: the summary is a compact single row (title, current version, short localized status) and everything else lives in the content block. Never pass an `open` prop or remount the panel on polling/save, so the user's expanded state and the background schedule survive updates.

## Invariants — do not break

- An account owns exactly `managedRouteKeys(provider)` = `provider`, `provider-responses`, `provider-messages` under `llm-pi-ai.providers`. It never writes or unsets keys in `config.reservedKeys` (other accounts' keys). An account in conflict owns nothing and only reports an error.
- The base key (`provider`) always carries OpenAI Chat models so existing sessions and `agent-default-model` keep resolving; `followDefaultModel()` moves the default when protocol routing relocates its model.
- Disabled ⇒ the account's routes are removed, settings kept. Periodic refresh never probes disabled accounts; a manual refresh (`probe: true`) may, to list models.
- An explicit `baseURL` is the only candidate (`autoDiscover: false`); fallbacks (existing route URL, `CLIPROXYAPI_BASE_URL`, local `:8317`) apply only when `baseURL` is empty.
- Account ids are stable; renaming `provider` releases the old keys on the next sync. Removing an account tears down its runtime and unsets its routes but keeps its stored credential.
- Re-syncing unchanged data performs **zero** settings writes (diff via `sameJson`). User-set fields on managed routes (e.g. `retryPolicy`) survive; only `MANAGED_ROUTE_FIELDS` are replaced.
- `selectedModels` absent means "never chosen": the first successful probe seeds `recommendModels()` (newest per family, from that server's catalog) exactly once via `seedSelection`. `[]` is an explicit choice meaning "all models". Never ship hard-coded model ids as defaults — catalogs differ between servers.
- `state.json` is re-read on every access so hand edits apply; always write the normalized shape (`version: 2`). Format changes need a migration in `normalizeState()` plus a test, and must keep a v1 file loading losslessly.

### Offline update invariants

- Preferences live only in `<profileDir>/.dsh-cliproxyapi/update-settings.json`: `{ version: 1, autoCheck, autoDownload, channel, region }`. Never merge them into account state or `GLOBAL_FIELDS`. A missing file uses defaults (`autoCheck: true`, `autoDownload: false`, `stable`, `auto`); unreadable, malformed or invalid settings disable automatic network checks. Reload re-reads preferences; check/candidate/download-notice state is not persisted.
- Automatic checks run about 3 seconds after startup or rescheduling settings, then every 6 hours. `autoDownload` acts only after an automatic check finds a newer version and requires `autoCheck`. Manual check and download remain explicit operations. GET status and UI polling never contact a registry.
- `stable` / `beta` / `dev` map to npm `latest` / `beta` / `dev`. Unpublished channels fail explicitly; never silently fall back across channels or offer a downgrade. Region `auto` races npmjs and npmmirror for the first valid metadata; `global` / `cn` use only their chosen registry. Regions affect plugin updates only, never CPA requests or other installation sources.
- Metadata requests never follow redirects. Package requests follow at most 3 individually validated HTTPS redirects; Global stays on the exact npmjs package path, and China stays on npmmirror or its official `cdn.npmmirror.com/packages/<name>/<version>/<name>-<version>.tgz` path. Never allow arbitrary hosts, credentials, ports, queries, cross-region fallbacks or HTTP downgrades; integrity always comes from the original metadata.
- Validate registry origin/path, package name/version, SHA-512 integrity and bounded gzip/tar structure. Reject traversal, links/special entries, unexpected files, dependencies and installation lifecycle scripts. Do not extract or execute the downloaded package. Never describe these checks as publisher-signature or provenance verification.
- Verified packages are atomically written under `<profileDir>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`; users clean up historical files themselves. Never alter installed files, profile dependency declarations, accounts or credentials while preparing a download.
- Normal installations display `dsh plugin --profile 'name' add 'absolute.tgz'` for use only with DSH closed, followed by a restart. Linked installations can check/download but return no upgrade command: keeping the link requires manually updating source; installing an offline package would change its source. Preserve this warning in both dictionaries and docs.
- POST responses can report an operation failure inside `update.errorCode` even with `ok: true`; check both, and localize error codes rather than exposing backend messages/stacks. Requests racing settings changes or unmount must not overwrite newer state. Dispose timers and abort in-flight work on HMR/unmount.

## Adding a setting

**Account setting:** update, in order: `ACCOUNT_FIELDS` and `resolveConfig()` → `pickAccount()` → `accountPatchFromInput()` (tool + HTTP) → tool `parameters` schema and description → client draft state, the draft-loading `useEffect`, `onSave` payload and form control (with `zh`/`en` strings) → the tool/API tables in **both** `README.md` and `README.en.md` → a test. Global (all-account) settings go in `GLOBAL_FIELDS` instead.

**Update preference:** change updater defaults/normalization, strict persisted-file validation and `save()` validation → the isolated update card and both locale dictionaries → both READMEs → updater/client/HTTP tests. Keep the independent preferences schema versioned; do not change account-state migration for an update preference.

## Commands

```powershell
npm test              # node --test tests/*.test.mjs
npm run check         # syntax-check index/client/updater, then all tests
npm run pack:check    # list the files a packed bundle would contain
node --test tests/updater.test.mjs tests/update-routes.test.mjs tests/client.test.mjs
```

Tests fake `fetch`, settings and credentials; they never touch the network or the real profile. Add a test for every behavior change in `CpaRuntime` / `createCpaController` (see the `multi-account` suite and its `harness()` helper). `tests/updater.test.mjs` covers preferences, SemVer/channels, metadata racing, checksum/package validation and lifecycle; `tests/update-routes.test.mjs` covers update HTTP admission/operations; `tests/client.test.mjs` uses a dependency-free VM/Hook harness for update rendering, localization, independent requests, confirmation and cleanup. For client changes, at least `node --check lib/client.js`; a quick server render with any locally available `react` + `react-dom/server` is optional (patch `React.useState` before evaluating the module, because the client destructures hooks at load time). Do not install React just for validation.

## Working against a live Harness

- This directory may be installed **by link** into the user's profile (`plugin_manager list_bundles` shows `source: link:<this dir>`). Saved edits then become live on the next plugin reload — and the agent session itself may be using models routed through this plugin. Make risky changes in a scratch copy, get tests green, then copy back only within the user's approved scope.
- Back up `<profileDir>/.dsh-cliproxyapi/state.json` before changing its format or migration logic. Update preferences intentionally do not modify that format.
- Reload host code: `plugin_manager set_plugin include:dsh-cliproxyapi-pro` `enabled:false`, then `enabled:true`. Routes already written to `llm-pi-ai` persist across the reload. Client code needs a page refresh.
- Verify account behavior through the `cliproxyapi` tool (`status` / `refresh`) or `/cpa-status`; HTTP routes require the Web session's auth and return 401 to plain `curl`. Update POSTs additionally require the explicit same-origin header.
- Never upgrade the live plugin, uninstall it, restart DSH or overwrite a linked checkout merely to test the updater. Prefer injected offline I/O and component fixtures. Restore any account, selection or route you changed while testing.

## Documentation

- User-facing docs exist in two languages: `README.md` (中文 — the default, shown on GitHub and npmjs.com) and `README.en.md` (English). Any change to one — features, tables, examples, install steps, versions — goes into the other in the same commit. Each starts with the `中文 | English` switcher.
- Both READMEs are rendered on npmjs.com too, so images and file links use absolute `https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/...` / `https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/...` URLs, never relative paths.
- Install instructions describe only verified paths: the DSH **Plugins → Add plugin** dialog (package name, optional `@version`), the agent's `plugin_manager install_bundle` with target `dsh-cliproxyapi-pro`, `dsh plugin --profile <name> add dsh-cliproxyapi-pro` (installs from npm and adds the bundle to `dsh.profile.bundles` in one step), and Git / tarball / local-path targets. Re-verify after DSH changes its plugin manager. Offline update commands use `dsh plugin --profile 'name' add 'absolute.tgz'` only after DSH is closed.
- `AGENTS.md` and `CHANGELOG.md` are English only. Keep work-in-progress notes under `Unreleased`; do not bump a version or existing README pins unless a release is requested.
- Describe only behavior the code has; the community plugin list checks descriptions against the source. Distinguish automatic downloading from automatic installation, and integrity checks from authenticity verification.
- Screenshots live in `assets/screenshots/` and are referenced by both READMEs and by `screenshots.json` (1–8 relative paths, read by plugin storefronts such as dsh-market). They are not shipped in the npm package. When the panel changes visibly, retake them, keep them free of real keys, server URLs and private data, and keep the captions in both READMEs accurate. `updates.png` (collapsed row) and `updates-expanded.png` are actual-component offline previews with example versions, not evidence of live GUI validation; retain that disclosure.

## CI and release

- `ci.yml` runs `npm run check` and `npm pack --dry-run` on Ubuntu and Windows with Node 22 and 24 for pushes to `main` and pull requests. Keep `npm run check` green before pushing.
- `release.yml` runs on a pushed tag `v<version>`, or by hand for an existing tag (`gh workflow run release.yml -f tag=v<version>`): it fails unless the tag equals `package.json` `version`, runs the checks, creates a GitHub Release whose notes are that version's `CHANGELOG.md` section, attaches `dsh-cliproxyapi-pro-<version>.tgz` and the version-free `dsh-cliproxyapi-pro.tgz`, and runs `npm publish` through **npm trusted publishing** (OIDC, `id-token: write`; provenance is attached automatically). Each step is idempotent (an existing Release or an already-published npm version is skipped), so re-running finishes a partial release.
- Stable releases publish to npm `latest`; Beta and Dev prereleases use `beta` and `dev` and are marked as GitHub prereleases. A prerelease must never replace `latest`. Maintain the channel mapping consistently with updater dist-tags.
- **No npm token exists anywhere** — not in repository secrets, files, or chats. The npm package's Settings → Trusted publishing names GitHub user `TinyBOOOOM`, repository `dsh-cliproxyapi-pro`, workflow `release.yml`, no environment, with `npm publish` allowed; Publishing access is "Require two-factor authentication and disallow tokens". Renaming `release.yml`, moving the publish step into another workflow, or changing `repository.url` in `package.json` breaks publishing until that configuration is updated on npmjs.com. Never reintroduce an `NPM_TOKEN` secret.

## Release checklist

1. For an actual release, bump `version` in `package.json` and the pinned versions in both READMEs (`dsh-cliproxyapi-pro@<version>` and the `#v<version>` Git target); turn the `Unreleased` notes into a `## <version> — <date>` section of `CHANGELOG.md` (the release workflow publishes exactly that section as the Release notes).
2. `npm run check` passes; `npm run pack:check` lists exactly `lib/index.js`, `lib/client.js`, `lib/updater.js`, `locale/*.json`, `cordis.patch.yml`, `icon.svg`, `README.md`, `README.en.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.
3. `locale/*.json` `meta` text still describes the plugin; `icon.svg` renders (≤ 256 KiB).
4. With user approval, check the Settings panel in both languages and the tool output in a live Harness. Offline component previews must be labeled and do not substitute for a claimed live test; never install an update merely to capture the UI.
5. Commit (`type: summary`, e.g. `feat: offline update downloads`, `fix: …`, `docs: …`), push `main`, wait for CI, then `git tag v<version>` and `git push origin v<version>` to trigger the release. Verify stable/Beta/Dev npm dist-tag and GitHub prerelease classification.
