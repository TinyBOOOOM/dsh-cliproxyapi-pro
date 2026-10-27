[Back to AGENTS.md](../../AGENTS.md)

# Documentation rules

- User-facing docs exist in two languages: `README.md` (中文 — the default, shown on GitHub and npmjs.com) and `README.en.md` (English).
  Any change to one — features, tables, examples, install steps, versions — goes into the other in the same commit.
  Each starts with the `中文 | English` switcher.
  Detailed guides in `docs/zh/` and `docs/en/` have identical filenames and section structure; keep them synchronized in the same commit, with a counterpart switcher and README backlink. `docs/dev/` and `AGENTS.md` are English-only developer references.
- Both READMEs are rendered on npmjs.com too, so images and file links use absolute `https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/...` / `https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/...` URLs, never relative paths.
- Install instructions describe only verified paths: the DSH **Plugins → Add plugin** dialog (package name, optional `@version`), the agent's `plugin_manager install_bundle` with target `dsh-cliproxyapi-pro`, `dsh plugin --profile <name> add dsh-cliproxyapi-pro` (installs from npm and adds the bundle to `dsh.profile.bundles` in one step), and Git / tarball / local-path targets.
  Re-verify after DSH changes its plugin manager.
  Offline update commands use `dsh plugin --profile 'name' add 'absolute.tgz'` only after DSH is closed.
- `AGENTS.md` is English only.
  The changelog exists in two languages like the READMEs: `CHANGELOG.md` (中文 — the default, shipped in the npm package and used for GitHub Release notes) and `CHANGELOG.en.md` (English, repository only).
  Every entry goes into both in the same commit, with the same `## <version> — <date>` headings; each starts with the `中文 | English` switcher (absolute GitHub URLs).
  Keep work-in-progress notes under `Unreleased`; do not bump a version or existing README pins unless a release is requested.
- Adding a shipped file: list it in `files` and that is enough for installs whose updater already follows `files` (1.7.0 and later).
  Installed 1.5.0–1.6.0 updaters still use the old fixed allowlist and reject a package with any file outside it (the built-in offline download only; dshmarket, the Plugins page and `dsh plugin add` are unaffected).
  So wait at least one release after the `files`-based verifier before shipping a file outside the old list (`CHANGELOG.en.md` is repository-only until then), and mention in the CHANGELOG that 1.5.0–1.6.0 users should update through the market or npm once.
- Describe only behavior the code has; the community plugin list checks descriptions against the source. Distinguish automatic downloading from automatic installation, and integrity checks from authenticity verification.
- Screenshots live in `assets/screenshots/` and are referenced by both READMEs and by `screenshots.json` (1–8 relative paths, read by plugin storefronts such as dsh-market).
  They are not shipped in the npm package.
  When the panel changes visibly, retake them, keep them free of real keys, server URLs and private data, and keep the captions in both READMEs accurate.
  Currently `connection.png`, `model-filter.png`, `generation.png`, `quota.png`, `quota-key-stopped.png`, `quota-badge.png` and `add-account.png` are labelled offline component renders (the first five re-rendered for the generation master switch and the key-failure limit with React 19 production builds and headless Edge; `quota-badge.png` and `add-account.png` are older renders of unchanged surfaces) (the real `lib/client.js` bundled with React and rendered in headless Edge with `example.com` sample data and approximate dark-theme tokens); `updates.png` (the Built-in plugins update tab) is a live 1.6.0 capture supplied by the maintainer.
  Prefer live captures when the maintainer supplies them.
  If a screenshot is ever replaced by an offline component render, label it as such in both READMEs.

Detailed user guides are GitHub-only and may use relative document links, but screenshot images still use absolute raw URLs.
README links, including section links, must be absolute for npm rendering.
Repair old intra-README anchors when moving sections.
