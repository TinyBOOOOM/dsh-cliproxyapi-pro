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
- **Visual management**: check models and edit per-model parameters in the settings panel, or let the DSH agent configure things for you through the `cliproxyapi` tool.
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
- [Agent tool and slash commands](#agent-tool-and-slash-commands)
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

   To pin a version, write `dsh-cliproxyapi-pro@1.6.0`.
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
| A released version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.6.0` |
| Latest development version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| Offline package | Download [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz) (always the latest release) and enter its absolute local path |
| Local source (development) | Absolute path of a cloned repository; installed as a link, so code changes go live when the plugin reloads |

All versions are listed under [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases).

## Getting started

1. **Open the settings panel**: **Settings** → the **CLIProxyAPI** page in the left navigation (accounts, models and protocols live there). The plugin's own updates are on sidebar **Plugins** → **CLIProxyAPI** and on **Settings** → **Built-in plugins** → the **CLIProxyAPI** tab; those two places contain only update features.
2. **Enter the connection**: under **Connection & Authentication**, fill in the **CLIProxyAPI Base URL** (e.g. `http://127.0.0.1:8317`, without `/v1`) and the **API Key** (leave it empty for a local CPA without authentication), then click **Save & Apply**.
3. **Choose models**: once connected, **Model Picker Filter** lists every model on the server, with the newest model of each family already checked. Adjust the selection and click **Apply Selected Models**.
4. **Use them**: open the model picker in a conversation; the models appear in a group named after the account.

If CPA runs on this machine on the default port `8317` without a key, there is nothing to fill in: the plugin finds it automatically.

## Screenshots

The panel follows the DSH display language; the screenshots show the Chinese UI.

**1. Account bar and account status.** The bar at the top lists every account: a green dot means connected, a grey dot plus the **Off** badge means disabled. Here a second account, *CLI Proxy API 2*, was just added with **+ Add Account**: it starts disabled, gets its own provider route `cli-proxy-2`, and — since no base URL is set yet — the probe reports that no local CPA was found.

![Account bar with one connected and one newly added, disabled account](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/accounts.png)

**2. Model picker filter.** All 168 models discovered from the CPA server, with All / Checked / Unchecked tabs, family chips (GPT, CLAUDE, GEMINI, GROK, …), search and bulk actions. Checked models are the only ones synchronized into the DSH model picker; each shows the protocol it will use (here OpenAI Responses), image input, reasoning levels and context window, and **Edit Parameters** opens its per-model overrides.

![Model filter with family chips, checked models, protocol and capability badges](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/model-filter.png)

**3. Connection & Authentication.** Per-account settings: the **Enable This Account** switch, base URL, API key stored under the account's own credential ref (`CLI_PROXY_API_KEY_2`), wire protocol, account name, the collapsible advanced section, **Save & Apply** and **Delete Account**.

![Connection settings of a disabled account with its own credential ref](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/connection.png)

**4. Plugin update card.** The real component is rendered offline with fictional update state (captured when the card still sat collapsed at the top of the account page): a single row shows the current version and update status, and expanding it reveals channels, download regions and automatic-update switches. It now lives alone on the plugin page and starts expanded there. This is not a live GUI screenshot and does not indicate an actual published version.

![Collapsed plugin update row showing the current version and an available update](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/updates.png)

![Expanded plugin update settings: channels, download regions and automatic switches](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/updates-expanded.png)

## Features in detail

### Discovery and synchronization

- The base URL can be local or remote; suffixes such as `/v1`, `/v1/chat/completions` and `/v1/messages` are stripped.
- With an empty URL, the plugin tries, in order: the existing route's URL, the `CLIPROXYAPI_BASE_URL` environment variable, and local `127.0.0.1:8317`.
- The enriched catalog comes from `/v1/models?client_version=pi` (standard OpenAI `data[]` catalogs work too); `owned_by` from `/v1/models` identifies each model's family.
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
- **New** accounts start disabled. Fill in the URL and key, click **Probe & Refresh** to preview and check models, then turn on **Enable This Account** and save.
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
2. The download must match the npm metadata's **SHA-512** integrity, then pass gzip / tar, expected file and directory, package name and version checks. Path traversal, links and other special entries, dependencies and installation lifecycle scripts are rejected. The package is saved without extracting into the installation directory or executing its code.
3. After verification, the card displays the absolute package path and an upgrade command when applicable. Packages are stored at `<profile dir>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`.
4. **Save your work and fully close DSH first**, then run the card's command in a terminal. This example is illustrative; use the actual profile name and absolute path from your card:

   ```bash
   dsh plugin --profile 'desktop' add '/absolute/path/dsh-cliproxyapi-pro-<version>.tgz'
   ```

5. Start DSH again to load the new version. Check results and downloaded-package notices do not persist across plugin reloads; the offline files remain on disk. Remove old downloads yourself when no longer needed; the plugin does not automatically clean them up.

**Linked local installations (`link:`)** can check and download packages, but do not receive an upgrade command and their source directories are never overwritten. To keep the development setup, manually update the Git source at an appropriate time, then restart DSH. Reinstalling from an offline package changes the plugin's installation source from the link to the package.

## Agent tool and slash commands

### The `cliproxyapi` tool

The DSH agent uses this tool to inspect and configure the plugin; just ask in plain language.

| `action` | Effect |
|---|---|
| `status` | Show every account (or only `account`) with its state and models |
| `refresh` | Probe and sync now; without `account`, all accounts |
| `configure` | Update one account (the first by default), then refresh it |
| `add_account` | Create an account; enabled when `baseURL` is given, otherwise disabled |
| `remove_account` | Delete the `account` and its routes |

Parameters (all optional except `action`):

| Parameter | Meaning |
|---|---|
| `account` | Account id (e.g. `default`, `account-2`), or its provider route ID or display name |
| `enabled` | Enable or disable the account |
| `baseURL` | CPA URL such as `http://127.0.0.1:8317`; an empty string means auto-discover |
| `apiKey` | Bearer key, stored under the account's `apiKeyEnv` ref |
| `apiKeyEnv` | Credential ref name (`[A-Za-z_][A-Za-z0-9_]*`) |
| `provider` | `llm-pi-ai` provider route ID, unique per account |
| `displayName` | Account name, also the group title in the model picker |
| `protocolMode` | `auto` (native protocol per family, default) or `fixed` |
| `protocol` | Protocol used in `fixed` mode: `openai-completions` / `openai-responses` / `anthropic-messages` |
| `selectedModels` | Model ids shown in the picker; `[]` shows all |
| `includePrefix` / `excludePrefix` | Comma-separated model id keywords |
| `modelOverrides` | `{ [modelId]: { contextWindow?, maxTokens?, image?, reasoningLevels?, protocol? } }`, replacing the whole map |

Examples:

```json
{ "action": "configure", "baseURL": "http://127.0.0.1:8317", "apiKey": "sk-...", "selectedModels": ["gpt-6.1-sol", "claude-opus-5-5"] }
{ "action": "add_account", "displayName": "Backup CPA", "baseURL": "https://other-cpa:8317", "apiKey": "sk-...", "selectedModels": ["gpt-6-astra"] }
{ "action": "configure", "account": "account-2", "enabled": false }
{ "action": "remove_account", "account": "account-2" }
```

The output has `accounts[]` (each with `id`, `displayName`, `provider`, `enabled`, `state`, `endpoint`, `modelCount`, `totalDiscovered`, `error`) and a text `summary`. `state` is one of `idle`, `probing`, `connected`, `disabled`, `error`.

### Slash commands

- `/cpa-status` — show every account's status.
- `/cpa-refresh` — refresh every account now, including a catalog probe of disabled ones.

### HTTP API

Used by the settings panel. Requires the DSH Web session's authentication; POST accepts only same-origin requests from loopback or trusted hosts.

| Method | Path | Body | Meaning |
|---|---|---|---|
| GET | `/api/dsh-cliproxyapi/status` | — | `{ ok, global, accounts[] }` |
| POST | `/api/dsh-cliproxyapi/refresh` | `{ accountId? }` | Refresh one or all accounts |
| POST | `/api/dsh-cliproxyapi/save` | `{ accountId?, …account fields, apiKey?, clearApiKey?, refreshIntervalSeconds?, probeTimeoutMs? }` | Save an account (the first by default); a body with only global fields saves just the globals |
| POST | `/api/dsh-cliproxyapi/accounts/add` | Optional account fields | Create a disabled account; returns `createdId` |
| POST | `/api/dsh-cliproxyapi/accounts/remove` | `{ accountId }` | Delete an account and its routes |
| GET | `/api/dsh-cliproxyapi/updates/status` | — | Read update state without contacting a registry |
| POST | `/api/dsh-cliproxyapi/updates/check` | `{}` | Check the selected channel and region now; a manual check does not trigger automatic downloading |
| POST | `/api/dsh-cliproxyapi/updates/save` | `{ autoCheck?, autoDownload?, autoInstall?, channel?, region? }` | Save only these five update preferences, independently of accounts |
| POST | `/api/dsh-cliproxyapi/updates/download` | `{ version }` | Download the newer version confirmed by the latest check, verify it, and save an offline package without installing |

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

  The file is re-read on every access; after a manual edit, click **Probe & Refresh**. A single-account file from 1.3.x and earlier migrates automatically into account `default` with the same routes, key and selection, and the original is kept as `state.v1.json`.

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
- **Keys**: stored and resolved by ref through the DSH `credentials` service, falling back to an environment variable of the same name.
- **Environment**: `CLIPROXYAPI_BASE_URL` is used only for auto-discovery of accounts without a base URL.
- **Plugin row config**: the plugin row's `config` in `cordis.patch.yml` is overlaid on the state file at startup: `accounts` replaces the account list, other fields apply to the first account. Normally keep it `{}` and configure through the panel or the tool.

## Upgrading and uninstalling

- **Upgrade**: with dshmarket installed, click **Update Now** on the plugin update card (or enable automatic installation), then restart DSH or refresh the page as prompted. Without the market, download a verified offline package through the card, save your work and close DSH, run the displayed `dsh plugin --profile 'name' add 'absolute-package-path'` command, then restart. There is no need to uninstall first. Alternatively, with DSH closed, run `dsh plugin --profile <profile name> add dsh-cliproxyapi-pro@latest` to upgrade from npm. Accounts, selections and parameters remain in the profile directory, and keys in the credentials service; the updater never rewrites them. To preserve a linked source installation, update its source yourself rather than reinstalling from an offline package.
- **Uninstall**: uninstall on the **Plugins** page. The synchronized model routes are stored in DSH settings and are not removed with the plugin; to remove those models from the picker too, disable or delete every account before uninstalling.

## FAQ

**No models in the model picker?**
Check that the account has **Enable This Account** on and at least one model checked (or an empty selection, meaning all). Run `/cpa-status` to see every account's state.

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
2. **Configure** with the `cliproxyapi` tool:
   - Local CPA on `http://127.0.0.1:8317` without auth: nothing to configure; call `{"action": "refresh"}`.
   - Remote URL or key: `{"action": "configure", "baseURL": "...", "apiKey": "..."}` (first account), or `{"action": "add_account", ...}` for another account. Pass `"account": "<id>"` to target a specific account.
   - Narrow the picker with `selectedModels` (exact ids from the `status` output).
3. **Verify**: `{"action": "status"}` shows `state: "connected"` and `modelCount > 0` for each enabled account. Tell the user the models are in the DSH model picker under the account's name, and that accounts are managed on the **CLIProxyAPI** page in the Settings dialog's left navigation.

Never echo API keys back to the user or write them into files.

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

Read [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md) before changing code; see [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md) for history. Issues and pull requests are welcome — when you change the documentation, update both the Chinese and the English README.

## License

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
