// @client-source Media errors, diagnostics and agent-budget display helpers.
    // #region Media (生成): per-account media models and the read-only diagnostic

    const MEDIA_ERROR_KEYS = {
      "invalid-account": "mediaErrInvalidAccount",
      "invalid-request": "mediaErrInvalidRequest",
      "no-endpoint": "mediaErrNoEndpoint",
      "invalid-output-dir": "mediaErrInvalidOutputDir",
      "invalid-model": "mediaErrInvalidModel",
      "invalid-session": "mediaErrInvalidSession",
    };
    const MEDIA_KIND_KEYS = { image: "mediaKindImage", video: "mediaKindVideo", chat: "mediaKindChat" };

    function mediaErrorText(t, err) {
      const code = err instanceof Error ? err.message : String(err);
      return MEDIA_ERROR_KEYS[code] ? t(MEDIA_ERROR_KEYS[code]) : fmt(t, "mediaErrGeneric", { error: code });
    }

    function diagRouteText(t, route) {
      if (route.verdict === "present") return t("diagPresent");
      if (route.verdict === "missing") return t("diagMissing");
      if (route.verdict === "unreachable") return t("diagUnreachable");
      return fmt(t, "diagUnknown", { status: route.status ?? "?" });
    }

    function diagCatalogText(t, catalog) {
      if (catalog?.ok) return fmt(t, "diagCatalogOk", { n: catalog.count ?? 0, m: catalog.media?.length ?? 0 });
      return fmt(t, "diagCatalogFail", { reason: catalog?.status ? `HTTP ${catalog.status}` : catalog?.error ?? "?" });
    }

    function diagFieldsText(fields) {
      return Object.entries(fields ?? {})
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : String(value)}`)
        .join(" · ");
    }

    /**
     * The Generation tab of one account. Hook order matters for the test
     * harness, which seeds slot 0 (data) and slot 1 (loading).
     */
    /** Seconds limits offered for the agent's videos (plus the current value). */
    const MEDIA_BUDGET_CHOICES = [30, 60, 120, 300, 600, 1800, 3600];
    const budgetValue = (budget) => (budget?.mode === "limited" ? `limited:${budget.seconds}` : "unlimited");
    const budgetFromValue = (value) => (value === "unlimited" ? { mode: "unlimited" } : { mode: "limited", seconds: Number(String(value).split(":")[1]) });
    const budgetChoices = (current) => {
      const list = MEDIA_BUDGET_CHOICES.slice();
      if (current?.mode === "limited" && !list.includes(current.seconds)) list.push(current.seconds);
      return list.sort((a, b) => a - b);
    };

