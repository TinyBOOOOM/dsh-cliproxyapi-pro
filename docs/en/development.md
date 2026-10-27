[中文](../zh/development.md) | English · [Back to README](../../README.en.md)

# Development

```text
lib/index.js        Host entry; core logic and apply wiring
lib/host/           Host core
lib/host/apply/     Apply wiring
lib/media/          Media engine (barrel: lib/media/index.js)
lib/quota/          Quota engine
lib/updater/        Update engine
src/client/         Web UI source (ModuleLoader: accounts and plugin updates)
lib/client.js       Committed generated output; never edit by hand
scripts/build-client.mjs Zero-dependency client build script
locale/*.json       Plugin manager title and description
cordis.patch.yml    Bundle patch inserting dsh-cliproxyapi-pro
tests/<area>/       node:test: host, media, quota, updater, client
tests/helpers/      Shared test helpers
.github/workflows/  CI and release (GitHub Release + npm trusted publishing)
assets/screenshots/ README screenshots, listed in screenshots.json for storefronts
docs/zh/, docs/en/  Bilingual user guides
docs/dev/           Developer detail; AGENTS.md is the coding-agent entry
```

<!-- MODULE-MAP: filled in by the coordinator -->

```bash
git clone https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git
cd dsh-cliproxyapi-pro
npm run build:client # rebuild lib/client.js from src/client/
npm test             # run the tests
npm run check        # syntax check + tests
npm run pack:check   # list the files a packed bundle contains
```

`npm run check` runs `node scripts/check.mjs`: syntax-check every `lib/**/*.js` and `scripts/**` file, run `node scripts/build-client.mjs --check` to reject stale generated output, then run `node --test "tests/**/*.test.mjs"`. Tests are grouped into `tests/host/`, `tests/media/`, `tests/quota/`, `tests/updater/` and `tests/client/`, with shared helpers in `tests/helpers/`. Offline update tests cover settings, SemVer, regions, integrity/package structure, HTTP authentication/same-origin policy, and the update card/request lifecycle; they never access the real network or profile. `npm run pack:check` includes `lib/index.js`, `lib/client.js` and the `lib/**/*.js` modules, but not `src/`, tests, docs, scripts or screenshots; no runtime dependencies need installing.

Releasing is a pushed `v<version>` tag: GitHub Actions runs the tests, creates a GitHub Release with the package attached, and publishes to npm through npm trusted publishing (no token involved) with a provenance statement. Stable releases publish to npm `latest`; Beta / Dev prereleases publish to `beta` / `dev` and are marked as GitHub prereleases, without replacing the stable channel. The updater checks registry-provided SHA-512 integrity and package structure only; it does not verify publisher signatures or npm provenance.

Read [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md) before changing code; see [CHANGELOG.en.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.en.md) for history (Chinese: [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)). Issues and pull requests are welcome — when you change the documentation, update both the Chinese and the English README.
