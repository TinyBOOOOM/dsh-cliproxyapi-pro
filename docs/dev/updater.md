[Back to AGENTS.md](../../AGENTS.md)

# Updater and offline update invariants

- `lib/updater/`: `loadUpdateSettings()` / `saveUpdateSettings()` own separate v1 preferences; `parseUpdateVersion()` / `compareUpdateVersions()` implement strict SemVer; `validateUpdateMetadata()` validates channel/package/HTTPS registry metadata; `createPluginUpdater()` owns checks, automatic region racing, candidate generations and abortable downloads; `verifyUpdatePackage()` checks registry-provided SHA-512 integrity and restricted gzip/tar structure without extraction; `storeUpdatePackage()` atomically saves the verified `.tgz`.
- Integrity from registry metadata is not a publisher signature or npm provenance verification.

### Offline update invariants

- Preferences live only in `<profileDir>/.dsh-cliproxyapi/update-settings.json`: `{ version: 1, autoCheck, autoDownload, autoInstall, channel, region }` (`autoInstall` is optional within v1; older files load as `false`).
  - Never merge them into account state or `GLOBAL_FIELDS`.
  - A missing file uses defaults (`autoCheck: true`, `autoDownload: false`, `autoInstall: false`, `stable`, `auto`); unreadable, malformed or invalid settings disable automatic network checks.
  - Reload re-reads preferences; check/candidate/download-notice state is not persisted.
- Automatic checks run about 3 seconds after startup or rescheduling settings, then every 6 hours. `autoDownload` acts only after an automatic check finds a newer version and requires `autoCheck`.
  - Manual check and download remain explicit operations.
  - GET status and UI polling never contact a registry.
- `stable` / `beta` / `dev` map to npm `latest` / `beta` / `dev`.
  - Unpublished channels fail explicitly; never silently fall back across channels or offer a downgrade.
  - Region `auto` races npmjs and npmmirror for the first valid metadata; `global` / `cn` use only their chosen registry.
  - Regions affect plugin updates only, never CPA requests or other installation sources.
- Metadata requests never follow redirects.
  - Package requests follow at most 3 individually validated HTTPS redirects;
  - Global stays on the exact npmjs package path, and China stays on npmmirror or its official `cdn.npmmirror.com/packages/<name>/<version>/<name>-<version>.tgz` path.
  - Never allow arbitrary hosts, credentials, ports, queries, cross-region fallbacks or HTTP downgrades; integrity always comes from the original metadata.
- Validate registry origin/path, package name/version, SHA-512 integrity and bounded gzip/tar structure.
  - Every regular file must be declared by the package's own `package.json` `files` (`packageFilePatterns()`, npm glob semantics) or be a root file npm always packs (`ALWAYS_PACKED`); never reintroduce a hard-coded file list — it makes every future file addition break offline updates for installed versions.
  - Fixed structural rules stay: plain ASCII path segments (no dotfiles, spaces or shell characters), at most 6 segments, no `node_modules`, no empty directories, at most 1000 entries.
  - Reject traversal, links/special entries, dependencies and installation lifecycle scripts.
  - Rejections carry a log-only `detail` (logged through `deps.logger`); the page shows only the localized code.
  - Do not extract or execute the downloaded package.
  - Never describe these checks as publisher-signature or provenance verification.
- Verified packages are atomically written under `<profileDir>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`; users clean up historical files themselves.
  - Never alter installed files, profile dependency declarations, accounts or credentials while preparing a download.
- Normal installations display `dsh plugin --profile 'name' add 'absolute.tgz'` for use only with DSH closed, followed by a restart.
  - Linked installations can check/download but return no upgrade command: keeping the link requires manually updating source; installing an offline package would change its source.
  - Preserve this warning in both dictionaries and docs.
- Market installation: discovery reads only `GET dsh-market/api/v1/capabilities` (local, never a registry) and requires `schema`, `apiVersion: 1` and `features.update`.
  - One-click install needs a version confirmation; `force: true` is offered only manually after `RELEASE_TOO_FRESH` / `VERSION_UNCHANGED`.
  - Show a restart button only when `features.restart` and `restart.supported` are true; otherwise give restart/refresh hints from `outcome`.
  - Report the version the market actually installed and warn when it is below the checked target (the market resolves with its own channel).
  - Never offer market installation for linked installs.
  - Localize market failure codes; never render `failure.message`.
- `autoInstall` acts only in an open Web page, only when the Host status says `autoInstall && autoCheck && available` with no `blockedReason` and a newer `latestVersion`, never forces, and tries a version at most once per 6 hours (localStorage memory; an installed version is never retried).
  - The switch cannot be turned on while the market is not detected, but can always be turned off.
- POST responses can report an operation failure inside `update.errorCode` even with `ok: true`; check both, and localize error codes rather than exposing backend messages/stacks.
  - Requests racing settings changes or unmount must not overwrite newer state.
  - Dispose timers and abort in-flight work on HMR/unmount.

## Module map

`lib/updater/index.js` is the barrel (exactly the former `lib/updater.js` surface). Host wiring is `lib/host/apply/updates.js`.

| Module | Owns |
|---|---|
| `constants.js` | `UPDATE_PACKAGE`, `UPDATE_REGISTRIES`, `UPDATE_TAGS`, `UPDATE_INTERVAL_MS`, `DEFAULT_UPDATE_SETTINGS`, size / entry / path limits, `SAFE_SEGMENT`, `ALWAYS_PACKED`, `REQUIRED_FILES` |
| `errors.js` | `UpdateError` (page code + log-only `detail`) |
| `settings.js` | `normalizeUpdateSettings()`, `loadUpdateSettings()`, `saveUpdateSettings()` |
| `version.js` | `parseUpdateVersion()`, `compareUpdateVersions()` |
| `registry.js` | `validateUpdateMetadata()`, SRI parsing, bounded fetches and validated tarball redirects |
| `verify.js` | `packageFilePatterns()`, `verifyUpdatePackage()` |
| `updater.js` | `createPluginUpdater()`: checks, region racing, candidate generations, downloads, `save()` |
| `store.js` | `storeUpdatePackage()` |
