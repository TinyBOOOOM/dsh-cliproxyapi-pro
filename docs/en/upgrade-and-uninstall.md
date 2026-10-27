[中文](../zh/upgrade-and-uninstall.md) | English · [Back to README](../../README.en.md)

# Upgrading and uninstalling

- **Upgrade**: with dshmarket installed, click **Update Now** on the plugin update card (or enable automatic installation), then restart DSH or refresh the page as prompted. Without the market, download a verified offline package through the card, save your work and close DSH, run the displayed `dsh plugin --profile 'name' add 'absolute-package-path'` command, then restart. There is no need to uninstall first. Alternatively, with DSH closed, run `dsh plugin --profile <profile name> add dsh-cliproxyapi-pro@latest` to upgrade from npm. Accounts, selections and parameters remain in the profile directory, and keys in the credentials service; the updater never rewrites them. To preserve a linked source installation, update its source yourself rather than reinstalling from an offline package.
- **Uninstall**: uninstall on the **Plugins** page. The synchronized model routes are stored in DSH settings and are not removed with the plugin; to remove those models from the picker too, disable or delete every account before uninstalling.
