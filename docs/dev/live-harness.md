[Back to AGENTS.md](../../AGENTS.md)

# Working against a live Harness

- This directory may be installed **by link** into the user's profile (`plugin_manager list_bundles` shows `source: link:<this dir>`).
  Saved edits then become live on the next plugin reload — and the agent session itself may be using models routed through this plugin.
  Make risky changes in a scratch copy, get tests green, then copy back only within the user's approved scope.
- Back up `<profileDir>/.dsh-cliproxyapi/state.json` before changing its format or migration logic. Update preferences intentionally do not modify that format.
- Reload host code: `plugin_manager set_plugin include:dsh-cliproxyapi-pro` `enabled:false`, then `enabled:true`.
  Routes already written to `llm-pi-ai` persist across the reload.
  Client source changes require `npm run build:client` and a page refresh.
- Verify account behavior through `/cpa-status` / `/cpa-refresh` or the Settings page; HTTP routes require the Web session's auth and return 401 to plain `curl`. Update POSTs additionally reject a present cross-origin `Origin`.
- Never upgrade the live plugin, uninstall it, restart DSH or overwrite a linked checkout merely to test the updater. Prefer injected offline I/O and component fixtures. Restore any account, selection or route you changed while testing.
