// Google Code Assist loading and Antigravity/Gemini quota requests and fallback order.
import { UPSTREAM, AG_META, GEMINI_META, AG_UA, GROUP_GEMINI, GROUP_ARGON, GROUP_CLAUDE_GPT } from "../constants.js";
import { QuotaError, isObj, firstText, projectIdOf, extractPlan } from "../helpers.js";
import { antigravitySummaryWindows, antigravityModelWindows, googleBucketWindows } from "../parsers.js";

const agHeaders = () => ({ Authorization: "Bearer $TOKEN$", "Content-Type": "application/json", "User-Agent": AG_UA });

/** Which Antigravity quota pool a window describes: "argon", "gemini", "claude-gpt" or "other". */
function windowFamily(w) {
  const prefixes = Array.isArray(w.modelPrefixes) ? w.modelPrefixes : [];
  if (w.group === GROUP_ARGON || prefixes.includes("argon")) return "argon";
  if (w.group === GROUP_GEMINI || prefixes.includes("gemini")) return "gemini";
  if (w.group === GROUP_CLAUDE_GPT || prefixes.includes("claude")) return "claude-gpt";
  return "other";
}

function hasFamily(windows, family) {
  return Array.isArray(windows) && windows.some((w) => windowFamily(w) === family);
}

/** `base` plus the rows of families it does not have yet (unclassified rows by id). */
function mergeFamilies(base, rows) {
  if (base === null) return [...rows];
  const present = new Set(base.map(windowFamily));
  const ids = new Set(base.map((w) => w.id));
  return [...base, ...rows.filter((r) => {
    const family = windowFamily(r);
    return family === "other" ? !ids.has(r.id) : !present.has(family);
  })];
}

export function createGoogleProbes({ apiCall, now }) {
  async function loadCodeAssist(ctx, authIndex, metadata) {
    const headers = metadata.ideType === "ANTIGRAVITY" ? agHeaders() : googleHeaders(metadata);
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
      const read = async (url) => {
        const body = await apiCall(ctx, { auth_index: authIndex, method: "POST", url, header: agHeaders(), data: JSON.stringify({ project: projectID }) });
        plan = plan || extractPlan(body);
        return body;
      };
      // Hosts are always tried in their fixed order (daily first): a host
      // that answered once is not preferred later, because production's
      // Gemini numbers can read 100% regardless of use.
      let lastError = null;
      let windows = null;
      for (const url of UPSTREAM.antigravityQuota) {
        try {
          // Like CPA's management center: keep each family from the first host
          // that reports it, until one host has supplied the Gemini pool.
          windows = mergeFamilies(windows, antigravitySummaryWindows(await read(url)));
          if (hasFamily(windows, "gemini")) break;
        } catch (error) {
          if (error?.code === "aborted") throw error;
          lastError = error;
        }
      }
      if (!hasFamily(windows, "gemini")) {
        // Per-model quota supplies the families the summaries lacked.
        for (const url of UPSTREAM.antigravityModels) {
          try {
            const merged = mergeFamilies(windows, antigravityModelWindows(await read(url), now()));
            if (merged.length === (windows?.length ?? 0)) continue;
            windows = merged;
            break;
          } catch (error) {
            if (error?.code === "aborted") throw error;
            lastError = error;
          }
        }
      }
      if (windows !== null && windows.length > 0 && !hasFamily(windows, "gemini")) {
        try {
          const body = await apiCall(ctx, {
            auth_index: authIndex,
            method: "POST",
            url: UPSTREAM.googleQuota,
            header: agHeaders(),
            data: JSON.stringify({ project: projectID }),
          });
          windows = [...windows, ...googleBucketWindows(body, now(), "ag-gemini")];
        } catch (error) {
          if (error?.code === "aborted") throw error;
          /* the supplementary Gemini read is best-effort */
        }
      }
      if (tier !== null) plan = (await tier) || plan;
      if (windows === null || windows.length === 0) throw lastError ?? new QuotaError("invalid-response");
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
