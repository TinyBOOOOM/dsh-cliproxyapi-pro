// Google Code Assist loading and Antigravity/Gemini quota requests and fallback order.
import { UPSTREAM, AG_META, GEMINI_META, AG_SUMMARY_UA, AG_MODELS_UA } from "../constants.js";
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
    async antigravity(ctx, entry, authIndex, currentPlan) {
      let projectID = projectIdOf(entry);
      let plan = "";
      let tier = null;
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, AG_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      } else if (currentPlan === "") {
        tier = loadCodeAssist(ctx, authIndex, AG_META).then((l) => extractPlan(l.body), () => "");
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const header = (url) => ({
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
        "User-Agent": url.includes("retrieveUserQuotaSummary") ? AG_SUMMARY_UA : AG_MODELS_UA,
      });
      const urls = [...UPSTREAM.antigravityQuota, ...UPSTREAM.antigravityModels];
      const preferred = agPreferred.get(ctx.origin);
      const ordered = preferred === undefined ? urls : [preferred, ...urls.filter((u) => u !== preferred)];
      let lastError = null;
      let partial = null;
      let windows = null;
      for (const url of ordered) {
        const summary = url.includes("retrieveUserQuotaSummary");
        if (partial !== null && !summary) continue;
        try {
          const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url, header: header(url), data: JSON.stringify({ project: projectID }) });
          plan = plan || extractPlan(body);
          const rows = summary ? antigravitySummaryWindows(body) : [];
          if (rows.length > 0) {
            if (rows.some((r) => r.modelPrefixes?.includes("gemini"))) {
              windows = rows;
              agPreferred.set(ctx.origin, url);
              break;
            }
            // A host without the Gemini group: keep looking at the other summary hosts.
            if (partial === null) partial = { rows, url };
            continue;
          }
          const modelRows = antigravityModelWindows(body, now());
          if (modelRows.length > 0) {
            windows = modelRows;
            agPreferred.set(ctx.origin, url);
            break;
          }
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
        }
      }
      if (windows === null && partial !== null) {
        windows = partial.rows;
        agPreferred.set(ctx.origin, partial.url);
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
      if (tier !== null) plan = plan || (await tier);
      if (windows === null) throw lastError ?? new QuotaError("invalid-response");
      return { windows, plan };
    },

    async "gemini-cli"(ctx, entry, authIndex) {
      let projectID = projectIdOf(entry);
      let plan = "";
      if (projectID === "") {
        const loaded = await loadCodeAssist(ctx, authIndex, GEMINI_META);
        projectID = loaded.projectID;
        plan = extractPlan(loaded.body);
      }
      if (projectID === "") throw new QuotaError("missing-project");
      const body = await apiCall(ctx, {
        auth_index: authIndex,
        method: "POST",
        url: UPSTREAM.googleQuota,
        header: googleHeaders({ ...GEMINI_META, duetProject: projectID }),
        data: JSON.stringify({ project: projectID }),
      });
      return { windows: googleBucketWindows(body, now(), "gemini"), plan };
    },

  };
}
