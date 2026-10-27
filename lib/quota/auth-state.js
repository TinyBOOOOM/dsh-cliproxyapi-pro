// Persisted management-key rejection counts (quota-state.json); never holds a key.

// Consecutive management 401/403 answers after which automatic refresh stops
// (CPA bans the client address for 30 minutes after 5 failed attempts).
export const AUTH_FAILURE_LIMIT = 3;
export const QUOTA_AUTH_STATE_VERSION = 1;

export const AUTH_ERROR_CODES = ["unauthorized", "forbidden"];
const AUTH_ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * The persisted management-key failure counts (`quota-state.json`):
 * `{ version: 1, accounts: { [id]: { authFailures, errorCode, errorStatus?, failedAt } } }`.
 * Never holds a key. Invalid entries are dropped; accounts without failures are not kept.
 */
export function normalizeQuotaAuthState(raw) {
  const accounts = {};
  const input = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw.accounts : undefined;
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    for (const [id, entry] of Object.entries(input)) {
      if (!AUTH_ACCOUNT_ID.test(id) || entry === null || typeof entry !== "object") continue;
      const failures = Number.isInteger(entry.authFailures) && entry.authFailures > 0 ? Math.min(entry.authFailures, 1000) : 0;
      if (failures === 0) continue;
      accounts[id] = {
        authFailures: failures,
        errorCode: AUTH_ERROR_CODES.includes(entry.errorCode) ? entry.errorCode : "unauthorized",
        ...(Number.isInteger(entry.errorStatus) ? { errorStatus: entry.errorStatus } : {}),
        ...(typeof entry.failedAt === "string" && entry.failedAt.length <= 40 ? { failedAt: entry.failedAt } : {}),
      };
    }
  }
  return { version: QUOTA_AUTH_STATE_VERSION, accounts };
}
