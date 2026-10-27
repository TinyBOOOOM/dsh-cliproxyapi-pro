[Back to AGENTS.md](../../AGENTS.md)

# Client surfaces, slots and lifecycle

- Source: `src/client/`; committed ModuleLoader output: `lib/client.js`. Run `npm run build:client` after source changes; never edit the output by hand.

- `lib/client.js`: surfaces registered in `apply`.
- `settings.section` renders `CpaSectionPage` → `CpaSettingsPanel`: one account bar (+ `AddAccountForm`, which tests with `accounts/test` before `accounts/add`), then `AccountPanel` keyed by account id with **Connection / Models / Generation / Quota** tabs (`QuotaPanel` with `accountId`, no switcher of its own).
  - The Models tab lists chat models only. **Generation** renders `MediaPanel`: it saves each change at once through `media/save` (outside the account draft and save bar) and hands a re-synced status (returned after a kind change) to `actions.adopt`, which replaces the data without bumping `rev`.
  - Its first two hooks are `data` / `loading` for the test harness.
  - The **Enabled** switch and **Clear Key** call `actions.patch` with one field and never bump `rev`; `actions.save` sends the full draft (without `enabled`) and bumps `rev`.
  - Dirty state = draft vs live `account.config` + selection/overrides + key draft; one sticky save bar; account switches confirm before discarding.
  - Secondary help text uses `InfoTip` (button + `role="tooltip"`), never `title` attributes.
- `conversation.input.right` also holds `${NS}:media` (order 9990, left of the quota badge) and `conversation.hero.options` holds `${NS}:media-hero`: `MediaChip`, the session's **two separate** image- and video-model buttons (picture / camera icon + the model used; each opens only its own kind's menu, grouped by account; no thumbnails; results live in the chat rows).
  - This session's agent rules are a **secondary menu** reached from an "agent generation settings" footer button in either model menu, never mixed into the model lists.
  - Its inject passes only `{ sessionId }`; it loads `media/session` on mount, session change and each open, and retries (3 s, 10 s, then every 30 s) only while the host offers no generation model or reports `catalogIncomplete`, uses its own `mediaChips` presence like the badge, and renders nothing without a generation model.
  - Hooks 0/1 are `data` / `loading`.
