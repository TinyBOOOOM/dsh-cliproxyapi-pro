// Kimi, Meta, xAI, and Devin provider-specific account usage requests.
import { UPSTREAM, DEVIN_METADATA } from "../constants.js";
import { QuotaError, isObj, text, firstText, flagOf, getPath, extractPlan } from "../helpers.js";
import { kimiPrefersAi, parseKimiWindows, parseMetaUsage, parseXaiWindows, parseDevinStatus } from "../parsers.js";

export function createBillingProbes({ apiCall, management, now }) {
  return {
    async kimi(ctx, entry, authIndex) {
      // kimi.com and Kimi International (kimi.ai) share the API on two hosts.
      // Prefer the host the credential hints at; on a rejected token try the
      // other one (both are Moonshot's own endpoints, never arbitrary hosts).
      const hosts = kimiPrefersAi(entry) ? [UPSTREAM.kimiAiUsage, UPSTREAM.kimiUsage] : [UPSTREAM.kimiUsage, UPSTREAM.kimiAiUsage];
      let lastError = null;
      for (const url of hosts) {
        try {
          const body = await apiCall(ctx, { auth_index: authIndex, method: "GET", url, header: { Authorization: "Bearer $TOKEN$" } });
          return { windows: parseKimiWindows(body, now()), plan: extractPlan(body) };
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
          if (error?.code !== "upstream-unauthorized" && error?.code !== "upstream-forbidden") break;
        }
      }
      throw lastError;
    },

    async meta(ctx, entry, authIndex) {
      // Meta's usage endpoint takes the credential's dca_token, not the LLM key
      // CPA would substitute for $TOKEN$. Read only that field from the auth
      // file for this one request; it is never stored, logged or returned.
      const name = firstText(entry.name, entry.id);
      if (name === "" || flagOf(entry.runtime_only ?? entry.runtimeOnly) === true) throw new QuotaError("missing-token");
      const file = await management(ctx, `/v0/management/auth-files/download?name=${encodeURIComponent(name)}`);
      const token = isObj(file) ? text(file.dca_token) : "";
      if (!/^dca:\S+$/.test(token)) throw new QuotaError("missing-token");
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.metaUsage,
        header: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-api-version": "1.0.0" },
        data: "{}",
      });
      return parseMetaUsage(body);
    },

    async xai(ctx, entry, authIndex) {
      const header = {
        Authorization: "Bearer $TOKEN$",
        "x-xai-token-auth": "xai-grok-cli",
        "x-grok-client-version": "0.2.91",
        accept: "*/*",
        "user-agent": "grok-pager/0.2.91 grok-shell/0.2.91 (windows; amd64)",
      };
      const userId = firstText(entry.sub, entry.subject, entry.user_id, entry.userId, getPath(entry, ["metadata", "sub"]), getPath(entry, ["metadata", "user_id"]), getPath(entry, ["attributes", "sub"]));
      if (userId !== "") header["x-userid"] = userId;
      const results = await Promise.allSettled([
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.xaiBillingWeekly, header }),
        apiCall(ctx, { auth_index: authIndex, method: "GET", url: UPSTREAM.xaiBillingMonthly, header }),
      ]);
      if (results.every((r) => r.status === "rejected")) throw results[0].reason;
      const rows = new Map();
      if (results[0].status === "fulfilled") for (const row of parseXaiWindows(results[0].value, "weekly")) rows.set(row.id, row);
      if (results[1].status === "fulfilled") for (const row of parseXaiWindows(results[1].value, "monthly")) rows.set(row.id, row);
      // Paid accounts expose no billing counters: reachable but window-less.
      return { windows: [...rows.values()], plan: rows.size === 0 ? "Paid" : "" };
    },

    async devin(ctx, entry, authIndex) {
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.devinStatus,
        header: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
        data: JSON.stringify({ metadata: DEVIN_METADATA }),
      });
      return parseDevinStatus(body);
    },

  };
}
