// Google Code Assist loading and Antigravity/Gemini quota requests and fallback order.
import { UPSTREAM, AG_META, GEMINI_META, AG_SUMMARY_UA, AG_MODELS_UA, GROUP_GEMINI } from "../constants.js";
import { QuotaError, isObj, firstText, projectIdOf, extractPlan } from "../helpers.js";
import { antigravitySummaryWindows, antigravityModelWindows, googleBucketWindows } from "../parsers.js";

export function createGoogleProbes({ apiCall, now, agPreferred }) {
  async function loadCodeAssist(ctx, authIndex, metadata) {
    const headers = metadata.ideType === "ANTIGRAVITY"
      ? { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": AG_SUMMARY_UA }
      : googleHeaders(metadata);
    const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url: UPSTREAM.googleLoad, header: headers, data: JSON.stringify({ metadata }) });
    const project = body.cloudaicompanionProject ?? body.cloudaicompanion_project;
    return { body, projectID: isObj(project) ? firstText(project.id) : firstText(project) };
  }

  function googleHeaders(metadata) {
    return {
      Authorization: "Bearer $TOKEN$",
      "Content-Type": "application/json",
      "User-Agent": "google-api-nodejs-client/9.15.1",
      "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
      "Client-Metadata": JSON.stringify(metadata),
    };
  }

  return {
    async antigravity(ctx, entry, authIndex) {
      let projectID = projectIdOf(entry);
      let plan = "";
      let tier = null;
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, AG_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      } else {
        // Re-read the tier every round so an upgrade/downgrade replaces the cached plan;
        // a failed read yields "" and the controller keeps the previous plan.
        tier = loadCodeAssist(ctx, authIndex, AG_META).then((l) => extractPlan(l.body), () => "");
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const header = (url) => ({
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "User-Agent": url.includes("retrieveUserQuotaSummary") ? AG_SUMMARY_UA : AG_MODELS_UA,
      });
      // Last usable host per management origin, per endpoint kind.
      const ordered = (urls, kind) => {
        const preferred = agPreferred.get(`${ctx.origin}\n${kind}`);
        return urls.includes(preferred) ? [preferred, ...urls.filter((u) => u !== preferred)] : urls;
      };
      const read = async (url) => {
        const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url, header: header(url), data: JSON.stringify({ project: projectID }) });
        plan = plan || extractPlan(body);
        return body;
      };
      const isGemini = (r) => r.modelPrefixes?.includes("gemini") || r.group === GROUP_GEMINI;
      let lastError = null;
      let partial = null;
      let windows = null;
      for (const url of ordered(UPSTREAM.antigravityQuota, "summary")) {
        try {
          const rows = antigravitySummaryWindows(await read(url));
          if (rows.length === 0) continue;
          if (rows.some(isGemini)) {
            windows = rows;
            agPreferred.set(`${ctx.origin}\nsummary`, url);
            break;
          }
          // A host without the Gemini group: keep looking at the other summary hosts.
          if (partial === null) partial = { rows, url };
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
        }
      }
      if (windows === null) {
        // Per-model quota: only its Gemini pools when a summary already covers Claude/GPT.
        let modelRows = null;
        for (const url of ordered(UPSTREAM.antigravityModels, "models")) {
          try {
            const rows = antigravityModelWindows(await read(url), now());
            const useful = partial === null ? rows : rows.filter(isGemini);
            if (useful.length === 0) continue;
            modelRows = useful;
            agPreferred.set(`${ctx.origin}\nmodels`, url);
            break;
          } catch (error) {
            if (error?.code === "aborted") throw error;
            lastError = error;
          }
        }
        if (partial !== null) {
          agPreferred.set(`${ctx.origin}\nsummary`, partial.url);
          windows = [...partial.rows, ...(modelRows ?? [])];
        } else if (modelRows !== null) {
          windows = modelRows;
        }
      }
      if (windows !== null && partial !== null && !windows.some(isGemini)) {
        try {
          const body = await apiCall(ctx, {
            auth_index: authIndex,
            method: "POST",
            url: UPSTREAM.googleQuota,
            header: { Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": AG_SUMMARY_UA },
            data: JSON.stringify({ project: projectID }),
          });
          windows = [...windows, ...googleBucketWindows(body, now(), "ag-gemini")];
        } catch (error) {
          if (error?.code === "aborted") throw error;
          /* the supplementary Gemini read is best-effort */
        }
      }
      if (tier !== null) plan = (await tier) || plan;
      if (windows === null) throw lastError ?? new QuotaError("invalid-response");
      return { windows, plan };
    },

    async "gemini-cli"(ctx, entry, authIndex) {
      let projectID = projectIdOf(entry);
      let plan = "";
      let tier = null;
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, GEMINI_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      } else {
        // Same as Antigravity: refresh the tier each round; failures fall back to the cached plan.
        tier = loadCodeAssist(ctx, authIndex, GEMINI_META).then((l) => extractPlan(l.body), () => "");
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.googleQuota,
        header: googleHeaders({ ...GEMINI_META, duetProject: projectID }),
        data: JSON.stringify({ project: projectID }),
      });
      if (tier !== null) plan = (await tier) || plan;
      return { windows: googleBucketWindows(body, now(), "gemini"), plan };
    },

  };
}
