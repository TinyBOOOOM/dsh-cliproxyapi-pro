// @client-source Quota labels, windows, model matching and summaries.
    // #region Quota (额度): shared store, model matching, tab page, composer badge

    const QUOTA_POLL_MS = 60 * 1000;
    // While the host is still collecting a refresh, look again soon.
    const QUOTA_BUSY_POLL_MS = 4 * 1000;
    const PROVIDER_NAMES = {
      claude: "Claude",
      anthropic: "Claude",
      codex: "Codex",
      openai: "OpenAI",
      devin: "Devin",
      antigravity: "Antigravity",
      "gemini-cli": "Gemini CLI",
      gemini: "Gemini",
      vertex: "Vertex",
      aistudio: "AI Studio",
      kimi: "Kimi",
      meta: "Meta",
      xai: "xAI / Grok",
      qwen: "Qwen",
      iflow: "iFlow",
      glm: "GLM",
      deepseek: "DeepSeek",
      copilot: "GitHub Copilot",
    };
    const WINDOW_KEYS = { "5h": "qWin5h", "7d": "qWin7d", "30d": "qWin30d", "1d": "qWin1d" };
    const QUOTA_ERROR_KEYS = {
      unauthorized: "qErrUnauthorized",
      forbidden: "qErrForbidden",
      network: "qErrNetwork",
      timeout: "qErrTimeout",
      http: "qErrHttp",
      "invalid-response": "qErrInvalid",
      "no-endpoint": "qErrNoEndpoint",
    };
    const STATUS_KEYS = {
      active: "qStatusActive",
      disabled: "qStatusDisabled",
      unavailable: "qStatusUnavailable",
      error: "qStatusError",
    };
    const MATCH_KEYS = { "model-list": "qMatchModelList", prefix: "qMatchPrefix", family: "qMatchFamily" };

    function fmt(t, key, vars = {}) {
      let out = String(t(key));
      for (const [name, value] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(value));
      return out;
    }

    function providerName(t, provider) {
      const key = String(provider ?? "").toLowerCase();
      return PROVIDER_NAMES[key] ?? (key === "" ? t("qProviderOther") : key);
    }

    function quotaErrorText(t, account) {
      const key = QUOTA_ERROR_KEYS[account?.errorCode];
      if (key === undefined) return null;
      return fmt(t, key, { status: account.errorStatus ?? "?" });
    }

    function windowLabel(t, w) {
      const base = WINDOW_KEYS[w.kind] !== undefined ? t(WINDOW_KEYS[w.kind]) : w.label || t("qWinOther");
      return w.group ? `${w.group} · ${base}` : base;
    }

    function durationText(t, ms) {
      const total = Math.max(1, Math.ceil(ms / 60000));
      const d = Math.floor(total / 1440);
      const hrs = Math.floor((total % 1440) / 60);
      const m = total % 60;
      if (d > 0) return fmt(t, "qDurDH", { d, h: hrs });
      if (hrs > 0) return fmt(t, "qDurHM", { h: hrs, m });
      return fmt(t, "qDurM", { m });
    }

    function resetText(t, iso, now) {
      const at = Date.parse(iso ?? "");
      if (!Number.isFinite(at)) return "";
      return at <= now ? t("qResetSoon") : fmt(t, "qResetIn", { time: durationText(t, at - now) });
    }

    function agoText(t, iso, now) {
      const at = Date.parse(iso ?? "");
      if (!Number.isFinite(at)) return "";
      const s = Math.max(0, Math.floor((now - at) / 1000));
      if (s < 10) return t("qAgoJustNow");
      if (s < 60) return fmt(t, "qAgoSeconds", { n: s });
      if (s < 3600) return fmt(t, "qAgoMinutes", { n: Math.floor(s / 60) });
      if (s < 86400) return fmt(t, "qAgoHours", { n: Math.floor(s / 3600) });
      return fmt(t, "qAgoDays", { n: Math.floor(s / 86400) });
    }

    function quotaLevel(pct) {
      if (typeof pct !== "number" || !Number.isFinite(pct)) return "unknown";
      if (pct <= 0) return "empty";
      if (pct < 20) return "low";
      if (pct < 50) return "mid";
      return "ok";
    }

    function pctText(pct) {
      return typeof pct === "number" && Number.isFinite(pct) ? `${Math.round(pct)}%` : "—";
    }

    function bareModel(id) {
      const lower = String(id ?? "").toLowerCase();
      const slash = lower.indexOf("/");
      return slash >= 0 ? lower.slice(slash + 1) : lower;
    }

    /** Whether a quota window applies to `modelId` (untagged windows apply to every model). */
    function windowAppliesTo(w, modelId) {
      if (!modelId) return true;
      const full = String(modelId).toLowerCase();
      const bare = bareModel(modelId);
      if (Array.isArray(w.modelIds) && w.modelIds.length > 0) {
        return w.modelIds.some((m) => {
          const x = String(m).toLowerCase();
          return x === full || x === bare || bareModel(x) === bare;
        });
      }
      if (Array.isArray(w.modelPrefixes) && w.modelPrefixes.length > 0) {
        return w.modelPrefixes.some((p) => bare.startsWith(String(p).toLowerCase()));
      }
      return true;
    }

    function credentialWindows(cred, modelId) {
      const windows = Array.isArray(cred?.windows) ? cred.windows : [];
      return modelId ? windows.filter((w) => windowAppliesTo(w, modelId)) : windows;
    }

    /** The tightest remaining percentage of the windows that apply, or null. */
    function credentialHeadroom(cred, modelId) {
      const values = credentialWindows(cred, modelId)
        .map((w) => w.remainingPercent)
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      return values.length > 0 ? Math.min(...values) : null;
    }

    function quotaAccountForRoute(data, route) {
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      return accounts.find((a) => Array.isArray(a.routes) && a.routes.includes(route)) ?? null;
    }

    function byHeadroomDesc(a, b) {
      const ua = a.cred.status === "active" ? 0 : 1;
      const ub = b.cred.status === "active" ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const ha = a.headroom ?? -1;
      const hb = b.headroom ?? -1;
      return hb - ha;
    }

    /**
     * Quota for one picker selection: the account owning the route, then
     * exactly the credentials the host matched for this model id on that
     * server (modelIndex), never credentials of another account.
     */
    function summarizeModelQuota(data, route, modelId) {
      const account = quotaAccountForRoute(data, route);
      if (account === null) return null;
      const credentials = Array.isArray(account.credentials) ? account.credentials : [];
      const byId = new Map(credentials.map((c) => [c.id, c]));
      const ids = Array.isArray(account.modelIndex?.[modelId]) ? account.modelIndex[modelId] : [];
      const entries = ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((cred) => ({ cred, headroom: credentialHeadroom(cred, modelId), windows: credentialWindows(cred, modelId) }))
        .sort(byHeadroomDesc);
      const usable = entries.filter((e) => e.cred.status === "active");
      const known = usable.map((e) => e.headroom).filter((v) => v !== null);
      return {
        account,
        entries,
        usableCount: usable.length,
        best: known.length > 0 ? Math.max(...known) : null,
      };
    }

    /** Totals for the overview tiles. */
    function quotaStats(credentials) {
      const out = { total: 0, healthy: 0, low: 0, empty: 0, issue: 0, unknown: 0 };
      for (const cred of credentials) {
        out.total++;
        if (cred.status !== "active" || cred.quotaState === "error") {
          out.issue++;
          continue;
        }
        const level = quotaLevel(credentialHeadroom(cred));
        if (level === "empty") out.empty++;
        else if (level === "low") out.low++;
        else if (level === "ok" || level === "mid") out.healthy++;
        else out.unknown++;
      }
      return out;
    }

    /**
     * One page-wide quota client: GET the host snapshot (cached by the host,
     * which refreshes stale accounts in the background) while anything is
     * subscribed; POST refresh / key changes. Disposed with the activation.
     */
