[Back to AGENTS.md](../../AGENTS.md)

# Full invariant list

- An account owns exactly `managedRouteKeys(provider)` = `provider`, `provider-responses`, `provider-messages` under `llm-pi-ai.providers`.
  - It never writes or unsets keys in `config.reservedKeys` (other accounts' keys).
  - An account in conflict owns nothing and only reports an error.
- The base key (`provider`) always carries OpenAI Chat models so existing sessions and `agent-default-model` keep resolving; `followDefaultModel()` moves the default when protocol routing relocates its model.
- Disabled ⇒ the account's routes are removed, settings kept. Periodic refresh never probes disabled accounts; a manual refresh (`probe: true`) may, to list models.
- An explicit `baseURL` is the only candidate (`autoDiscover: false`); fallbacks (existing route URL, `CLIPROXYAPI_BASE_URL`, local `:8317`) apply only when `baseURL` is empty.
- Account ids are stable; renaming `provider` releases the old keys on the next sync. Removing an account tears down its runtime and unsets its routes but keeps its stored credential.
- Re-syncing unchanged data performs **zero** settings writes (diff via `sameJson`). User-set fields on managed routes (e.g. `retryPolicy`) survive; only `MANAGED_ROUTE_FIELDS` are replaced.
- `selectedModels` absent means "never chosen": the first successful probe seeds `recommendModels()` (newest per family, from that server's catalog) exactly once via `seedSelection`. `[]` is an explicit choice meaning "all models".
  - Never ship hard-coded model ids as defaults — catalogs differ between servers.
- **At most one agent tool, `generate_media`, off by default.** It is registered only while `media-settings.json` `agentTool` is on, the generation master switch (`enabled`) is on, and an enabled account offers an enabled generation model (`syncAgentTool()` after every POST route, refresh and `/cpa-refresh`); otherwise no tool exists and no context is used.
  - Its definition is static (`GENERATE_MEDIA_TOOL`, compact, no model or account lists).
  - Optional arguments accept `null` so Responses strict schemas can express defaults; `parseToolArgs()` also accepts legacy empty optional strings, video `count: 1` and `first-frame` with no images as neutral defaults, without guessing a model, batching videos or inventing an image.
  - The tool description and the `prompt` parameter require the user's prompt verbatim and forbid expanding it into a longer scene description or adding unrequested camera / lighting / style / character / environment details.
  - Account management, quota and updates are never exposed as tools (the former `cliproxyapi` tool cost ~3K tokens in every session). `apply()` injects `tools` only for this (asserted in the Host tests under `tests/host/`).
- Image / video models (effective kind ≠ chat) never enter `llm-pi-ai` routes, recommendations or seeded selections; a saved `selectedModels` naming one is kept as is.
  - Media preferences never go into `state.json` or `GLOBAL_FIELDS`; a damaged `media-settings.json` loads as defaults and is kept as `*.corrupt-*.json` on the next save.
  - The diagnostic stays read-only (GET only, no generation, no upstream-spending probe) and never returns the key.
  - Generation runs only on an explicit user action (`/cpa-image`, `/cpa-video`, `/cpa-video-edit`, `/cpa-video-extend`, the row buttons that run them, or a `generate_media` call while the user has switched the tool on), calls only the chosen model's account, never retries on another account, never overwrites a file, and never puts keys, upstream URLs or response bodies into results, logs or session files. xAI's result URL may live only in memory for edit / extend and never in files, logs or page data.
  - A submitted video cannot be cancelled: never claim otherwise, never resubmit a job automatically, and download only through CPA's content route.
  - Video jobs keep no keys or URLs, resume after a reload only within `VIDEO_JOB_TTL_MS`, and a dispose never records a paused job as failed.
  - Manual `/cpa-video` (and every slash command or row button) neither asks for approval nor counts against a budget (design D6).
  - The agent tool asks whenever the effective confirmation is `ask`, independently of DSH execution-approval permissions: `askNativeConfirm()` calls `ctx.userQuestions.ask({ agent: rootAgentOf(exec.agent), signal, questions })` with no `wait` or `callId`, so the live root session's native composer owns the pending question instead of a continued tool card.
  - The question and options are bilingual (`Allow / 允许`, `Decline / 拒绝`); only the single exact Allow selection for the expected question id, without custom text, grants consent.
  - It never calls `approval.request` or interprets the full-access preset as cost consent.
  - A 10-minute deadline, tool abort/disable or plugin dispose cancels the question and refuses consent; malformed answers, unavailable answerers and native errors fail closed and never switch to fallback.
  - Only when `userQuestions` is absent does `pendingConfirms` own an in-memory compatibility request for the live human root session, including calls made by its subagents (not the child session): `sessionView().pendingConfirmations` exposes `{ commandId, kind, en, zh, expiresAt }` only for that session, and `MediaConfirmationDock` answers through `POST media/confirm` from the same session.
  - No chat row owns consent controls.
  - It never treats a non-grant as allowed, counts every agent video's seconds on the root session (also when confirmed), refuses over the limit only in `auto`, refunds only when the run ended without a request id and with a not-submitted error code, and restarts the count when the limit changes or confirmation turns from `ask` to `auto`.
  - The only host event the plugin emits is `api-session/status` for a session with a running generation job, and it always settles it back to idle (unless the agent runs) when the jobs end or the plugin is disposed.
- `state.json` is re-read on every access so hand edits apply; always write the normalized shape (`version: 2`). Format changes need a migration in `normalizeState()` plus a test, and must keep a v1 file loading losslessly.

## Offline updates

The complete offline-update invariant list is in [Updater](updater.md#offline-update-invariants).
