[Back to AGENTS.md](../../AGENTS.md)

# Adding a setting

**Account setting:** update, in order: `ACCOUNT_FIELDS` and `resolveConfig()` → `pickAccount()` → `accountPatchFromInput()` (HTTP) → client draft state, the draft-loading `useEffect`, `onSave` payload and form control (with `zh`/`en` strings) → the API tables in **both** `docs/zh/reference.md` and `docs/en/reference.md` → a test.
Global (all-account) settings go in `GLOBAL_FIELDS` instead.

**Update preference:** change updater defaults/normalization, strict persisted-file validation and `save()` validation → the isolated update card and both locale dictionaries → both `docs/zh/updates.md` and `docs/en/updates.md` (and the README overview if affected) → updater/client/HTTP tests.
Keep the independent preferences schema versioned; do not change account-state migration for an update preference.