- `conversation.chat.commandview` (keyed by command name, owner `{ node: { name, commandId, args, outcome } }`) holds keys `cpa-image`, `cpa-video`, `cpa-video-edit` and `cpa-video-extend` → `MediaCommandRow` → `ImageCommandCard` (kind from the command name / run), drawn as an exchange: a right-aligned user bubble (prompt from the run record, else `splitImageArgs(node.args)`, plus ratio/count/reference tags) and a reply (model · account, status, aspect-ratio skeletons and a timer while running, then the images — click to enlarge, right-click for its own `role="menu"` (position: fixed inside the component): the Host's applications for the file from `fileActions.applications()` (asked once per path when the menu opens; default first, a single "open with the default app" stand-in while loading / empty / failed; icons only via `safeIconSource()`), "show in File Explorer / Finder / Files" named from `media/command`'s `desktop`, then copy image (PNG via `ClipboardItem`, other types re-encoded on a detached canvas), copy path — time and folder label, details with the folder and file names as open links, or the localized error). `fileActions` is created in `apply` from `ctx.get("remote.session")` (the generated Remote namespace is its own service keyed `remote.<namespace>`; `ctx.get("remote")?.session` is undefined, which hid every open item in the first build) — `canOpenWorkspacePath` once per activation (a missing service is asked again later), `workspacePathApplications({ path })`, `openWorkspacePath({ path[, action: "reveal" | application] })`, the calls DSH's document preview uses); the buttons under an enlarged image use the fixed set (default app, file manager, copies); without a desktop the open/reveal items and links are hidden.
  - No `target="_blank"` links: the desktop shell opens them outside the authenticated session.
  - A video row shows tags for length / resolution / first frame, the phase and progress, one 16:9 (or requested ratio) skeleton, then a `<video controls preload="metadata">` with the fixed action buttons below (no "copy image" for videos), plus **Edit video… / Extend video…** while `media/command` reports `actions`: an inline form that runs `/cpa-video-{edit,extend} --from <commandId> [-s N] -- <prompt>` through `runCommand` (created in `apply` from `ctx.get("remote.commands").execute(sessionId, line, [])`, the composer's own call).
  - It loads `media/command?sessionId&commandId` after a successful outcome and polls every 2 s (3 s for videos) while the run is `running` (aborted with its timers on unmount).
  - The tag line ends with a **Copy original input** button (`/<name> <node.args>`, the line as typed).
  - The user side shows only what was asked; the reply's `dcpa-chat-mode` line (`data-mode`) states the mode actually sent (`run.mode`, or for old runs `first-frame` when an image was attached) and, for edits / extensions, the source from `run.sourceKind` (`link` / `upload` / `url`) and `sourceName`.
  - Its inject passes `{ sessionId }`.
  - Every other command keeps DSH's generic row. `mediaConversationDefinition` registers kind `dsh-cliproxyapi-media`, target `chat`, through `ctx.uiConversation.events.register()` inside `ctx.effect`; its renderer uses the same key in `conversation.chat.node`.
  - It starts on durable `tool/call` with name `generate_media`, nonexclusively accepts append `tool/result` updates by call id (unrelated result-only contexts stay invisible), and also renders native PTC calls from `tool/ptc-dispatch-start` / `tool/ptc-dispatch` named `generate_media`, keyed by `subCallId`; a final dispatch can supply a complete row when its start is outside the loaded window.
  - State folds without a global call-id cache.
  - The node preserves `context.key`, start anchor and location, declares `groupTree: "turn"` to exclude both process grouping and whole-turn process folding, and puts owner `{ callId, phase, block }` in `node.data`.
  - Closed-step/turn calls without a result become interrupted rather than poll forever.
  - Its renderer calls `MediaToolRow` with `standalone: true`, reusing `ImageCommandCard` progress, previews and file actions outside thinking. `tool.call.toolview` key `generate_media` remains a compatibility renderer: `MediaToolRow` hides only when `useChat` positively finds the matching custom node in `snapshot.nodes` through its `.data.callId`; it never hides just because `commandRow` says so. `MediaCommandRow` similarly hides positively correlated old mirrored command cards, preserving real slash commands.
  - The tool row parses `argsRaw`, maps the matching command, derives the run id through `toolRunId()`, and passes `pending`, label `generate_media` and no copy button to the card; settled errors become row error text.
  - Chat rows contain no consent controls. `MediaConfirmationDock` is a separate `conversation.composer.dock` list entry: it polls `media/session` every 2 s for the exact bound session's `pendingConfirmations` and posts `{ sessionId, commandId, allow }` to `media/confirm`; native questions never enter this fallback list.
  - Poll timers and requests are cleaned up on unmount/session change, and failed deliveries never grant consent.
  - While the tool is on, `MediaChip` shows an "Agent generation in this session" section (confirmation / limit selects posting to `media/session/save`, and the seconds used); `MediaPanel` has the agent switch, both confirmations and the global limit.
  - Hooks 0/1 are `data` (`{ run, files, folderPath, desktop }`) / `loading`.
- `conversation.input.right` (order 10000; the composer renders this list immediately before the model selector) renders `QuotaBadge`.
  - Its registration `inject(sessionId)` passes a resolver for `modelDirectories.directoryFor(sessionId).store` from ui-model-selection (resolved at render, see below); the badge reads `pending ?? current` `{ provider, model }` and calls `summarizeModelQuota()`, which looks only inside the account whose `routes` contain that provider and only at `modelIndex[model]`.
  - It renders nothing for other routes or when the account has no management key.
  - Its peek is `position: fixed` inside the component (no portal, nothing appended to `document.body`).
- DSH renders `conversation.input.right` only when the session's input state exists (a bound session), but the New Session hero already shows the model selector.
  - A second entry `${NS}:quota-hero` in `conversation.hero.options` renders `QuotaBadge` with `placement: "hero"`; `useBadgePlacement()` hides it while a composer badge for the same `sessionId` is mounted (in-memory `composerBadges` presence counts), so exactly one badge shows.
  - Both entries share `injectDirectory` (`{ resolveDirectory, sessionId }`).
  - DSH caches an entry's `inject()` result per session binding, and `directoryFor()` throws until the session has a scope/binding (page load, host restart, session switch), so inject must never resolve the directory itself (a cached miss hid the badge for good); `useDirectory()` resolves at render and retries (1 s for 30 s, then 5 s) until it exists.
- Every list/keyed slot registration goes through `registerListEntry()`: DSH rejects a duplicate id/key at the same priority, and a hot reload may overlap activations, so it retries one priority lower with the same id/key.
  - Each activation owns its own `<style>` element.
  - Never share DOM/registrations between activations.
- One page-wide `createQuotaStore()` (`sharedQuota`) polls `quota/status` only while subscribed (60 s; 4 s while the host reports `refreshing`) and is disposed with the activation.
  - Consecutive status failures override stale `refreshing` with 60 / 120 / 240 / 300 s backoff; an accepted successful GET or mutation resets it.
  - Account/credential failures show localized automatic-refresh-paused guidance.
- `settings.section` (id `SETTINGS_SECTION_ID` = `cliproxyapi`, like dshmarket's `market` section): `CpaSettingsPanel` owns account server data and notices; `AccountPanel` drafts reload when `rev` changes (save, discard, account switch).
  - It contains no update UI.
  - The section has no icon field; the shell shows its default glyph.
  - Do not patch the nav DOM to add one (dshmarket does; it breaks the "no DOM writes outside the component" rule).
- `plugins.bundle.config` (key = package name; `view: 'summary'` renders nothing) and `settings.plugins.tab` render `PluginUpdatePage`: a short pointer to the account section plus `PluginUpdatePanel` with `initiallyOpen`.
  - Keep account UI off these pages.

- Update polling must never refetch account status or bump `rev`. `PluginUpdatePanel` renders a native `<details>`: the summary is a compact single row (title, current version, short localized status) and everything else lives in the content block.
- It starts closed unless `initiallyOpen`, which passes a constant `open: true` that never changes (React does not rewrite an unchanged prop, so the user can still collapse it).
- Never pass a changing `open` prop or remount the panel on polling/save, so the user's expanded state and the background schedule survive updates.

- `lib/client.js` (dshmarket region): `createMarketUpdater()` is one page-wide client of the market Update API (capability discovery, `POST updates`, operation polling, optional restart) created in `apply` as `sharedMarket` and passed to `PluginUpdatePanel` as `market`; `startAutoInstall()` is the opt-in background runner.
- Both are disposed with the activation.
- The panel renders no market UI when `market` is null (tests/previews).
- New panel hooks go after the existing ones: the test harness seeds hook slots 0/1 as `update`/`loading`.

## Module map

`lib/client.js` is generated: `scripts/build-client.mjs` reads `src/client/manifest.json`, strips each fragment's one-line `@client-source` header, wraps the parts in the ModuleLoader prelude/epilogue, syntax-checks the result and writes LF output. `--check` (run by `npm run check`) fails when the committed file is stale. Fragments share one factory scope and are concatenated in manifest order, so a declaration must come before code that uses it at load time. Dictionary fragments (`i18n/{zh,en}/*.js`) are object-literal bodies and CSS fragments (`styles/*.css`) are template-literal text, both included at build time; `settings/account-panel.part.js` + `account-panel-models.part.js` are one contiguous `AccountPanel` function.

To change the client: edit `src/client/**`, run `npm run build:client`, then `npm run check`, and commit sources and `lib/client.js` together. Never edit `lib/client.js` directly.

| Source | Owns |
|---|---|
| `core/api.js` | React bindings, ids, `API` / `MARKET_API` paths |
| `i18n/zh/*`, `i18n/en/*` | Dictionaries by feature: settings, updates, quota, accounts, media |
| `styles/*.css` | `CSS` by feature: base, updates, tabs, quota, accounts, media, chat, badge |
| `core/helpers.js` | Account draft, request and display helpers |
| `updates/api.js` | Update error codes and isolated update requests |
| `market.js` | `createMarketUpdater()`, `startAutoInstall()` |
| `update-panel.js` | `PluginUpdatePanel`, `PluginUpdatePage` |
| `settings/fields.js` | `InfoTip`, form controls, status summaries |
| `settings/section.js` | `CpaSettingsPanel` |
| `settings/add-account.js` | `AddAccountForm` |
| `settings/account-panel*.part.js` | `AccountPanel` (Connection / Models / Generation / Quota tabs) |
| `settings/page.js` | `CpaSectionPage` |
| `media/helpers.js`, `media/panel.js` | `MediaPanel` and its helpers |
| `quota/helpers.js`, `quota/store.js`, `quota/panel.js`, `quota/badge.js` | `summarizeModelQuota()`, `createQuotaStore()`, `QuotaPanel`, `QuotaBadge` |
| `core/presence.js` | Composer/hero presence, `useDirectory()`, clock hooks |
| `media/chip.js` | `MediaChip` |
| `media/confirmation-dock.js` | `MediaConfirmationDock` |
| `chat/tool-id.js`, `chat/tool-row.js` | `toolRunId()`, `mediaConversationDefinition`, `MediaToolRow` / `MediaCommandRow` |
| `chat/command-helpers.js`, `chat/command-card.js` | `ImageCommandCard` and its helpers |
| `apply.js` | `apply()`: styles, slot registrations (`registerListEntry()`), shared stores, exports |
