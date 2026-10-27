// CPA normalized plugin/declarative quota-fetch probe.
import { QuotaError, isObj, text, firstText } from "../helpers.js";
import { parsePluginQuota } from "../parsers.js";

export function createPluginProbe({ management }) {
  /** CPA plugin / declarative quota: POST /v0/management/quota/fetch. */
  async function pluginProbe(ctx, entry, authIndex) {
    const provider = text(firstText(entry.quota_provider, entry.quotaProvider, entry.provider, entry.type));
    const body = await management(ctx, "/v0/management/quota/fetch", {
      method: "POST",
      body: { auth_index: authIndex, ...(provider === "" ? {} : { provider }) },
    });
    if (!isObj(body)) throw new QuotaError("invalid-response");
    return parsePluginQuota(body);
  }

  return pluginProbe;
}
