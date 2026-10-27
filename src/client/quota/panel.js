// @client-source Quota meters, credential rows and account quota panel.
    function QuotaMeter({ t, w, now }) {
      const pct = typeof w.remainingPercent === "number" ? Math.max(0, Math.min(100, w.remainingPercent)) : null;
      const level = quotaLevel(pct);
      const reset = resetText(t, w.resetAt, now);
      const label = windowLabel(t, w);
      return h(
        "div",
        { className: "dcpa-q-meter", "data-level": level },
        h(
          "div",
          { className: "dcpa-q-meter-top" },
          h("span", { title: label }, label),
          h("span", { className: "dcpa-q-pct" }, pctText(pct))
        ),
        h(
          "div",
          {
            className: "dcpa-q-track",
            role: "meter",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            ...(pct === null ? {} : { "aria-valuenow": Math.round(pct) }),
          },
          h("span", { className: "dcpa-q-fill", style: { width: `${pct ?? 0}%` } })
        ),
        reset ? h("span", { className: "dcpa-q-reset" }, reset) : null
      );
    }

    function CredentialTags({ t, cred }) {
      return [
        cred.plan ? h("span", { key: "plan", className: "dcpa-q-tag", "data-tone": "info" }, cred.plan) : null,
        cred.prefix ? h("span", { key: "prefix", className: "dcpa-q-tag" }, `${cred.prefix}/`) : null,
        cred.status && cred.status !== "active"
          ? h("span", { key: "status", className: "dcpa-q-tag", "data-tone": "danger" }, t(STATUS_KEYS[cred.status] ?? "qStatusError"))
          : null,
      ];
    }

    function CredentialWindows({ t, cred, windows, now }) {
      const failed = cred.quotaState === "error";
      const paused = cred.autoRefreshPaused === true;
      const lines = [
        failed || paused
          ? h("p", { key: "q", className: "dcpa-q-note", "data-tone": "error" },
              failed ? t("qQuotaError") : null,
              paused ? `${failed ? " · " : ""}${t("qCredentialPaused")}` : null)
          : windows.length === 0
            ? h("p", { key: "q", className: "dcpa-q-note" }, t(cred.quotaState === "unsupported" ? "qQuotaUnsupported" : "qQuotaNone"))
            : null,
        windows.length === 0 && cred.recent ? h("p", { key: "r", className: "dcpa-q-note" }, fmt(t, "qRecent", cred.recent)) : null,
      ];
      return h("div", { className: "dcpa-q-meters" },
        windows.map((w, i) => h(QuotaMeter, { key: w.id ?? i, t, w, now })),
        lines.some(Boolean) ? h("div", null, lines) : null);
    }

    function CredentialRow({ t, cred, now, pickerIds }) {
      const [open, setOpen] = useState(false);
      const models = Array.isArray(cred.models) ? cred.models : null;
      return h(
        "div",
        { className: "dcpa-q-cred", "data-status": cred.status ?? "active" },
        h(
          "div",
          { className: "dcpa-q-who" },
          h("div", { className: "dcpa-q-name", title: cred.label || cred.id }, cred.label || cred.id),
          h(
            "div",
            { className: "dcpa-q-meta" },
            CredentialTags({ t, cred }),
            models === null
              ? h("span", null, t("qModelsUnknown"))
              : h(
                  "button",
                  { type: "button", className: "dcpa-q-link", "aria-expanded": open, onClick: () => setOpen((v) => !v) },
                  open ? t("qHideModels") : fmt(t, "qShowModels", { n: models.length })
                ),
            cred.statusMessage ? h("span", { title: cred.statusMessage }, cred.statusMessage) : null
          )
        ),
        h(CredentialWindows, { t, cred, windows: credentialWindows(cred), now }),
        open && models !== null
          ? h(
              "div",
              { className: "dcpa-q-models" },
              models.map((m) => h("code", { key: m, "data-picker": pickerIds.has(m) ? "true" : "false" }, m))
            )
          : null
      );
    }

    function ModelChannelMap({ t, account }) {
      const picker = Array.isArray(account.pickerModels) ? account.pickerModels : [];
      return h(
        "details",
        { className: "dcpa-q-map" },
        h(
          "summary",
          null,
          h(
            "div",
            { className: "dcpa-q-row-main" },
            h("div", { className: "dcpa-q-title" }, t("qMapTitle"), h(InfoTip, { t, text: t("qMapHint") }))
          )
        ),
        picker.length === 0
          ? h("p", { className: "dcpa-q-msg" }, t("qMapEmpty"))
          : picker.map((m) => {
              const summary = summarizeModelQuota({ accounts: [account] }, m.route, m.id);
              const entries = summary?.entries ?? [];
              const matchedBy = account.modelMatch?.[m.id];
              return h(
                "div",
                { key: `${m.route}:${m.id}`, className: "dcpa-q-map-row" },
                h("span", { className: "dcpa-q-map-model" }, m.id),
                h(
                  "span",
                  { className: "dcpa-q-map-creds" },
                  entries.length === 0
                    ? h("span", null, t("qMapNone"))
                    : entries.map(({ cred }) =>
                        h(
                          "span",
                          { key: cred.id, className: "dcpa-q-tag", "data-tone": cred.status === "active" ? undefined : "danger", title: cred.label || cred.id },
                          `${providerName(t, cred.provider)} · ${cred.label || cred.id}`
                        )
                      ),
                  matchedBy && MATCH_KEYS[matchedBy] ? h("span", null, t(MATCH_KEYS[matchedBy])) : null
                ),
                h("span", { className: "dcpa-q-map-pct dcpa-q-pct" }, pctText(summary?.best))
              );
            })
      );
    }

    function QuotaSummary({ t, credentials }) {
      const stats = quotaStats(credentials);
      const parts = [
        ["ok", stats.healthy, "qStatHealthy"],
        ["low", stats.low, "qStatLow"],
        ["empty", stats.empty, "qStatEmpty"],
        ["issue", stats.issue, "qStatIssue"],
        ["unknown", stats.unknown, "qStatUnknown"],
      ];
      return h(
        "div",
        { className: "dcpa-q-summary" },
        h(
          "div",
          { className: "dcpa-q-dist", role: "img", "aria-label": fmt(t, "qTotalCreds", { n: stats.total }) },
          parts.filter(([, n]) => n > 0).map(([level, n]) => h("span", { key: level, "data-level": level, style: { flex: `${n} 1 0` } }))
        ),
        h(
          "div",
          { className: "dcpa-q-legend" },
          h("span", null, fmt(t, "qTotalCreds", { n: stats.total })),
          parts.filter(([level, n]) => level !== "unknown" || n > 0).map(([level, n, key]) =>
            h("span", { key: level, "data-level": level }, h("i", { className: "dcpa-q-swatch" }), t(key), h("b", null, String(n)))
          )
        )
      );
    }

    /** The "额度" tab: flat DSH settings rows, one account at a time. */
    function QuotaPanel({ t, store = sharedQuota, accountId }) {
      const snap = useQuota(store);
      const now = useNow(30 * 1000);
      const [activeId, setActiveId] = useState(null);
      const [keyDraft, setKeyDraft] = useState("");
      const [notice, setNotice] = useState(null);
      const [providerFilter, setProviderFilter] = useState("all");
      const [search, setSearch] = useState("");

      const accounts = Array.isArray(snap.data?.accounts) ? snap.data.accounts : [];
      const scoped = accountId !== undefined;
      const account = scoped
        ? accounts.find((a) => a.accountId === accountId) ?? null
        : accounts.find((a) => a.accountId === activeId) ?? accounts[0] ?? null;
      const credentials = Array.isArray(account?.credentials) ? account.credentials : [];
      const pickerIds = useMemo(() => new Set((account?.pickerModels ?? []).map((m) => m.id)), [account]);
      const busy = snap.busy !== null;

      const providers = useMemo(() => {
        const counts = new Map();
        for (const c of credentials) counts.set(c.provider || "", (counts.get(c.provider || "") ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      }, [credentials]);

      const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const map = new Map();
        for (const c of credentials) {
          if (providerFilter !== "all" && (c.provider || "") !== providerFilter) continue;
          if (
            q !== "" &&
            !String(c.label ?? "").toLowerCase().includes(q) &&
            !String(c.id ?? "").toLowerCase().includes(q) &&
            !(Array.isArray(c.models) && c.models.some((m) => String(m).toLowerCase().includes(q)))
          ) continue;
          const key = c.provider || "";
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(c);
        }
        // Problems first, then least remaining, so what needs attention is on top.
        const rank = (c) => (c.status !== "active" ? 1 : 0);
        return [...map.entries()].map(([key, list]) => [
          key,
          [...list].sort((a, b) => rank(a) - rank(b) || (credentialHeadroom(a) ?? 101) - (credentialHeadroom(b) ?? 101)),
        ]);
      }, [credentials, providerFilter, search]);

      if (store === null || store === undefined) return null;

      const saveKey = async () => {
        if (account === null || keyDraft.trim() === "") return;
        setNotice(null);
        const result = await store.saveKey(account.accountId, keyDraft.trim());
        if (result.ok) {
          setKeyDraft("");
          setNotice(t("qKeySaved"));
        }
      };
      const clearKey = async () => {
        if (account === null) return;
        const name = account.displayName || account.accountId;
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(fmt(t, "qKeyClearConfirm", { name }))) return;
        setNotice(null);
        const result = await store.clearKey(account.accountId);
        if (result.ok) setNotice(t("qKeyCleared"));
      };

      const errorText = account ? quotaErrorText(t, account) : null;
      const refreshing = account?.refreshing === true || (snap.busy === "refresh" && snap.busyAccount === account?.accountId);
      const shown = groups.reduce((n, [, list]) => n + list.length, 0);

      return h(
        "div",
        { className: "dcpa-q", "data-dsh-plugin": MODULE_ID },
        scoped
          ? null
          : h(
              "div",
              { className: "dcpa-q-head" },
              h("h3", { className: "dcpa-q-h" }, t("qTitle")),
              h("p", { className: "dcpa-q-desc" }, t("qSubtitle"))
            ),
        scoped && account === null ? h("p", { className: "dcpa-q-msg" }, t("qPeekLoading")) : null,
        !scoped && accounts.length > 1
          ? h(
              "div",
              { className: "dcpa-q-seg", role: "tablist", "aria-label": t("qAccountsLabel") },
              accounts.map((a) =>
                h(
                  "button",
                  {
                    key: a.accountId,
                    type: "button",
                    role: "tab",
                    className: "dcpa-q-seg-tab",
                    "aria-selected": account?.accountId === a.accountId,
                    onClick: () => {
                      setActiveId(a.accountId);
                      setKeyDraft("");
                      setNotice(null);
                      setProviderFilter("all");
                      setSearch("");
                    },
                  },
                  a.displayName || a.accountId,
                  a.keyConfigured ? null : h("span", { className: "dcpa-q-seg-note" }, t("qKeyStatusUnset"))
                )
              )
            )
          : null,
        snap.data !== null && accounts.length === 0 ? h("p", { className: "dcpa-q-msg" }, t("qNoAccounts")) : null,
        account
          ? h(
              "div",
              { className: "dcpa-q-row" },
              h(
                "div",
                { className: "dcpa-q-row-main" },
                h(
                  "div",
                  { className: "dcpa-q-title" },
                  h("label", { htmlFor: `dcpa-q-key-${account.accountId}` }, t("qKeyLabel")),
                  h(InfoTip, { t, text: fmt(t, "qKeyHint", { ref: account.keyRef ?? "" }) })
                )
              ),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h(
                  "span",
                  { className: "dcpa-q-tag", "data-tone": account.keyConfigured ? "success" : undefined },
                  account.keyConfigured ? t("qKeyStatusSet") : t("qKeyStatusUnset")
                )
              )
            )
          : null,
        account
          ? h(
              "div",
              { className: "dcpa-q-form" },
              h("input", {
                id: `dcpa-q-key-${account.accountId}`,
                className: "dcpa-q-input",
                type: "password",
                autoComplete: "off",
                spellCheck: false,
                value: keyDraft,
                placeholder: account.keyConfigured ? t("qKeySetPlaceholder") : t("qKeyUnsetPlaceholder"),
                onChange: (e) => setKeyDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") void saveKey();
                },
              }),
              h(
                "button",
                { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy || keyDraft.trim() === "", onClick: () => void saveKey() },
                snap.busy === "save" ? t("qKeySaving") : t("qKeySave")
              ),
              account.keyConfigured
                ? h(
                    "button",
                    { type: "button", className: "dcpa-q-btn", "data-variant": "danger", disabled: busy, onClick: () => void clearKey() },
                    t("qKeyClear")
                  )
                : null
            )
          : null,
        account && account.keyConfigured
          ? h(
              "div",
              { className: "dcpa-q-row" },
              h(
                "div",
                { className: "dcpa-q-row-main" },
                h("div", { className: "dcpa-q-title" }, t("qDataLabel"), h(InfoTip, { t, text: t("qRefreshPolicy") })),
                h(
                  "div",
                  { className: "dcpa-q-sub" },
                  refreshing
                    ? t("qRefreshing")
                    : account.fetchedAt
                    ? fmt(t, "qUpdated", { time: agoText(t, account.fetchedAt, now) })
                    : t("qNeverUpdated"),
                  account.enabled === false ? ` · ${t("qAccountDisabled")}` : "",
                  account.autoRefreshPaused === true ? ` · ${t("qAccountPaused")}` : ""
                )
              ),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy || refreshing, onClick: () => void store.refresh(account.accountId) },
                  t("qRefresh")
                )
              )
            )
          : null,
        errorText ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, errorText, credentials.length > 0 ? ` ${t("qStale")}` : "") : null,
        snap.error ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "qErrLoad", { error: snap.error })) : null,
        notice ? h("p", { className: "dcpa-q-msg", "data-tone": "ok", role: "status" }, notice) : null,
        account && account.keyConfigured && credentials.length === 0 && account.state === "ok"
          ? h("p", { className: "dcpa-q-msg" }, t("qNoCredentials"))
          : null,
        account && account.keyConfigured && credentials.length > 0 ? h(QuotaSummary, { t, credentials }) : null,
        account && account.keyConfigured && (providers.length > 1 || credentials.length > 8)
          ? h(
              "div",
              { className: "dcpa-q-tools" },
              providers.length > 1
                ? [["all", credentials.length], ...providers].map(([key, count]) =>
                    h(
                      "button",
                      {
                        key: key || "_",
                        type: "button",
                        className: "dcpa-q-filter",
                        "aria-pressed": providerFilter === key,
                        onClick: () => setProviderFilter(key),
                      },
                      key === "all" ? t("qFilterAll") : providerName(t, key),
                      h("small", null, String(count))
                    )
                  )
                : null,
              credentials.length > 8
                ? h("input", {
                    className: "dcpa-q-input",
                    type: "search",
                    value: search,
                    placeholder: t("qSearchPlaceholder"),
                    "aria-label": t("qSearchPlaceholder"),
                    onChange: (e) => setSearch(e.target.value),
                  })
                : null
            )
          : null,
        account && account.keyConfigured && credentials.length > 0 && shown === 0 ? h("p", { className: "dcpa-q-msg" }, t("qNoMatch")) : null,
        account && account.keyConfigured
          ? groups.map(([key, list]) =>
              h(
                "section",
                { key: key || "_", "aria-label": providerName(t, key) },
                h("div", { className: "dcpa-q-group-title" }, providerName(t, key), h("small", null, String(list.length))),
                list.map((cred) => h(CredentialRow, { key: cred.id, t, cred, now, pickerIds }))
              )
            )
          : null,
        account && account.keyConfigured && credentials.length > 0 ? h(ModelChannelMap, { t, account }) : null
      );
    }

