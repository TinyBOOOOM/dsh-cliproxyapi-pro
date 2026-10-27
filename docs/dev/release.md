[Back to AGENTS.md](../../AGENTS.md)

# CI and release

- `ci.yml` runs `npm run check` and `npm pack --dry-run` on Ubuntu and Windows with Node 22 and 24 for pushes to `main` and pull requests. Keep `npm run check` green before pushing.
- `release.yml` runs on a pushed tag `v<version>`, or by hand for an existing tag (`gh workflow run release.yml -f tag=v<version>`): it fails unless the tag equals `package.json` `version`, runs the checks, creates a GitHub Release whose notes are that version's `CHANGELOG.md` section, attaches `dsh-cliproxyapi-pro-<version>.tgz` and the version-free `dsh-cliproxyapi-pro.tgz`, and runs `npm publish` through **npm trusted publishing** (OIDC, `id-token: write`; provenance is attached automatically).
  Each step is idempotent (an existing Release or an already-published npm version is skipped), so re-running finishes a partial release.
- Stable releases publish to npm `latest`; Beta and Dev prereleases use `beta` and `dev` and are marked as GitHub prereleases. A prerelease must never replace `latest`. Maintain the channel mapping consistently with updater dist-tags.
- **No npm token exists anywhere** — not in repository secrets, files, or chats.
  The npm package's Settings → Trusted publishing names GitHub user `TinyBOOOOM`, repository `dsh-cliproxyapi-pro`, workflow `release.yml`, no environment, with `npm publish` allowed;
  Publishing access is "Require two-factor authentication and disallow tokens".
  Renaming `release.yml`, moving the publish step into another workflow, or changing `repository.url` in `package.json` breaks publishing until that configuration is updated on npmjs.com.
  Never reintroduce an `NPM_TOKEN` secret.

## Release checklist

1.
For an actual release, bump `version` in `package.json` and the pinned versions in both READMEs (`dsh-cliproxyapi-pro@<version>` and the `#v<version>` Git target); turn the `Unreleased` notes into a `## <version> — <date>` section of both `CHANGELOG.md` and `CHANGELOG.en.md` (the release workflow publishes exactly the `CHANGELOG.md` section, i.e. the Chinese notes, as the Release notes).
2. `npm run check` passes; `npm run pack:check` lists exactly `lib/index.js`, `lib/client.js` and the `lib/**/*.js` modules, `locale/*.json`, `cordis.patch.yml`, `icon.svg`, `README.md`, `README.en.md`, `CHANGELOG.md`, `LICENSE`, `package.json` (no `src/`, `tests/`, `docs/`, `scripts/`).
3. `locale/*.json` `meta` text still describes the plugin; `icon.svg` renders (≤ 256 KiB).
4.
With user approval, check the Settings panel in both languages and the `/cpa-status` output in a live Harness.
Offline component previews must be labeled and do not substitute for a claimed live test; never install an update merely to capture the UI.
5.
Commit (`type: summary`, e.g. `feat: offline update downloads`, `fix: …`, `docs: …`), push `main`, wait for CI, then `git tag v<version>` and `git push origin v<version>` to trigger the release.
Verify stable/Beta/Dev npm dist-tag and GitHub prerelease classification.
