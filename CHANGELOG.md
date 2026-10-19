# Changelog

All notable changes to this plugin. Versions follow [Semantic Versioning](https://semver.org/).

## 1.4.0 — 2026-10-19

### Added
- **Multiple CLIProxyAPI accounts.** Each account has its own base URL, API key (own credential ref), provider route ID, protocol mode, model selection and per-model overrides, and synchronizes into its own `llm-pi-ai` routes (`cli-proxy-2`, `cli-proxy-2-responses`, `cli-proxy-2-messages`, …).
- **Per-account enable switch.** A disabled account keeps its settings but its routes are removed, so its models leave the picker. New accounts start disabled; a manual refresh still probes them so models can be picked before enabling.
- Settings panel account bar: switch accounts, **+ Add Account**, **Delete Account**, credential-ref field.
- `cliproxyapi` tool: `add_account` and `remove_account` actions, `account`, `enabled` and `apiKeyEnv` parameters; output lists every account.
- HTTP routes `POST /api/dsh-cliproxyapi/accounts/add` and `/accounts/remove`; `refresh` and `save` accept `accountId`.
- `LICENSE`, `AGENTS.md`, `CHANGELOG.md`, `.gitignore`, `.gitattributes`.

### Changed
- `state.json` is now `{ version: 2, refreshIntervalSeconds, probeTimeoutMs, accounts: [...] }`. A v1 single-account file migrates automatically into account `default` with the same routes, key and selection; the original is kept as `state.v1.json`.
- An account with an explicit base URL only probes that URL and never falls back to local `:8317`, the existing route or `CLIPROXYAPI_BASE_URL`.
- Overlapping provider route IDs between accounts are rejected on save; an overlapping account in a hand-edited file is reported as an error and never writes or removes another account's routes.
- Settings writes from concurrent account syncs are serialized.
- `/cpa-status` and `/cpa-refresh` cover every account.
- The DSH version requirement moved to top-level `engines.dsh`, where DSH reads it; `./icon` is exported.

## 1.3.0

- Per-model native protocol routing (`protocolMode: "auto"`): Claude via Anthropic Messages, GPT/Codex/Grok via OpenAI Responses, others via OpenAI Chat, one `llm-pi-ai` route per protocol; the default model follows its route.
- Per-model protocol override and fixed protocol mode.

## 1.2.0 and earlier

- Auto-discovery of CLIProxyAPI, model selection filter, per-model parameter editor, credentials-service key storage, `/cpa-status` and `/cpa-refresh`.
