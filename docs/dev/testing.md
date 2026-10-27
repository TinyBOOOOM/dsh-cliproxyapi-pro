[Back to AGENTS.md](../../AGENTS.md)

# Commands and testing

```powershell
npm run build:client  # rebuild committed lib/client.js from src/client/
npm test              # node --test "tests/**/*.test.mjs"
npm run check         # node scripts/check.mjs: syntax + client freshness + tests
npm run pack:check    # list the files a packed bundle would contain
node --test "tests/updater/*.test.mjs" "tests/host/*.test.mjs" "tests/client/*.test.mjs"
```

Tests fake `fetch`, settings and credentials; they never touch the network or the real profile.
Add a test for every behavior change in `CpaRuntime` / `createCpaController` (see the `multi-account` suite and its `harness()` helper). `tests/updater/*.test.mjs` covers preferences, SemVer/channels, metadata racing, checksum/package validation and lifecycle;
Update-route tests in `tests/host/*.test.mjs` cover update HTTP admission/operations; `tests/client/*.test.mjs` uses a dependency-free VM/Hook harness for update rendering, localization, independent requests, confirmation and cleanup.
For client changes, run `npm run build:client`, then at least `node --check lib/client.js`; a quick server render with any locally available `react` + `react-dom/server` is optional (patch `React.useState` before evaluating the module, because the client destructures hooks at load time).
Do not install React just for validation.

Tests live under `tests/<area>/*.test.mjs`: `host`, `media`, `quota`, `updater`, `client`; shared fixtures belong in `tests/helpers/` and must not end in `.test.mjs`. `npm run check` syntax-checks every `lib/**/*.js` and `scripts/**` file and runs `node scripts/build-client.mjs --check` before tests.

<!-- MODULE-MAP: filled in by the coordinator -->
