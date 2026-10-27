[中文](../zh/updates.md) | English · [Back to README](../../README.en.md)

# Updating this plugin

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
