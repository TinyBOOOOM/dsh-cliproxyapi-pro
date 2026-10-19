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
- **Secure**: API keys live only in the DSH credentials service, never in configuration files.
- **Zero dependencies**: no npm dependencies and no build step; installs in seconds.

Works with DSH `0.2.0-rc.1` and later (desktop and web).

## Contents

- [Installation](#installation)
- [Getting started](#getting-started)
- [Screenshots](#screenshots)
- [Features in detail](#features-in-detail)
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

   To pin a version, write `dsh-cliproxyapi-pro@1.4.1`.
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
| A released version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.4.1` |
| Latest development version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| Offline package | Download [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz) (always the latest release) and enter its absolute local path |
| Local source (development) | Absolute path of a cloned repository; installed as a link, so code changes go live when the plugin reloads |

All versions are listed under [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases).

## Getting started

1. **Open the settings panel**: sidebar **Plugins** → **CLIProxyAPI**, or **Settings** → **Built-in plugins** → the **CLIProxyAPI** tab.
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

- **Keys**: stored and resolved by ref through the DSH `credentials` service, falling back to an environment variable of the same name.
- **Environment**: `CLIPROXYAPI_BASE_URL` is used only for auto-discovery of accounts without a base URL.
- **Plugin row config**: the plugin row's `config` in `cordis.patch.yml` is overlaid on the state file at startup: `accounts` replaces the account list, other fields apply to the first account. Normally keep it `{}` and configure through the panel or the tool.

## Upgrading and uninstalling

- **Upgrade**: uninstall and reinstall on the **Plugins** page, or run `dsh plugin --profile <profile name> add dsh-cliproxyapi-pro@latest`. Accounts, selections and parameters live in the profile directory and keys in the credentials service, so reinstalling keeps them.
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

## AI installation guide

> **For the AI agent in DeepSeek Harness**: when the user asks you to install or configure this plugin, follow these steps. The package has no npm dependencies and no build scripts.

1. **Install**: call `plugin_manager` with `{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`. Read `application` and `warnings` in the result; `restart-required` means DSH must restart before the new code runs.
2. **Configure** with the `cliproxyapi` tool:
   - Local CPA on `http://127.0.0.1:8317` without auth: nothing to configure; call `{"action": "refresh"}`.
   - Remote URL or key: `{"action": "configure", "baseURL": "...", "apiKey": "..."}` (first account), or `{"action": "add_account", ...}` for another account. Pass `"account": "<id>"` to target a specific account.
   - Narrow the picker with `selectedModels` (exact ids from the `status` output).
3. **Verify**: `{"action": "status"}` shows `state: "connected"` and `modelCount > 0` for each enabled account. Tell the user the models are in the DSH model picker under the account's name, and that accounts are managed in **Sidebar → Plugins → CLIProxyAPI** or **Settings → Built-in plugins → CLIProxyAPI**.

Never echo API keys back to the user or write them into files.

## Development

```text
lib/index.js        Host plugin (discovery, sync, multi-account controller, tool, commands, HTTP API)
lib/client.js       Web settings panel (hand-written ModuleLoader module, no build)
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

Releasing is a pushed `v<version>` tag: GitHub Actions runs the tests, creates a GitHub Release with the package attached, and publishes to npm through npm trusted publishing (no token involved) with a provenance statement.

Read [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md) before changing code; see [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md) for history. Issues and pull requests are welcome — when you change the documentation, update both the Chinese and the English README.

## License

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
