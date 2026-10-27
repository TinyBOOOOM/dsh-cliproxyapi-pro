[中文](../zh/ai-install-guide.md) | English · [Back to README](../../README.en.md)

# AI installation guide

> **For the AI agent in DeepSeek Harness**: when the user asks you to install or configure this plugin, follow these steps. The package has no runtime npm dependencies and builds nothing at install time.

1. **Install**: call `plugin_manager` with `{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`. Read `application` and `warnings` in the result; `restart-required` means DSH must restart before the new code runs.
2. **Configure**: the user configures accounts in the UI (this plugin has no agent tool for account management). A local CPA on `http://127.0.0.1:8317` without auth needs nothing — it is discovered automatically once the plugin runs. Otherwise ask the user to open the **CLIProxyAPI** page in the Settings dialog's left navigation, click **+ Add Account**, enter the server URL and API key, then check the wanted models on the **Models** tab.
3. **Verify**: ask the user to run `/cpa-status`; each enabled account should be `connected` with more than 0 models. Tell the user the models are in the DSH model picker under the account's name.

Never ask the user for an API key or write it into files; keys are entered only on the Settings page.
