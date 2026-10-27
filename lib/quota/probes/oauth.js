// Codex and Claude OAuth quota requests; tokens remain substituted inside CPA.
import { UPSTREAM, CODEX_UA } from "../constants.js";
import { codexAccountId, extractPlan } from "../helpers.js";
import { parseCodexWindows, parseClaudeWindows, claudeProfilePlan } from "../parsers.js";

export function createOAuthProbes({ apiCall, now }) {
  return {
    async codex(ctx, entry, authIndex) {
      const header = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": CODEX_UA };
      const accountId = codexAccountId(entry);
      if (accountId !== "") header["Chatgpt-Account-Id"] = accountId;
      const body = await apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.codexUsage, header });
      return { windows: parseCodexWindows(body, now()), plan: extractPlan(body) };
    },

    async claude(ctx, entry, authIndex) {
      const header = { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "anthropic-beta": "oauth-2025-04-20" };
      const [usage, profile] = await Promise.allSettled([
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.claudeUsage, header }),
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.claudeProfile, header }),
      ]);
      if (usage.status === "rejected") throw usage.reason;
      return { windows: parseClaudeWindows(usage.value), plan: profile.status === "fulfilled" ? claudeProfilePlan(profile.value) : "" };
    },

  };
}
