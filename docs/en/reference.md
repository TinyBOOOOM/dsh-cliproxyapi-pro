[中文](../zh/reference.md) | English · [Back to README](../../README.en.md)

# Slash commands and HTTP routes

Apart from the generation tool `generate_media` (off by default, see [Images and videos](media.md)), this plugin registers no agent tool and adds nothing to model context. Accounts and models are managed on the **CLIProxyAPI** page in Settings; the slash commands below show and refresh their state.

### Slash commands

- `/cpa-status` — show every account's status (including how many image / video models were recognized).
- `/cpa-refresh` — refresh every account now, including a catalog probe of disabled ones.
- `/cpa-image [-m model] [--aspect ratio] [-n 1-4] prompt` — generate images; with attached images, edit them. See [Generating images](media.md#generating-images-cpa-image).
- `/cpa-video [-m model] [--aspect ratio] [-s 1-15] [-r 480p|720p] prompt` — generate a video; attach one image as the first frame. A submitted video cannot be cancelled. See [Generating videos](media.md#generating-videos-cpa-video).
- `/cpa-video-status` — list this session's video jobs.
- `/cpa-video-edit [--video path | --url link | --from command-id] [-m model] change` / `/cpa-video-extend [same] [-s 2-10] what happens next` — edit / extend any MP4 (an attached video file works too). See [Editing and extending videos](media.md#editing-and-extending-videos-cpa-video-edit-cpa-video-extend).

`/cpa-image` and `/cpa-video*` exist only while **Enable image and video generation** is on in the Generation tab.

### HTTP API

Used by the settings panel. Requires the DSH Web session's authentication; POST accepts only same-origin requests from loopback or trusted hosts.

| Method | Path | Body | Meaning |
|---|---|---|---|
| GET | `/api/dsh-cliproxyapi/status` | — | `{ ok, global, accounts[] }` |
| POST | `/api/dsh-cliproxyapi/refresh` | `{ accountId? }` | Refresh one or all accounts |
| POST | `/api/dsh-cliproxyapi/save` | `{ accountId?, …account fields, apiKey?, clearApiKey?, refreshIntervalSeconds?, probeTimeoutMs? }` | Save an account (the first by default); a body with only global fields saves just the globals |
| POST | `/api/dsh-cliproxyapi/accounts/add` | Optional account fields | Create a disabled account; returns `createdId` |
| POST | `/api/dsh-cliproxyapi/accounts/remove` | `{ accountId }` | Delete an account and its routes |
| POST | `/api/dsh-cliproxyapi/accounts/test` | `{ accountId?, baseURL?, apiKey? }` | Test unsaved connection values without saving or writing routes; a blank `apiKey` uses the account's stored key; never returns the key |
| GET | `/api/dsh-cliproxyapi/updates/status` | — | Read update state without contacting a registry |
| POST | `/api/dsh-cliproxyapi/updates/check` | `{}` | Check the selected channel and region now; a manual check does not trigger automatic downloading |
| POST | `/api/dsh-cliproxyapi/updates/save` | `{ autoCheck?, autoDownload?, autoInstall?, channel?, region? }` | Save only these five update preferences, independently of accounts |
| POST | `/api/dsh-cliproxyapi/updates/download` | `{ version }` | Download the newer version confirmed by the latest check, verify it, and save an offline package without installing |
| GET | `/api/dsh-cliproxyapi/quota/status` | — | `{ ok, quota }`: the cached quota snapshot; only unpaused stale accounts / credentials refresh in the background; account and credential `autoRefreshPaused` flags indicate failure pauses |
| POST | `/api/dsh-cliproxyapi/quota/refresh` | `{ accountId? }` | Start refreshing and return at once; specifying an account retries its paused queries, omitting it skips paused items; `refreshing` is true while work runs |
| POST | `/api/dsh-cliproxyapi/quota/save` | `{ accountId, managementKey?, clear? }` | Store or clear the account's management key and start refreshing its quota; the response never contains the key |
| GET | `/api/dsh-cliproxyapi/media/status` | — | `{ ok, media }`: generation settings and each account's recognized image / video models; no network access |
| POST | `/api/dsh-cliproxyapi/media/save` | `{ enabled? }`, global fields (such as `agentTool`, `outputDir`), or `{ account: { accountId, disabledModels?, kindOverrides? } }` | `enabled` switches generation on / off (registering or removing the generation commands and the agent tool at once); save an account's switched-off media models (replaces the list) or kind overrides (merged per model; `null` restores detection); a kind change re-synchronizes that account and adds `status` to the response. Invalid values return 400 with a code such as `invalid-enabled`, `invalid-account` or `invalid-kind` |
| POST | `/api/dsh-cliproxyapi/media/diagnose` | `{ accountId }` | Read-only diagnostic (see [Images and videos](media.md)); returns `{ ok, diagnostic }` without the key |
| GET | `/api/dsh-cliproxyapi/media/session?sessionId=` | — | `{ ok, session }`: the image / video models to choose from, the current pick and where it comes from (`session` / `last` / `only`), and this session's recent files (names and ids only, no paths); `pendingConfirmations` lists only compatibility requests owned by this exact session when the native question service is absent, as `{ commandId, kind, en, zh, expiresAt }`; native questions never appear in that list; no network access |
| POST | `/api/dsh-cliproxyapi/media/session/save` | `{ sessionId?, kind: "image" \| "video", ref }` | Pick a session's model (`ref` is `accountId/modelId`; `null` clears the session's pick) and remember it as the last pick; a model that is not offered returns 400 `invalid-model`. Alternatively `{ sessionId, videoConfirm?, imageConfirm?, videoBudget? }` (`ask` / `auto` / `inherit`; the limit is `{ mode: "limited", seconds }` / `{ mode: "unlimited" }` / `inherit`) sets this session's agent-generation rules |
| POST | `/api/dsh-cliproxyapi/media/confirm` | `{ sessionId, commandId, allow }` | Answer only a compatibility `generate_media` confirmation beside the composer when the native question service is absent (reads `media/session` every 2 s); not used for native questions and independent of execution-approval permissions. Only the confirmation's exact owning root session can answer; an answered or expired request returns 400 `confirm-expired` |
| GET | `/api/dsh-cliproxyapi/media/file?sessionId=&id=` | — | Serves a generated file the plugin recorded for that session; anything else, or another session, gets 404. Videos are streamed with single `Range` support (206) so players can seek |
| GET | `/api/dsh-cliproxyapi/media/command?sessionId=&commandId=` | — | `{ ok, run, files }`: one command run's record in that session (status `running` / `done` / `error`, model, prompt, ratio, count, number of references, start and end times, a display name for the save folder, error code and summary) and the files it produced (id, name and full path, plus the save folder `folderPath` and the Host's file manager kind `desktop`: `explorer` / `finder` / `filemanager`), so its row in the conversation can show and open them; video records also carry length, resolution, request id, the `mode` (`text` / `first-frame` / `reference` / `first-last` / `last-frame` / `edit` / `extend`) and the source command id, plus `actions: { edit, extend, expiresAt }` (never the link) while it can still be edited or extended; and while running the `phase` (`submitting` / `queued` / `running` / `downloading`) and CPA's `progress`; a run recorded as running that no background job owns (after a reload or crash) is reported as `interrupted` |

Update operation responses use `{ ok, update }`. State includes `currentVersion`, `latestVersion`, `available`, `channel`, `region`, `effectiveRegion`, `autoCheck`, `autoDownload`, `autoInstall`, `checking`, `downloading`, `lastCheckedAt`, `error` / `errorCode`, `blockedReason`, `downloadedVersion`, `downloadPath` and `upgradeCommand`. Fields without a check or download result are `null`. `channel` is `stable` / `beta` / `dev`; `region` is `auto` / `global` / `cn`; `effectiveRegion` is the `global` / `cn` source used by the last successful check (`null` before one).

Failures use a top-level `errorCode` or `update.errorCode`; HTTP status or `ok` alone does not establish success. Common codes include `network-error`, `invalid-metadata`, `channel-unavailable`, `integrity-error`, `invalid-package`, `storage-error`, `busy`, `stale-version`, `service-unavailable`, `forbidden-origin` and `disposed`. Update POSTs still rely on the host's session authentication and trusted-host policy: when a request carries `Origin`, it must belong to the same authority as this listener (host and port compared under the Origin's own scheme, matching the host's own rule), otherwise the response is `forbidden-origin`. The desktop carrier may proxy API calls without an `Origin`; such a request is allowed once the host session authenticates it, while unauthenticated callers are still rejected before reaching the route. Plain unauthenticated `curl` cannot call these endpoints.
