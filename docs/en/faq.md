[中文](../zh/faq.md) | English · [Back to README](../../README.en.md)

# FAQ

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
