# Changelog

All notable changes to this plugin. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- **Quota tab ("额度") in the CLIProxyAPI settings section.** The section now has two tabs, **Settings** (the existing accounts/models page) and **Quota**. Enter a CPA management key per account (stored in the DSH credentials service under `CLI_PROXY_MANAGEMENT_KEY` / `CLI_PROXY_MANAGEMENT_KEY_<ACCOUNT_ID>`, never in state or settings) and the Host reads that server's credentials (`/v0/management/auth-files`, their model lists, and upstream quota through `/v0/management/api-call`). The tab uses the flat row layout of the native DSH settings pages: key and refresh rows, a distribution bar, every credential grouped by channel with its plan, status and quota windows (5 h / weekly / monthly / daily) as meters with reset times, a channel filter, and an expandable "Model → Channel" table of how each picker model is mapped. Channels without a known quota endpoint (for example Devin) are listed with their status only.
- **Composer quota badge** left of the model selector (`conversation.input.right`): signal bars and the best remaining percentage among the credentials that serve the selected model on the selected model's own account; click for a per-credential peek on the DSH menu surface. The badge uses the model selector trigger's metrics and is not shown for accounts without a management key. Matching is per account and per channel: a model id is matched only to credentials of the account whose route it came from, prefixed ids (`devin/…`) only to credentials with that prefix, and bare ids prefer un-prefixed credentials.
- The `cliproxyapi` tool's `status` action and `/cpa-status` append a quota summary per account (key configured, state, credential count, and which credentials each picker model maps to with its tightest remaining percentage); no keys are printed.
- Quota HTTP routes `/api/dsh-cliproxyapi/quota/{status,refresh,save}`; saving a key and refreshing start the refresh and return at once, and the page follows it while `refreshing` is set. The Host caches results for 5 minutes and refreshes stale accounts in the background only while a page asks; a rejected management key (401/403) pauses automatic refresh for that account until the key changes or a manual refresh, so CPA's bad-key protection is not triggered.

## 1.6.0 — 2026-10-20

### Changed
- **Accounts and models moved to the Settings dialog's left navigation.** The account/model page is now its own `settings.section` entry ("CLIProxyAPI"), like the dshmarket "Market" section. The plugin's bundle page (Sidebar → Plugins) and its Built-in plugins tab now contain only plugin updates: a pointer to the new section plus the update card, expanded by default there.

### Fixed
- **"Check for Updates" always failed on the DSH desktop app.** The desktop shell strips the `Origin` header when it forwards page requests to the Host, and update POSTs (`check`, `save`, `download`) required an explicit exact `Origin`, so every one was refused with `forbidden-origin`. Update POSTs now follow the host connection fence: a missing `Origin` relies on the host session authentication, while a present `Origin` must still be this listener's own authority (compared under its own `http(s)` scheme). A refused origin now has its own localized message.

### Added
- **One-click updates through the DSH plugin market.** When dshmarket's public Update API v1 is detected (`GET /dsh-market/api/v1/capabilities`), the update card offers **Update Now**: after a version confirmation it submits the update to the market, follows the operation's progress, reports the version actually installed (and warns when it is below the checked target), and shows restart/refresh guidance from the market's outcome, with a restart button only when the market owns restarts. Market failure codes are localized; **Install Anyway** is offered only after a release-age wait or unresolved version. Linked installs are never installed through the market. This plugin still never runs a package manager itself.
- **Automatic installation (opt-in, `autoInstall`, default off).** With automatic checks on and dshmarket present, a version found by the Host's automatic check is installed through the market while a DSH page is open; each version is tried at most once every 6 hours and never again once installed, and automatic mode never forces. Stored as an optional field of the v1 `update-settings.json`; older files load as off.

## 1.5.1 — 2026-10-19

### Fixed
- A missing update endpoint (page updated but DSH still running the previous host code) is no longer reported as "invalid version information": 404/405/501 answers now map to a dedicated "update service unavailable" message that names the real cause and says DSH must be restarted, not merely refreshed.

## 1.5.0 — 2026-10-19

### Added
- **Plugin update card**, independent of account forms and drafts, with Chinese/English strings, localized errors, current/latest versions, Stable / Beta / Dev channels, Auto / Global / Mainland China regions, automatic checks and optional automatic downloads. The card is collapsed by default to a single compact row (title, current version, short update status) and expands on click; polling and saves never reset that choice.
- Automatic checks enabled by default about 3 seconds after startup or rescheduling preferences, then every 6 hours; automatic downloads are off by default and run only after an automatic check finds a newer version. No automatic installation, uninstall, source overwrite or restart.
- Strict SemVer channel checks using npm `latest` / `beta` / `dev`, explicit errors for unpublished channels, and no cross-channel fallback or downgrade. Auto region races npmjs and npmmirror for the first valid metadata; explicit regions stay on their selected registry and do not affect CPA traffic.
- Mainland China downloads follow npmmirror's official CDN redirects through an exact host/package/version allowlist, with at most three HTTPS hops and the original metadata integrity preserved. External, local, cross-region and downgrade redirects are refused.
- Verified offline package preparation: registry-provided SHA-512 integrity plus bounded gzip/tar, package identity/version and file-structure checks. Reject traversal, links/special entries, unexpected files, dependencies and installation lifecycle scripts; never extract or execute an update. These checks are not publisher-signature or npm provenance verification.
- Packages saved atomically under the profile's `.dsh-cliproxyapi/updates/` directory, with a version-specific download confirmation and an offline `dsh plugin --profile 'name' add 'absolute.tgz'` command for use after DSH is closed, followed by a restart. Linked local installations can check/download but receive no command, protecting the source-based installation.
- Separate versioned `update-settings.json` preferences; invalid or unreadable files disable automatic network checks, while a missing file uses first-run defaults. Existing v2 account state and credentials remain untouched. Check results and download notices are in-memory only; downloaded files remain for user-managed cleanup.
- Authenticated update HTTP routes: read-only `GET /api/dsh-cliproxyapi/updates/status` and `POST` operations `/check`, `/save`, `/download`. Update POSTs require an explicit exact same-origin header matching the actual connection scheme and Host, without trusting forwarded-protocol claims.
- Offline updater, HTTP and dependency-free VM/Hook client tests; actual-component offline previews (collapsed and expanded) with clearly labeled example versions.

