# dsh-cliproxyapi-pro

[中文](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/README.md) | English

[![npm](https://img.shields.io/npm/v/dsh-cliproxyapi-pro?label=npm)](https://www.npmjs.com/package/dsh-cliproxyapi-pro)
[![CI](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)

**Bring the models of [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (CPA) into the model picker of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).**

Enter a server URL and an API key, and the plugin reads the CPA model catalog and synchronizes the models you check — with their context window, image input and reasoning levels — into DSH, each over the protocol that suits it best. Connect several CPA accounts at once and enable or disable each one on its own.

- **Multiple accounts**: each account has its own URL, key, model selection and parameters, and can be switched off at any time. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/accounts-and-models.md)
- **Works out of the box**: on the first connection, the newest model of each family in that server's own catalog is checked (at most 12), so the picker isn't flooded with hundreds of models. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/accounts-and-models.md)
- **Native protocols**: Claude over Anthropic Messages, GPT / Codex / Grok over OpenAI Responses, everything else over OpenAI Chat — fewer protocol translations inside CPA. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/accounts-and-models.md)
- **Visual management**: check models and edit per-model parameters in the settings panel. By default the plugin registers no agent tool, so it takes no model context (the optional generation tool `generate_media` is switched on in the Generation tab). [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/accounts-and-models.md)
- **Plugin updates**: automatically check Stable / Beta / Dev channels and choose global / Mainland China sources. With the [DSH plugin market (dshmarket)](https://github.com/dsh-market/dsh-market) installed, new versions install in one click or automatically; otherwise download a verified offline package and upgrade with DSH closed. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/updates.md)
- **Secure**: API keys live only in the DSH credentials service, never in configuration files. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/storage-and-config.md)
- **Zero dependencies**: no npm dependencies and nothing built at install time; installs in seconds. [Details](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/development.md)

Works with DSH `0.2.0-rc.1` and later (desktop and web).
- **Channel quota**: [Quota tab, composer badge and failure protection](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/quota.md).
- **Images / videos**: [Generation, image editing, video edit / extend and optional agent tool](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/media.md).

## Installation

The plugin is published on npm as [`dsh-cliproxyapi-pro`](https://www.npmjs.com/package/dsh-cliproxyapi-pro) and is also available from the China mainland mirror (npmmirror). Pick any one of the methods below.

### Option 1: the DSH Plugins page (recommended)

1. Open DSH and click **Plugins** in the left sidebar.
2. Click **Add plugin** at the top of the page.
3. Enter the package name:

   ```text
   dsh-cliproxyapi-pro
   ```

   To pin a version, write `dsh-cliproxyapi-pro@1.8.0`.
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
| A released version | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.8.0` |
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

## Contents

- [Accounts and models](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/accounts-and-models.md)
- [Channel quota](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/quota.md)
- [Images and videos](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/media.md)
- [Updating this plugin](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/updates.md)
- [Slash commands and HTTP routes](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/reference.md)
- [Storage and configuration](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/storage-and-config.md)
- [Upgrading and uninstalling](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/upgrade-and-uninstall.md)
- [FAQ](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/faq.md)
- [AI installation guide](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/ai-install-guide.md)
- [Development](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/en/development.md)

## License

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
