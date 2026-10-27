[中文](../zh/storage-and-config.md) | English · [Back to README](../../README.en.md)

# Storage and configuration

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
- **Generation settings**: stored separately at `<profile dir>/.dsh-cliproxyapi/media-settings.json`; `state.json` is not changed. Without this file the defaults apply; a damaged file also falls back to the defaults with a log warning, and the next save first keeps the damaged file as `media-settings.corrupt-<time>.json`. Every field has an effect: `outputDir` (save location), `lastSelection` (the last picked models), `defaultVideoSeconds` / `defaultVideoResolution` (the `/cpa-video` defaults when `-s` / `-r` are not given), `agentTool`, `imageConfirm`, `videoConfirm` and `videoBudget` (the agent generation tool's switch, confirmation and seconds limit), and each account's `disabledModels` (switched-off media models) and `kindOverrides` (kinds you set):

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