### Changed
- Release automation publishes stable versions to npm `latest` and Beta / Dev prereleases to `beta` / `dev`, marking the corresponding GitHub Releases as prereleases without replacing stable.
- Both READMEs and the architecture guide explain download-versus-install behavior, linked-source protection, storage, API admission and the manual closed-DSH upgrade workflow. The packed zero-dependency bundle now includes the internal `lib/updater.js` module.

## 1.4.1 — 2026-10-19

Documentation and release tooling only; the plugin code is unchanged from 1.4.0.

### Changed
- `README.md` is now Chinese (the default on GitHub and npm), with the English version in `README.en.md`. Both are rewritten: a quick start, four verified ways to install (DSH **Plugins** page, the DSH agent, `dsh plugin add`, GitHub / offline package), upgrading and uninstalling, and a FAQ. Images and links use absolute URLs so they also render on npmjs.com.
- Releases publish to npm through npm trusted publishing (GitHub Actions OIDC) with an automatic provenance statement; no npm token is stored anywhere. The release workflow can also be run by hand for an existing tag and skips steps that are already done.

## 1.4.0 — 2026-10-19

First public release.

### Added
- **Multiple CLIProxyAPI accounts.** Each account has its own base URL, API key (own credential ref), provider route ID, protocol mode, model selection and per-model overrides, and synchronizes into its own `llm-pi-ai` routes (`cli-proxy-2`, `cli-proxy-2-responses`, `cli-proxy-2-messages`, …).
- **Per-account enable switch.** A disabled account keeps its settings but its routes are removed, so its models leave the picker. New accounts start disabled; a manual refresh still probes them so models can be picked before enabling.
- Settings panel account bar: switch accounts, **+ Add Account**, **Delete Account**, credential-ref field.
- `cliproxyapi` tool: `add_account` and `remove_account` actions, `account`, `enabled` and `apiKeyEnv` parameters; output lists every account.
- HTTP routes `POST /api/dsh-cliproxyapi/accounts/add` and `/accounts/remove`; `refresh` and `save` accept `accountId`.
- English `README.md` and Chinese `README.zh.md` with captioned screenshots; `screenshots.json` for plugin storefronts; `LICENSE`, `AGENTS.md`, `CHANGELOG.md`.
- GitHub Actions: CI (Ubuntu + Windows, Node 22 / 24) and a tag-triggered release that attaches the packed bundle and optionally publishes to npm.

### Changed
- `state.json` is now `{ version: 2, refreshIntervalSeconds, probeTimeoutMs, accounts: [...] }`. A v1 single-account file migrates automatically into account `default` with the same routes, key and selection; the original is kept as `state.v1.json`.
- An account with an explicit base URL only probes that URL and never falls back to local `:8317`, the existing route or `CLIPROXYAPI_BASE_URL`.
- Overlapping provider route IDs between accounts are rejected on save; an overlapping account in a hand-edited file is reported as an error and never writes or removes another account's routes.
- Settings writes from concurrent account syncs are serialized.
- `/cpa-status` and `/cpa-refresh` cover every account.
- The DSH version requirement moved to top-level `engines.dsh`, where DSH reads it; `./icon` is exported.
- `engines.node` is now `>=22` (the versions CI tests).

### Fixed
- **First-run selection no longer uses hard-coded model ids.** An account without a saved selection is seeded once, on its first successful probe, with the newest model of each family from its own server's catalog (at most 12). Previously a fresh install pre-selected 7 fixed ids that most servers do not offer, so nothing reached the picker.
- **Reset to Recommended** uses the same catalog-derived list (with its count) instead of the fixed 7.
- Saving a new account before its catalog was ever probed no longer stores an empty selection.
- When a saved selection matches nothing on the server, the error names the server and the discovered models stay visible in the panel.

## 1.3.0

- Per-model native protocol routing (`protocolMode: "auto"`): Claude via Anthropic Messages, GPT/Codex/Grok via OpenAI Responses, others via OpenAI Chat, one `llm-pi-ai` route per protocol; the default model follows its route.
- Per-model protocol override and fixed protocol mode.

## 1.2.0 and earlier

- Auto-discovery of CLIProxyAPI, model selection filter, per-model parameter editor, credentials-service key storage, `/cpa-status` and `/cpa-refresh`.
