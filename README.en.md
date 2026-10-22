# dsh-cliproxyapi-pro

[中文](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/README.md) | English

[![npm](https://img.shields.io/npm/v/dsh-cliproxyapi-pro?label=npm)](https://www.npmjs.com/package/dsh-cliproxyapi-pro)
[![CI](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)

**Bring the models of [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) into the model picker of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).**

Enter a server URL and an API key, and the plugin reads the CPA model catalog and synchronizes the models you check — with their context window, image input and reasoning levels — into DSH, each over the protocol that suits it best. Connect several CPA accounts at once and enable or disable each one on its own.

- **Multiple accounts**: each account has its own URL, key, model selection and parameters, and can be switched off at any time.
- **Works out of the box**: on the first connection, the newest model of each family in that server's own catalog is checked (at most 12), so the picker isn't flooded with hundreds of models.
- **Native protocols**: Claude over Anthropic Messages, GPT / Codex / Grok over OpenAI Responses, everything else over OpenAI Chat — fewer protocol translations inside CPA.
- **Visual management**: check models and edit per-model parameters in the settings panel. The plugin registers no agent tool, so it takes no model context.
- **Plugin updates**: automatically check Stable / Beta / Dev channels and choose global / Mainland China sources. With the [DSH plugin market (dshmarket)](https://github.com/dsh-market/dsh-market) installed, new versions install in one click or automatically; otherwise download a verified offline package and upgrade with DSH closed.
- **Secure**: API keys live only in the DSH credentials service, never in configuration files.
- **Zero dependencies**: no npm dependencies and no build step; installs in seconds.

Works with DSH `0.2.0-rc.1` and later (desktop and web).

## Contents

- [Installation](#installation)
- [Getting started](#getting-started)
- [Screenshots](#screenshots)
- [Features in detail](#features-in-detail)
- [Updating this plugin](#updating-this-plugin)
- [Slash commands and HTTP routes](#slash-commands-and-http-routes)
- [Storage and configuration](#storage-and-configuration)
- [Upgrading and uninstalling](#upgrading-and-uninstalling)
- [FAQ](#faq)
- [AI installation guide](#ai-installation-guide)
- [Development](#development)
- [License](#license)

## Installation

The plugin is published on npm as [`dsh-cliproxyapi-pro`](https://www.npmjs.com/package/dsh-cliproxyapi-pro) and is also available from the China mainland mirror (npmmirror). Pick any one of the methods below.

### Option 1: the DSH Plugins page (recommended)

1. Open DSH and click **Plugins** in the left sidebar.
2. Click **Add plugin** at the top of the page.
3. Enter the package name:

   ```text
   dsh-cliproxyapi-pro
   ```

   To pin a version, write `dsh-cliproxyapi-pro@1.7.0`.
4. Click **Install**. When it finishes, the dialog offers to enable the plugin right away — accept it.

> If downloads are slow in mainland China, open **Registry** next to the input and choose **the mainland China mirror**.

### Option 2: ask the agent in DSH

Just say in a DSH conversation:

```text
Install the DSH plugin dsh-cliproxyapi-pro
```

The agent installs and enables it with `plugin_manager` (depending on your permission settings, it may ask for your approval). Then ask it to configure the plugin, e.g. "set the CLIProxyAPI URL to http://127.0.0.1:8317 with key sk-…".

### Option 3: command line

```bash
dsh plugin --profile <profile name> add dsh-cliproxyapi-pro
```

This downloads the plugin from npm and adds it to the profile's enabled plugins in one step. The DSH desktop profile is usually called `desktop`; if DSH is running, restart it to load the plugin.

### Option 4: from GitHub (without npm)

In **Add plugin**, or as the `plugin_manager` `target`, you can also enter:

| Source | What to enter |
|---|---|
| A released version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.7.0` |
| Latest development version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| Offline package | Download [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz) (always the latest release) and enter its absolute local path |
| Local source (development) | Absolute path of a cloned repository; installed as a link, so code changes go live when the plugin reloads |

All versions are listed under [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases).

## Getting started

1. **Open the settings panel**: **Settings** → the **CLIProxyAPI** page in the left navigation (accounts, models and protocols live there). The plugin's own updates are on sidebar **Plugins** → **CLIProxyAPI** and on **Settings** → **Built-in plugins** → the **CLIProxyAPI** tab; those two places contain only update features.
2. **Add an account**: click **+ Add Account**, enter an account name, the **Base URL** (e.g. `http://127.0.0.1:8317`, without `/v1`) and the **API Key** (leave it empty for a local CPA without authentication), then click **Connect**. A successful connection creates and enables the account; on failure the reason is shown so you can fix it, or choose **Add Anyway (Disabled)**.
3. **Choose models**: the account's **Models** tab lists every model on the server, with the newest model of each family already checked. Adjust the selection and click **Save & Apply** at the bottom.
4. **Use them**: open the model picker in a conversation; the models appear in a group named after the account.

If CPA runs on this machine on the default port `8317` without a key, there is nothing to fill in: the plugin finds it automatically.

## Screenshots

The panel follows the DSH display language; the screenshots show the Chinese UI. Images 1–5 are offline component renders: this plugin's real UI code with sample data (`example.com` addresses, fictional accounts) rendered in a browser, with colors approximating the DSH dark theme; the real colors follow your DSH theme. Image 6 is an actual capture of 1.6.0 in the DSH desktop app.

**1. Accounts and connection.** The **CLIProxyAPI** page in the Settings dialog's left navigation: one account bar for all tabs; under the account title are the connection state, address and model count, with the **Enabled** switch (applies at once) and the **⋯** menu (**Probe & Refresh**, **Delete Account**) on the right. The **Connection** tab has one row per setting, **Test Connection** next to the address (uses the values being edited, saves nothing), and secondary explanations in ⓘ tips.

![Account bar, account header and Connection tab (offline render)](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/connection.png)

**2. Models and one save bar.** The **Models** tab lists every model on that CPA: All / Checked / Unchecked, family filter, search, bulk actions and **Reset to Recommended**; checked models show the protocol they will use and can be edited with **Edit Parameters**. Connection and model edits are tracked together, and a bar at the bottom shows **Unsaved changes · Discard / Save & Apply**.

![Models tab with the save bar (offline render)](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/model-filter.png)

**3. Quota.** The **Quota** tab: management key, quota data and refresh, a distribution bar, credentials grouped by channel (plan, prefix, status, 5-hour / daily / weekly meters with reset times; Devin shows its daily / weekly quota, shared by every Devin model; channels without a quota endpoint show status and recent requests only), and an expandable "Model → Channel" table. The tab label shows the lowest remaining quota among the account's usable credentials.

![Quota tab: distribution bar and per-channel credential quota (offline render)](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/quota.png)

**4. Quota in the composer.** The badge left of the model selector shows the best remaining quota among the usable credentials serving the current model; clicking it lists every such credential with its quota windows. It appears only for models this plugin synchronizes whose account has a management key.

![Quota badge next to the model selector with its peek (offline render)](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/quota-badge.png)

**5. Adding an account.** Enter a name, address and API key and click **Connect**: it tests first and creates an enabled account only when that works; on failure the reason is shown and **Add Anyway (Disabled)** is offered.

![Add account form (offline render)](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/add-account.png)

**6. The plugin update page under Built-in plugins** (actual 1.6.0 capture). **Settings** → **Built-in plugins** → the **CLIProxyAPI** tab holds only plugin updates: checking and offline download, **Update Now** once the DSH plugin market is detected, the update channel, the download region, and the automatic check / download / install switches. Here the plugin is already the latest Stable version, so **Update Now** is disabled.

![The CLIProxyAPI update page under Built-in plugins: version status, plugin-market update, channel, region and automatic switches](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/updates.png)

## Features in detail

### Discovery and synchronization

- The base URL can be local or remote; suffixes such as `/v1`, `/v1/chat/completions` and `/v1/messages` are stripped.
- With an empty URL, the plugin tries, in order: the existing route's URL, the `CLIPROXYAPI_BASE_URL` environment variable, and local `127.0.0.1:8317`.
- The enriched catalog comes from `/v1/models?client_version=pi` (standard OpenAI `data[]` catalogs work too); `owned_by` from `/v1/models` identifies each model's family and its `type` marks image models.
- Image and video models are never written to chat routes; see [Image and video models](#image-and-video-models-the-generation-tab).
- All accounts refresh on a shared interval (300 s by default); an unchanged catalog writes no settings.

### Model selection

- Search, family chips, All / Checked / Unchecked tabs and bulk selection. **Only checked models appear in the model picker**; an empty selection shows all of them.
- Include / exclude keyword rules filter further.
- An account that has never saved a selection gets the newest model of each family checked on its first successful probe (at most 12), computed from that server's own catalog; **Reset to Recommended** restores that set at any time.

### Per-model overrides

**Edit Parameters** on a checked model sets its context window, max output, image input, thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) and request protocol, each resettable to the discovered value.

### Multiple accounts

- Each account writes its own set of routes: the first account uses `cli-proxy` / `cli-proxy-responses` / `cli-proxy-messages`, later ones `cli-proxy-2*`, `cli-proxy-3*`, …; credential refs are `CLI_PROXY_API_KEY`, `CLI_PROXY_API_KEY_2`, …. The model picker groups models by account name.
- **Disabling** an account keeps its settings but removes its routes, so its models leave the picker; other accounts are unaffected.
- **New** accounts: **+ Add Account** first tests the entered URL and key and creates an enabled account only when that works; **Add Anyway (Disabled)** is also offered.
- Each account page has **Connection / Models / Generation / Quota** tabs under one shared account bar. The **Enabled** switch next to the account title applies at once; the **⋯** menu holds **Probe & Refresh** and **Delete Account**.
- Connection and model changes are tracked together; a bar at the bottom shows **Unsaved changes · Discard / Save & Apply**, and switching accounts asks before dropping unsaved changes. **Test Connection** probes the address and key being edited without saving anything.
- Secondary explanations live in ⓘ tips next to the labels (open on hover, keyboard focus or click).
- An account with a base URL **only connects to that URL** and reports an error when it is unreachable; it never silently falls back to local `:8317`, so two accounts cannot end up on the same server.
- Provider route IDs of different accounts must not overlap; conflicting changes are rejected.
- **Deleting** an account removes its routes but keeps its key in the credentials service.

### Protocol routing

CPA serves every model on OpenAI Chat, OpenAI Responses and Anthropic Messages, translating when the entry protocol differs from the upstream one. The default auto mode sends each model over its upstream's own protocol:

| Model family (from `owned_by` and the model id) | Protocol | Route (for `cli-proxy`) |
|---|---|---|
| Claude (including `devin/claude-*`, Antigravity Claude) | Anthropic Messages `/v1/messages` | `cli-proxy-messages` |
| OpenAI / Codex / GPT, xAI Grok | OpenAI Responses `/v1/responses` | `cli-proxy-responses` |
| Gemini, DeepSeek, Kimi, GLM, SWE, gpt-oss, … | OpenAI Chat `/v1/chat/completions` | `cli-proxy` |

- DSH custom routes cannot speak Gemini's native `generateContent`, so Gemini uses OpenAI Chat.
- A DSH route has a single protocol, so models are split across the three routes; a route left without models is removed. When the default model moves to another route, `agent-default-model` follows it.
- Claude 4.6+ / 5.x / Fable use adaptive thinking (`effort`); older Claude models use a token budget.
- Switch to one protocol for every model, or set a protocol per model under **Edit Parameters**.
- Other fields you add to a managed route by hand (such as `retryPolicy`) are kept.

### Channel quota (the "Quota" tab and the composer badge)

Each account's **Quota** tab (next to **Connection**, **Models** and **Generation**) shows that account's channel quota; the tab label shows the lowest remaining quota among its usable credentials.

- **Management key**: on an account's Quota tab, enter its CPA management key (`remote-management.secret-key` in the CPA config; a remote CPA also needs `remote-management.allow-remote`). It is stored in the DSH credentials service under `CLI_PROXY_MANAGEMENT_KEY` for the first account and `CLI_PROXY_MANAGEMENT_KEY_<ACCOUNT_ID>` for the others (for example `CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2`); it is never written to `state.json`, settings or logs, and never sent back to the page.
- **Read by the Host**: the Host reads every credential on that CPA (`/v0/management/auth-files`), the models each credential serves, and the upstream quota through `/v0/management/api-call`: Codex, Claude, Antigravity, Gemini CLI, Kimi (including Kimi International, kimi.ai), xAI, Devin and Meta. Channels provided by CPA plugins (credentials marked `supports_quota`) use CPA's own `/v0/management/quota/fetch` instead. Devin's daily / weekly quota belongs to the whole account, so every `devin/…` model shows the same windows. Meta's quota endpoint needs the `dca_token` from the credential file; the Host reads it through the management API for each query, uses it for that one request only, and never stores or logs it. API-key channels (OpenAI-compatible, Gemini / Claude / Codex API keys) and Vertex have no quota endpoint (CPA's own panel shows none either) and show their status and recent request counts only; paid xAI accounts expose no quota counters either (CPA's panel probes them with a real chat request; this plugin does not, so background refreshes never cost money).
- **Quota tab**: laid out as flat rows like the native DSH settings pages: management key, quota data and refresh, a distribution bar (healthy / low / exhausted / off or failing), credentials grouped by channel (plan, prefix, status, 5-hour / weekly / monthly / daily meters with reset times; problems and the least remaining first), channel filter (search when there are many credentials), and an expandable "Model → Channel" table showing which credentials each picker model is matched to.
- **Composer badge**: a small badge left of the model selector (signal bars + percentage) shows the best remaining quota among the usable credentials serving the selected model; click it for every credential's windows. It appears only for models this plugin synchronizes whose account has a management key; without a key there is no badge. On the New Session page (before the composer takes over the session) the badge sits at the right end of the workspace row above the input box.
- **Exact matching**: credentials are looked up only in the account the selected route belongs to (`cli-proxy*`, `cli-proxy-2*`, …); a prefixed model (such as `devin/claude-opus-5-5`) matches only credentials with that prefix; a bare id (such as `claude-opus-5-5`) prefers un-prefixed credentials, so the Claude and Devin channels never mix. Per-model-group windows (for example Antigravity) count only the group that fits the current model.
- **Troubleshooting**: `/cpa-status` includes a quota summary: each account's key state, quota state, credential count, and which credentials each picker model maps to with its remaining quota (never the key).
- **Refreshing**: results are cached on the Host for 5 minutes; stale accounts refresh in the background only while a page is asking, or on **Refresh Quota**. A rejected management key (401/403) pauses that account's automatic refresh until the key changes or you refresh manually, so CPA's bad-key protection is not triggered.

### Image and video models (the "Generation" tab)

CPA serves image and video generators (such as Grok Imagine) through `/v1/images/*` and `/v1/videos/*`. They cannot chat, so the plugin recognizes them and keeps them out of the chat model picker.

- **Recognition**, in order: a kind you set on the Generation tab; the catalog's `type` (`openai-image` is an image model) or output modalities (image-only output is an image model, video output a video model); the model families CPA routes to its image / video handlers, matched by prefix: ids starting with `grok-imagine-image` or `gpt-image-` are image models, ids starting with `grok-imagine-video` and `sora-2*` are video models. Everything else is a chat model (for example `gemini-3.1-flash-image`: CPA serves it only through chat, and DSH cannot show images returned in a chat reply). A media model that only the plain `/v1/models` listing carries is included too. A catalog may list variants CPA's generation endpoints do not accept yet (for example `grok-imagine-video-1.5-lite`); they cannot chat either, so they count as media models, and generating with one shows CPA's error.
- **Not in the model picker**: media models are written to no chat route and take no part in the first-run recommendation; an older selection that names them does not synchronize them (the selection itself is kept). The Models tab lists chat models only.
- **The Generation tab** (next to Connection / Models / Quota) lists "Image models" and "Video models"; changes are saved at once. A switch decides whether each model is offered for generation (models that appear later start switched on), and a kind menu changes it to image / video / chat; a kind you set can be reset to the detected one. A model detection missed can be marked under "Mark another model as a media model". Changing a kind re-synchronizes that account's routes immediately. `sora-2*` is labelled "→ grok-imagine-video": CPA rewrites it to the Grok video model.
- **Read-only diagnostic**: **Run diagnostic** sends GET requests only: it reads both model catalogs with the account's key and lists media-looking entries with descriptive fields such as `type` and modalities, then probes `GET /v1/videos/{id}` and `GET /openai/v1/videos/{id}/content` **without the key** (a route that exists answers 401 at once; a missing one gets CPA's 404). It generates nothing and spends no quota; if CPA does not require a key, the probe looks up one nonexistent job id, which is still read-only. The result can be copied and never contains the key.
- **Save location**: the bottom of the Generation tab sets where generated files go (default `generated`); a relative path is resolved against the session's working directory, an absolute path also works. Shared by all accounts.
- **Video defaults**: when the account has video models, the Generation tab sets the default length (1–15 s, default 6 s) and resolution (480p / 720p, default 720p) of `/cpa-video`; shared by all accounts, saved at once.

#### Generating images (`/cpa-image`)

Type in the composer:

```text
/cpa-image a ginger cat on a neon street on a rainy night
/cpa-image -m quality --aspect 16:9 -n 2 a ginger cat on a neon street on a rainy night
```

- **Options** (before the prompt): `-m <model>` picks a model for this run — a full `accountId/modelId`, a model id, or a fragment that matches exactly one model (such as `quality`); several matches are an error that lists them, never a guess. `--aspect <ratio>` is one of `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `9:20`, `20:9`. `-n <1-4>` sets the number of images. They can also be written as separate words at the start or end of the prompt (split by spaces or commas): `16:9`, `portrait` / `竖屏` (9:16), `landscape` / `横屏` (16:9), `square` / `方形` (1:1), `2 images` / `2张`, e.g. `/cpa-image 2张 portrait a ginger cat`; an explicit option such as `-n` wins. Everything after `--` is prompt text.
- **Editing**: attach 1–4 images in the composer and run the command; it then uses CPA's `/v1/images/edits` with the images as references (about 1.4 MB in total). Only image attachments are accepted. Attached images travel base64-encoded inside the request, and upstreams cap the request size (about 2 MiB; xAI answers "Failed to read request body: length limit exceeded"), so an oversized image is shrunk first: the plugin re-encodes a PNG as JPEG itself (transparent parts on white, long edge at most 1280), and asks DSH's attachment service for a smaller version of other formats; if it still does not fit, the command fails right away.
- **Saving**: files are written to the save location under the session's working directory, named like `20261022-133000-grok-imagine-image-a-ginger-cat-on-a-neon-s.png` (the first 24 characters of the prompt); an existing file is never replaced, a number is appended instead. The working directory must be a local folder.
- **After you submit**: the command checks the options, model, save folder and references, then returns at once, so the composer clears right away; the generation continues in the background. Meanwhile the workspace session list shows the session as running, and as completed if it finishes while you are in another session. DSH itself counts only agent turns as running, so during a generation the plugin sends DSH's own session status event (`api-session/status`) and repeats it every 5 seconds. During a generation the composer shows a Stop button that cannot stop it (the upstream cannot cancel either); just keep sending messages, the agent answers as usual. Reloading the plugin or closing DSH interrupts a running generation.
- **Result**: the `/cpa-image` row in the conversation reads like an exchange: on the right, a bubble with your prompt (ratio, count and reference images noted below it); on the left, the reply: model and account, the status, placeholders in the requested ratio with a timer while generating, then the images (one image at its own ratio, several as square thumbnails); click one to enlarge it. Below are the time taken and the save folder (relative to the working directory, or the folder's name); **Details** expands the full folder path and the file names (click to open them with the system) and, when the upstream rewrote the prompt, the revised prompt; a failure shows its reason in red. Earlier runs show their images too, as long as the files exist and their records were not pushed out (the last 48 runs and 48 files per session are kept). The images are only shown on the page; they are never sent to the chat model.
- **Image actions**: right-click an image for a menu listing the applications on this computer that open it (the default application first and marked "(default)", like the Open menu of the document preview), then **Show in File Explorer** (**Show in Finder** on macOS, **Show in Files** on Linux), then **Copy image** and **Copy file path**. Under an enlarged image, buttons offer **Open with default app**, the file-manager item and both copy actions. Opening and showing the location go through DSH's own session interface (the same as the document preview; DSH re-verifies the path), and are hidden when DSH cannot open local paths; Copy image always puts a PNG on the clipboard (other formats are converted first).
- **Request details**: one `POST /v1/images/generations` (or `/edits`) to the CPA of the model's account, with only that account's address and key and no retry on another account; it asks for `b64_json`. When CPA returns a link instead, the plugin downloads it: only `data:` or HTTPS links, at most 32 MiB per image, and the download carries no key. It waits at most 3 minutes. Failures show a short CPA error summary (truncated, links removed). Generating images spends that account's upstream quota.

#### Generating videos (`/cpa-video`)

```text
/cpa-video waves rolling onto a beach at sunset
/cpa-video -s 8 -r 480p --aspect 9:16 a cat surfing
```

- **Options** (before the prompt): `-m <model>` picks a model for this run (same rules as `/cpa-image`); `-s <1-15>` sets the length in seconds; `-r <480p|720p>` the resolution; `--aspect <ratio>` is one of `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`; without it xAI decides (usually 16:9, or the first frame's ratio). These can also be written as separate words at the start or end of the prompt: `10s` / `10 seconds` / `10秒`, `480p` / `720p`, `16:9`, `portrait`, `landscape`, `square`, e.g. `/cpa-video 10s 480p this character dances`; a word counts only when a space, comma or the end follows it, so "3秒后爆炸" stays prompt text, and words in the middle of a sentence are never read as options. An explicit option such as `-s` wins. Without any, the Generation tab's video defaults apply. Everything after `--` is prompt text.
- **How attached images are used** (images only; oversized ones are shrunk as described under Editing; CPA's video generation route was measured to read only about 1 MiB of request body, so all attached images share about 750 KB and are shrunk beyond that):
  - 1 image: the **first frame** by default (image to video); with `--ref` (or the word `reference`) a **reference**; with `--last` (or `last-frame`) the **last frame**, where the video ends.
  - 2 images: **references** by default; with `--first-last` (or `first-last`) the first is the first frame and the second the last frame, and the model fills in between.
  - 3 or more: **references**, up to 14 on `grok-imagine-video-1.5` and 7 on other video models. References bring in people, clothing or objects without locking the first frame; the prompt can name them in order as `<IMAGE_0>`, `<IMAGE_1>`, ….
  - Pinned first / last frames need `grok-imagine-video-1.5`. The fields follow xAI's docs: `image`, `last_frame`, `reference_images`.
- **Cannot be cancelled**: once submitted, a video cannot be withdrawn (neither CPA nor xAI has a cancel route) and is billed as usual; the composer's Stop button does not stop it.
- **Request details**: one `POST /v1/videos/generations` to the CPA of the model's account (xAI's native format: `model`, `prompt`, `duration`, `resolution`, and optional `aspect_ratio` and `image.url`; `sora-2*` is rewritten to `grok-imagine-video` as CPA does), then `GET /v1/videos/{request id}`: every 5 s during the first minute, every 10 s up to 3 minutes, then every 15 s. The finished video is downloaded through CPA's `GET /openai/v1/videos/{request id}/content` (CPA fetches the file with the credential's own proxy; the plugin never contacts the upstream host), streamed into the save location, at most 200 MiB, MP4 / MOV / WebM only, never replacing a file.
- **Background and resuming**: once submitted, the job is stored in `media-jobs.json`. Reloading the plugin or restarting DSH only pauses the waiting; the next start keeps polling and saves the video. CPA remembers which credential made a video for 3 hours only, so a job still unfinished after 3 hours is marked expired and no longer polled. A run cut off by a reload before CPA returned a request id is marked interrupted (it may have been submitted; there is no way to tell). Meanwhile the session shows as running too.
- **Result**: the `/cpa-video` row reads like an exchange as well (**Copy original input** at the end of the tag line copies the command exactly as typed; a line under the model name in the reply states the mode actually used, e.g. "Mode: references ×3 — brings in the people, clothing and objects shown, without fixing the first frame" or "Mode: first frame — the attached image is the video's first frame", and for edits / extensions where the source came from: an uploaded local file, a public link or a video from this session): on the right the prompt with length, resolution, ratio and first-frame tags; on the left queued / generating progress (a percentage when CPA reports one) / saving with a timer, then the playable video (seeking works); buttons below and the right-click menu open it with another application, show it in File Explorer, or copy its path.
- `/cpa-video-status` lists this session's last 20 video jobs with their state and request id.

#### Editing and extending videos (`/cpa-video-edit`, `/cpa-video-extend`)

```text
/cpa-video-edit make the dress red, keep everything else
/cpa-video-extend 4s she turns and walks out of frame
/cpa-video-extend --from cmd-xxxx-3 -s 6 the camera slowly pulls back
/cpa-video-edit --video "D:\clips\street.mp4" make it a rainy night
/cpa-video-extend --url https://example.com/clip.mp4 -s 4 the camera pulls back
```

- When a video is done, **Edit video…** and **Extend video…** buttons appear below it; write one sentence and submit, and the result appears in a new row below. You can also type the command.
- **Source video** (one of): **attach an MP4 file** in the composer; `--video <path>` (relative to the session's working directory; quote a path with spaces); `--url <public link>` (http/https, downloaded by xAI itself, no size limit); `--from <command id>` (a video the plugin made in this session); without any, the session's newest generated video. A video path also works without `--video`, written at the start or end of the prompt (quoted or with `@` if you like, ending in `.mp4` / `.mov` / `.m4v`), e.g. `/cpa-video-edit D:\clips\a.mp4 make it a snowy night`. Edits and extensions keep the source's resolution and ratio (an edit also its length), so words like `480p`, `16:9`, `portrait` (and `4s` for an edit) at the start or end of the prompt are taken out, not sent to xAI, and shown as ignored in the chat row. `-m <model>` picks whose video model account to use (default: the session's video model; for a video the plugin made, the account that made it).
- **How it works**: xAI's edit (`/v1/videos/edits`) and extension (`/v1/videos/extensions`) take any MP4, as a public link or as base64 data. CPA has no route to xAI's file upload, so a local video travels base64-encoded inside the request (the edit route was measured to read a 20 MiB body, so local videos may be up to 14 MiB; compress or trim larger ones, or use `--url`). For about an hour, a video the plugin made goes by the short-lived link that came with xAI's own result (kept in memory only, never written to a file or log and never sent to the page); after that, or after a reload, the saved file is sent instead, so the buttons stay available while the file exists. Before sending, the plugin reads the length recorded in the MP4 and refuses a source outside the limits below without a request.
- **Limits** (xAI's docs): both use `grok-imagine-video`; an edit needs a source of at most 8.7 s and keeps its length, ratio and resolution (720p at most); an extension needs a 2–15 s source, `-s` sets the added 2–10 s (default 6, or write `4s`), and returns the source plus the new part.
- **When a server lacks a route**: some CPA servers' upstreams have no extension route (one answered HTTP 405 in testing). That run then reads "the upstream does not offer video extension (HTTP 405)", later extensions on the same account are refused without a request and the **Extend video…** button is hidden until the plugin reloads. After a 405, CPA pauses that credential for the model for about a minute.
- Edits and extensions likewise cannot be cancelled once submitted and are billed as usual; background waiting, resuming after a reload and the row's buttons work as for `/cpa-video`.

#### The generation-model button next to the composer

When an image or video model is available, a generation-model button appears in the composer left of the model selector, showing the model used for images (picture icon) and for videos (camera icon).

- Open it to see every enabled model in two groups, "Image models" and "Video models", by account, and switch with one click. **The pick is saved per session** and also becomes your "last pick": a session without a pick of its own (including a new session) uses the last pick.
- `/cpa-image` / `/cpa-video` choose their model in this order: the `-m` model → this session's pick → the last pick → the only available model; with several models and no pick, the command fails and asks you to pick one.
- The button reads its data on load, on a session switch and each time the popover opens; it does not poll in the background. When no generation model is available yet while an enabled account has not read its catalog (for example right after DSH starts), the plugin syncs once during that read; if there is still none, it retries after 3 and 10 seconds, then every 30 seconds until one appears.
- When `/cpa-image` finds no image model while an enabled account has not read its catalog yet, it syncs once before deciding; if there is still none, the error lists each account's state and model counts.

## Updating this plugin

**Plugin Updates** live on the plugin page (sidebar **Plugins** → **CLIProxyAPI**) and on **Settings** → **Built-in plugins** → the **CLIProxyAPI** tab; those places contain only update features, while accounts and models are on the **CLIProxyAPI** page in the Settings dialog's left navigation. On the plugin page the update card starts expanded, with a summary row showing the current version and update status, and can be collapsed at any time. Background checks still follow the saved switches, and polling never resets the expanded state. It manages only `dsh-cliproxyapi-pro`. It does not update the CPA server or DSH, or change CPA routes, accounts or model selections. Update settings save immediately; the card polls independently without reloading unsaved account forms.

> **Installation is handed to the plugin market.** This plugin itself never runs a package manager, uninstalls, overwrites source code, or restarts DSH. With the [DSH plugin market (dshmarket)](https://github.com/dsh-market/dsh-market) installed, the card installs new versions in one click or automatically through the market's public Update API v1. Without the market it can only download and verify an offline package for a manual upgrade with DSH closed.

### Channels, regions and automatic controls

| Setting | Default | Behavior |
|---|---|---|
| Update channel | Stable (`stable`) | Stable / Beta / Dev read the npm `latest` / `beta` / `dev` dist-tags respectively. An unpublished Beta / Dev channel reports an error rather than silently falling back to Stable. |
| Download region | Auto (`auto`) | Auto races global npmjs and Mainland China npmmirror, selecting the first source with **valid version metadata**. Global (`global`) uses only `https://registry.npmjs.org`; Mainland China (`cn`) uses `https://registry.npmmirror.com` and its official `cdn.npmmirror.com` package host. The offline package uses the selected source, with at most 3 HTTPS redirects validated against the host allowlist and exact package/version path; it never falls back across regions. |
| Automatically check for updates | On | Check about 3 seconds after plugin startup or rescheduling update settings, then every 6 hours. **Check for Updates** remains available when disabled. |
| Automatically download updates | Off | Download and verify an offline package only when an **automatic check** finds a newer version. Downloading itself never installs or restarts. Enabling this while automatic checks are off does not trigger background downloads. |
| Automatically install updates | Off | Requires automatic checks and dshmarket (cannot be enabled while the market is not detected). When an **automatic check** finds a newer version, an open DSH page asks the plugin market to install it; each version is tried at most once every 6 hours and never again once installed. Market rules such as its release-age wait still apply, and automatic mode never forces an install. A DSH restart or page refresh may be needed for it to take effect. |

- Strict SemVer comparison offers downloads only when the selected channel is newer than the running version; there is no automatic downgrade. Automatic region selection never falls back across channels.
- The region affects only this plugin's update metadata and package downloads, **not CPA connections, model requests, or other plugins' installation sources**.
- Check again after switching channel or region. Opening the card, polling, or reloading status only reads in-memory state and does not itself contact an update source; background checks follow the controls above.
- Errors are localized, including unpublished channels, network failures, package integrity failures and storage failures, without exposing backend stack traces.

### One-click and automatic updates through the plugin market

1. The card only reads the market's local `GET /dsh-market/api/v1/capabilities` when it opens and never contacts a registry for it; once detected it shows **Update Now**.
2. After a check finds a newer version, click **Update Now** and confirm the version. The card submits `POST /dsh-market/api/v1/updates { "packageName": "dsh-cliproxyapi-pro" }` to the market, then polls that operation's progress and result. Version resolution, download, installation, version verification and recovery are all done by the market.
3. When it finishes, the card shows the version actually installed and, following the market's result, asks you to **Restart DSH** (a button appears only when the market says it owns restarts; quit and reopen the desktop app completely) or **Refresh Page**. If the market, using its own channel, installed an older version than this card found, the card says so.
4. During the market's release-age wait (`RELEASE_TOO_FRESH`) or before its mirror catches up (`VERSION_UNCHANGED`) you can choose **Install Anyway**; other failures show only a localized reason, never backend text.
5. Linked local installations (`link:`) are not installed through the market, so their source link is never replaced.

### Download, verification and offline upgrade

Use this without the plugin market or for offline upgrades:

1. Click **Check for Updates**. If a newer version is available, click **Download Update** and confirm its version, or wait for enabled automatic checks and downloads.
2. The download must match the npm metadata's **SHA-512** integrity, then pass gzip / tar, package name and version checks, and every file in it must be declared by that package's own `package.json` `files` (except files npm always packs, such as `package.json`, README and LICENSE). Path traversal, hidden files, `node_modules`, links and other special entries, dependencies and installation lifecycle scripts are rejected. When a download is rejected, the concrete reason is written to the DSH log. The package is saved without extracting into the installation directory or executing its code.
3. After verification, the card displays the absolute package path and an upgrade command when applicable. Packages are stored at `<profile dir>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`.
4. **Save your work and fully close DSH first**, then run the card's command in a terminal. This example is illustrative; use the actual profile name and absolute path from your card:

   ```bash
   dsh plugin --profile 'desktop' add '/absolute/path/dsh-cliproxyapi-pro-<version>.tgz'
   ```

5. Start DSH again to load the new version. Check results and downloaded-package notices do not persist across plugin reloads; the offline files remain on disk. Remove old downloads yourself when no longer needed; the plugin does not automatically clean them up.

**Linked local installations (`link:`)** can check and download packages, but do not receive an upgrade command and their source directories are never overwritten. To keep the development setup, manually update the Git source at an appropriate time, then restart DSH. Reinstalling from an offline package changes the plugin's installation source from the link to the package.

## Slash commands and HTTP routes

This plugin registers no agent tool, so it adds nothing to model context. Accounts and models are managed on the **CLIProxyAPI** page in Settings; the slash commands below show and refresh their state.

### Slash commands

- `/cpa-status` — show every account's status (including how many image / video models were recognized).
- `/cpa-refresh` — refresh every account now, including a catalog probe of disabled ones.
- `/cpa-image [-m model] [--aspect ratio] [-n 1-4] prompt` — generate images; with attached images, edit them. See [Generating images](#generating-images-cpa-image).
- `/cpa-video [-m model] [--aspect ratio] [-s 1-15] [-r 480p|720p] prompt` — generate a video; attach one image as the first frame. A submitted video cannot be cancelled. See [Generating videos](#generating-videos-cpa-video).
- `/cpa-video-status` — list this session's video jobs.
- `/cpa-video-edit [--video path | --url link | --from command-id] [-m model] change` / `/cpa-video-extend [same] [-s 2-10] what happens next` — edit / extend any MP4 (an attached video file works too). See [Editing and extending videos](#editing-and-extending-videos-cpa-video-edit-cpa-video-extend).

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
| GET | `/api/dsh-cliproxyapi/quota/status` | — | `{ ok, quota }`: the cached quota snapshot; stale accounts refresh in the background |
| POST | `/api/dsh-cliproxyapi/quota/refresh` | `{ accountId? }` | Start refreshing the quota of one or every account and return at once (`refreshing` is set in the snapshot) |
| POST | `/api/dsh-cliproxyapi/quota/save` | `{ accountId, managementKey?, clear? }` | Store or clear the account's management key and start refreshing its quota; the response never contains the key |
| GET | `/api/dsh-cliproxyapi/media/status` | — | `{ ok, media }`: generation settings and each account's recognized image / video models; no network access |
| POST | `/api/dsh-cliproxyapi/media/save` | `{ account: { accountId, disabledModels?, kindOverrides? } }` | Save an account's switched-off media models (replaces the list) or kind overrides (merged per model; `null` restores detection); a kind change re-synchronizes that account and adds `status` to the response. Invalid values return 400 with a code such as `invalid-account` or `invalid-kind` |
| POST | `/api/dsh-cliproxyapi/media/diagnose` | `{ accountId }` | Read-only diagnostic (see above); returns `{ ok, diagnostic }` without the key |
| GET | `/api/dsh-cliproxyapi/media/session?sessionId=` | — | `{ ok, session }`: the image / video models to choose from, the current pick and where it comes from (`session` / `last` / `only`), and this session's recent files (names and ids only, no paths); no network access |
| POST | `/api/dsh-cliproxyapi/media/session/save` | `{ sessionId?, kind: "image" \| "video", ref }` | Pick a session's model (`ref` is `accountId/modelId`; `null` clears the session's pick) and remember it as the last pick; a model that is not offered returns 400 `invalid-model` |
| GET | `/api/dsh-cliproxyapi/media/file?sessionId=&id=` | — | Serves a generated file the plugin recorded for that session; anything else, or another session, gets 404. Videos are streamed with single `Range` support (206) so players can seek |
| GET | `/api/dsh-cliproxyapi/media/command?sessionId=&commandId=` | — | `{ ok, run, files }`: one command run's record in that session (status `running` / `done` / `error`, model, prompt, ratio, count, number of references, start and end times, a display name for the save folder, error code and summary) and the files it produced (id, name and full path, plus the save folder `folderPath` and the Host's file manager kind `desktop`: `explorer` / `finder` / `filemanager`), so its row in the conversation can show and open them; video records also carry length, resolution, request id, the `mode` (`text` / `first-frame` / `reference` / `first-last` / `last-frame` / `edit` / `extend`) and the source command id, plus `actions: { edit, extend, expiresAt }` (never the link) while it can still be edited or extended; and while running the `phase` (`submitting` / `queued` / `running` / `downloading`) and CPA's `progress`; a run recorded as running that no background job owns (after a reload or crash) is reported as `interrupted` |

Update operation responses use `{ ok, update }`. State includes `currentVersion`, `latestVersion`, `available`, `channel`, `region`, `effectiveRegion`, `autoCheck`, `autoDownload`, `autoInstall`, `checking`, `downloading`, `lastCheckedAt`, `error` / `errorCode`, `blockedReason`, `downloadedVersion`, `downloadPath` and `upgradeCommand`. Fields without a check or download result are `null`. `channel` is `stable` / `beta` / `dev`; `region` is `auto` / `global` / `cn`; `effectiveRegion` is the `global` / `cn` source used by the last successful check (`null` before one).

Failures use a top-level `errorCode` or `update.errorCode`; HTTP status or `ok` alone does not establish success. Common codes include `network-error`, `invalid-metadata`, `channel-unavailable`, `integrity-error`, `invalid-package`, `storage-error`, `busy`, `stale-version`, `service-unavailable`, `forbidden-origin` and `disposed`. Update POSTs still rely on the host's session authentication and trusted-host policy: when a request carries `Origin`, it must belong to the same authority as this listener (host and port compared under the Origin's own scheme, matching the host's own rule), otherwise the response is `forbidden-origin`. The desktop carrier may proxy API calls without an `Origin`; such a request is allowed once the host session authenticates it, while unauthenticated callers are still rejected before reaching the route. Plain unauthenticated `curl` cannot call these endpoints.

## Storage and configuration

- **State file**: `<profile dir>/.dsh-cliproxyapi/state.json` holds accounts, selections and overrides (no keys).

  ```json
  {
    "version": 2,
    "refreshIntervalSeconds": 300,
    "probeTimeoutMs": 5000,
    "accounts": [
      {
        "id": "default", "enabled": true, "provider": "cli-proxy", "displayName": "CLI Proxy API",
        "baseURL": "https://cpa.example.com", "apiKeyEnv": "CLI_PROXY_API_KEY",
        "protocol": "openai-completions", "protocolMode": "auto",
        "includePrefix": "", "excludePrefix": "", "selectedModels": ["gpt-6.1-sol"], "modelOverrides": {}
      }
    ]
  }
  ```

  The file is re-read on every access; after a manual edit, click **Probe & Refresh** in the account's **⋯** menu. A single-account file from 1.3.x and earlier migrates automatically into account `default` with the same routes, key and selection, and the original is kept as `state.v1.json`.

- **Update settings**: stored separately at `<profile dir>/.dsh-cliproxyapi/update-settings.json`. They neither extend nor rewrite the account `state.json` v2 file, nor access credentials. When this file does not yet exist, defaults are:

  ```json
  {
    "version": 1,
    "autoCheck": true,
    "autoDownload": false,
    "autoInstall": false,
    "channel": "stable",
    "region": "auto"
  }
  ```

  Panel saves take effect immediately. After editing this file manually, reload the plugin or restart DSH to re-read it. Corrupt, structurally invalid, invalid-field or unreadable files use safe defaults with automatic network checks disabled. Check results, the candidate version, download notices and commands are in-memory only and reset on plugin reload; downloaded packages remain in the separate `updates` subdirectory for you to clean up when needed.
- **Generation settings**: stored separately at `<profile dir>/.dsh-cliproxyapi/media-settings.json`; `state.json` is not changed. Without this file the defaults apply; a damaged file also falls back to the defaults with a log warning, and the next save first keeps the damaged file as `media-settings.corrupt-<time>.json`. Currently `outputDir` (save location), `lastSelection` (the last picked models) and each account's `disabledModels` (switched-off media models) and `kindOverrides` (kinds you set) take effect; the other fields are reserved for the generation features still to come and have no effect yet:

  ```json
  {
    "version": 1,
    "agentTool": false,
    "outputDir": "generated",
    "defaultVideoSeconds": 6,
    "defaultVideoResolution": "720p",
    "imageConfirm": "auto",
    "videoConfirm": "ask",
    "videoBudget": { "mode": "limited", "seconds": 60 },
    "lastSelection": {},
    "accounts": {
      "default": { "disabledModels": [], "kindOverrides": { "my-painter": "image" } }
    }
  }
  ```

- **Per-session generation records**: `<profile dir>/.dsh-cliproxyapi/media-sessions.json` keeps each session's picked generation models, records of its last 48 runs (status, model, prompt, options, start and end times, a display name for the save folder, error summary), and the paths of its last 48 generated files with the command id that produced them (for the command rows in the conversation), for the 500 most recently updated sessions. Deleting it only clears those picks and records, never generated files. A damaged file is treated as empty and kept as `media-sessions.corrupt-<time>.json` before the next write.
- **Video jobs**: `<profile dir>/.dsh-cliproxyapi/media-jobs.json` keeps submitted video jobs (CPA request id, account, model, session and command id, working directory and save location, prompt, length, submission time, state) so a reload or restart can keep waiting; at most 200, finished ones kept 7 days. No keys and no video URLs. A damaged file is treated as empty and kept as `media-jobs.corrupt-<time>.json` before the next write.
- **Keys**: stored and resolved by ref through the DSH `credentials` service, falling back to an environment variable of the same name.
- **Environment**: `CLIPROXYAPI_BASE_URL` is used only for auto-discovery of accounts without a base URL.
- **Plugin row config**: the plugin row's `config` in `cordis.patch.yml` is overlaid on the state file at startup: `accounts` replaces the account list, other fields apply to the first account. Normally keep it `{}` and configure through the Settings panel.

## Upgrading and uninstalling

- **Upgrade**: with dshmarket installed, click **Update Now** on the plugin update card (or enable automatic installation), then restart DSH or refresh the page as prompted. Without the market, download a verified offline package through the card, save your work and close DSH, run the displayed `dsh plugin --profile 'name' add 'absolute-package-path'` command, then restart. There is no need to uninstall first. Alternatively, with DSH closed, run `dsh plugin --profile <profile name> add dsh-cliproxyapi-pro@latest` to upgrade from npm. Accounts, selections and parameters remain in the profile directory, and keys in the credentials service; the updater never rewrites them. To preserve a linked source installation, update its source yourself rather than reinstalling from an offline package.
- **Uninstall**: uninstall on the **Plugins** page. The synchronized model routes are stored in DSH settings and are not removed with the plugin; to remove those models from the picker too, disable or delete every account before uninstalling.

## FAQ

**No models in the model picker?**
Check that the **Enabled** switch next to the account title is on and at least one model checked (or an empty selection, meaning all). Run `/cpa-status` to see every account's state.

**"none of the selected models matched"?**
None of the checked models exists on this server (typical after switching servers). The panel still lists the server's models — check new ones, or click **Reset to Recommended**, then save.

**Connection failed / "no usable CPA service found"?**
Make sure the base URL is reachable from the machine running DSH and the API key is correct. An account with a URL never tries another address; the error lists every address tried and why it failed.

**A just-published version won't install?**
The pnpm used by DSH may enforce a waiting period for new releases (`minimumReleaseAge`); the install screen shows which version it actually installed. Try again later or name the version explicitly.

**How do I install updates automatically?**
Install and enable the [DSH plugin market (dshmarket)](https://github.com/dsh-market/dsh-market), then turn on **Automatically Check for Updates** and **Automatically Install Updates** on the plugin update card. The market performs the installation (package manager, version verification and recovery); this plugin itself never runs a package manager, overwrites files or restarts DSH. Without the market it can only prepare an offline package for an upgrade with DSH closed.

**"Check for Updates" fails immediately (especially on the desktop app)?**
Versions 1.5.1 and earlier required an `Origin` header on update POSTs, but the DSH desktop app strips that header when it forwards page requests, so checks, update-setting saves and downloads were all refused. Since 1.6.0 the plugin follows the host's own rule: without `Origin` the host session authentication decides; with `Origin` it must still be same-origin. Upgrade older versions through the plugin market, the plugin manager or the offline path.

**No release available on Beta / Dev?**
A channel is usable only after the maintainer publishes its npm dist-tag. Stable is never presented as an unpublished Beta / Dev build. A channel version no newer than the running version does not offer a downgrade download either.

**The update card says "update service unavailable" or "network error"?**
The collapsed row names the actual cause. **Update service unavailable** means the page runs newer client code than the running host plugin: after installing or upgrading, **restart DSH** (refreshing the page or reloading the plugin is not enough). **Network error** means requests to npmjs or the Mainland China mirror failed; switch the download region and check proxies/firewalls. **Channel unpublished** means that channel has no matching release yet. Expand the card for the matching explanation.

**Downloaded the update and restarted, but the version did not change?**
Downloading and verification do not install anything. Exit DSH, run the card's upgrade command, then start it again. Linked installations do not receive that command; update their source manually to keep the link. If a plugin reload clears the download notice, the offline file remains in the profile's `updates` directory.

## AI installation guide

> **For the AI agent in DeepSeek Harness**: when the user asks you to install or configure this plugin, follow these steps. The package has no npm dependencies and no build scripts.

1. **Install**: call `plugin_manager` with `{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`. Read `application` and `warnings` in the result; `restart-required` means DSH must restart before the new code runs.
2. **Configure**: this plugin provides no agent tool; the user configures accounts in the UI. A local CPA on `http://127.0.0.1:8317` without auth needs nothing — it is discovered automatically once the plugin runs. Otherwise ask the user to open the **CLIProxyAPI** page in the Settings dialog's left navigation, click **+ Add Account**, enter the server URL and API key, then check the wanted models on the **Models** tab.
3. **Verify**: ask the user to run `/cpa-status`; each enabled account should be `connected` with more than 0 models. Tell the user the models are in the DSH model picker under the account's name.

Never ask the user for an API key or write it into files; keys are entered only on the Settings page.

## Development

```text
lib/index.js        Host plugin (discovery, sync, multi-account controller, tool, commands, HTTP API)
lib/client.js       Web UI (ModuleLoader: account page in Settings, update card on the plugin pages, no build)
lib/updater.js      Update settings, SemVer/channels, region race, SHA-512/package checks, offline storage
locale/*.json       Title and description shown by the plugin manager
cordis.patch.yml    Bundle patch inserting the dsh-cliproxyapi-pro row
tests/              node:test unit and integration tests
.github/workflows/  CI (tests) and release (GitHub Release + npm trusted publishing)
assets/screenshots/ README screenshots (listed in screenshots.json for plugin storefronts)
AGENTS.md           Conventions, architecture and invariants for coding agents
```

```bash
git clone https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git
cd dsh-cliproxyapi-pro
npm test             # run the tests
npm run check        # syntax check + tests
npm run pack:check   # list the files a packed bundle contains
```

`npm run check` syntax-checks all three `lib/*.js` modules and runs every test. Offline update tests are `tests/updater.test.mjs` (settings, SemVer, regions, download integrity and package structure), `tests/update-routes.test.mjs` (HTTP authentication and same-origin policy), and `tests/client.test.mjs` (the update card and request lifecycle). They never access the real network or profile. `npm run pack:check` should include `lib/updater.js`, but not tests or screenshots; no runtime dependencies need installing.

Releasing is a pushed `v<version>` tag: GitHub Actions runs the tests, creates a GitHub Release with the package attached, and publishes to npm through npm trusted publishing (no token involved) with a provenance statement. Stable releases publish to npm `latest`; Beta / Dev prereleases publish to `beta` / `dev` and are marked as GitHub prereleases, without replacing the stable channel. The updater checks registry-provided SHA-512 integrity and package structure only; it does not verify publisher signatures or npm provenance.

Read [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md) before changing code; see [CHANGELOG.en.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.en.md) for history (Chinese: [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)). Issues and pull requests are welcome — when you change the documentation, update both the Chinese and the English README.

## License

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
