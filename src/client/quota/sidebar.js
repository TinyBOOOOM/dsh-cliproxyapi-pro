// @client-source Sidebar footer quota entry: every keyed account at a glance.
    /** Accounts the sidebar summarizes: enabled, with a management key. */
    function sidebarQuotaAccounts(data) {
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      return accounts.filter((a) => a.keyConfigured === true && a.enabled !== false);
    }

    /**
     * Totals over the credentials of those accounts. `usable` leaves out
     * disabled / failing credentials; the level is the signal-bar fill.
     */
    function sidebarQuotaSummary(accounts) {
      const credentials = accounts.flatMap((a) => (Array.isArray(a.credentials) ? a.credentials : []));
      const stats = quotaStats(credentials);
      const usable = stats.total - stats.issue;
      let level = "unknown";
      if (stats.healthy > 0) level = stats.healthy * 2 >= usable ? "ok" : "mid";
      else if (stats.low > 0) level = "low";
      else if (stats.empty > 0) level = "empty";
      const loading = accounts.every((a) => a.fetchedAt === undefined && a.errorCode === undefined);
      return { stats, usable, level, loading };
    }

    /**
     * Save the global `sidebarQuota` switch (a globals-only save leaves every
     * account alone) and tell this page's sidebar entry and settings section.
     */
    async function saveSidebarQuota(on) {
      const body = await postJson(API.save, { sidebarQuota: on === true });
      announceSidebarQuota(body?.global?.sidebarQuota !== false);
      return body;
    }

    /**
     * The all-account switch at the top of the CLIProxyAPI settings section
     * (the sidebar peek also has a "hide" button for the same setting).
     */
    function SidebarQuotaSwitch({ t, on, busy, onToggle }) {
      return h(
        "div",
        { className: "dcpa-q-row dcpa-q-side-switch" },
        h(
          "div",
          { className: "dcpa-q-row-main" },
          h("div", { className: "dcpa-q-title" }, t("qSideSwitch"), h(InfoTip, { t, text: t("qSideSwitchHint") }))
        ),
        h(
          "div",
          { className: "dcpa-q-actions" },
          h(
            "button",
            {
              type: "button",
              role: "switch",
              className: "dcpa-switch",
              "aria-checked": on,
              "aria-label": t("qSideSwitch"),
              disabled: busy,
              onClick: () => onToggle(!on),
            },
            h("span", { className: "dcpa-switch-thumb" })
          )
        )
      );
    }

    /** Problems last, then least remaining first, like the Quota tab. */
    function sidebarCredentialOrder(a, b) {
      const rank = (c) => (c.status !== "active" ? 1 : 0);
      return rank(a) - rank(b) || (credentialHeadroom(a) ?? 101) - (credentialHeadroom(b) ?? 101);
    }

    function SidebarQuotaAccount({ t, account, snap, store, now }) {
      const credentials = Array.isArray(account.credentials) ? [...account.credentials].sort(sidebarCredentialOrder) : [];
      const errorText = quotaErrorText(t, account);
      const refreshing = account.refreshing === true || (snap.busy === "refresh" && snap.busyAccount === account.accountId);
      const loadingFirst = account.fetchedAt === undefined && errorText === null;
      return h(
        "section",
        { className: "dcpa-q-side-acct", "aria-label": account.displayName || account.accountId },
        h(
          "div",
          { className: "dcpa-q-pop-head" },
          h("div", { className: "dcpa-q-pop-model" }, account.displayName || account.accountId),
          h("div", { className: "dcpa-q-pop-sub" }, fmt(t, "qTotalCreds", { n: credentials.length }))
        ),
        errorText ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error" }, errorText) : null,
        loadingFirst ? h("p", { className: "dcpa-q-pop-text" }, t("qPeekLoading")) : null,
        !loadingFirst && credentials.length === 0 && account.state === "ok" ? h("p", { className: "dcpa-q-pop-text" }, t("qNoCredentials")) : null,
        credentials.length > 0 ? h(QuotaSummary, { t, credentials }) : null,
        credentials.map((cred) =>
          h(
            "div",
            { key: cred.id, className: "dcpa-q-pop-cred" },
            h(
              "div",
              { className: "dcpa-q-pop-who" },
              h("span", { className: "dcpa-q-tag" }, providerName(t, cred.provider)),
              h("span", { className: "dcpa-q-name", title: cred.label || cred.id }, cred.label || cred.id),
              CredentialTags({ t, cred })
            ),
            h(CredentialWindows, { t, cred, windows: credentialWindows(cred), now })
          )
        ),
        h(
          "div",
          { className: "dcpa-q-pop-foot" },
          h("span", null,
            account.fetchedAt ? fmt(t, "qUpdated", { time: agoText(t, account.fetchedAt, now) }) : t("qNeverUpdated"),
            account.autoRefreshPaused === true ? ` · ${t("qAccountPaused")}` : ""),
          h(
            "button",
            {
              type: "button",
              className: "dcpa-q-btn",
              disabled: snap.busy !== null || refreshing,
              onClick: () => void store?.refresh(account.accountId),
            },
            refreshing ? t("qRefreshing") : t("qRefresh")
          )
        )
      );
    }

    /**
     * `sidebar.footer.action`: signal bars for the credentials of every enabled
     * account with a management key (label and healthy count while the
     * sidebar is wide); click opens a peek listing them per account. Renders
     * nothing until such an account exists. Same shared store as the badge.
     *
     * The global `sidebarQuota` switch arrives as `sidebar` in the quota
     * snapshot. Once it reads off, the entry unsubscribes, so it adds no
     * status polling; the Quota tab's switch on this page announces changes
     * (an in-page answer then wins over the last snapshot).
     */
    function SidebarQuota({ t, wide = true, store = sharedQuota }) {
      // null = follow the snapshot; true / false = switched on this page.
      const [override, setOverride] = useState(null);
      const [seenOff, setSeenOff] = useState(false);
      const off = override === null ? seenOff : !override;
      const snap = useQuota(off ? null : store);
      const now = useNow(60 * 1000);
      const [open, setOpen] = useState(false);
      const [hiding, setHiding] = useState(false);
      const [hideError, setHideError] = useState(null);
      const wrapRef = useRef(null);
      const buttonRef = useRef(null);
      const popRef = useRef(null);
      const mounted = useRef(true);
      const popStyle = useAnchoredPeek(open, buttonRef, popRef);
      const flagOff = override === null && snap.data?.sidebar === false;
      const accounts = sidebarQuotaAccounts(snap.data);
      const visible = !off && !flagOff && store !== null && store !== undefined && accounts.length > 0;

      useEffect(() => {
        const listener = (on) => {
          setOverride(on);
          if (on) void store?.load?.();
        };
        sidebarQuotaListeners.add(listener);
        return () => {
          sidebarQuotaListeners.delete(listener);
        };
      }, [store]);

      useEffect(() => {
        if (flagOff) setSeenOff(true);
      }, [flagOff]);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      // Turn the global switch off from the peek itself; the Settings switch
      // brings the entry back.
      const hide = async () => {
        setHiding(true);
        setHideError(null);
        try {
          await saveSidebarQuota(false);
        } catch (error) {
          if (mounted.current) setHideError(error instanceof Error ? error.message : String(error));
        } finally {
          if (mounted.current) setHiding(false);
        }
      };
      useDismissPeek(open, wrapRef, buttonRef, () => setOpen(false));

      useEffect(() => {
        if (!visible && open) setOpen(false);
      }, [visible, open]);

      if (!visible) return null;
      const { stats, usable, level, loading } = sidebarQuotaSummary(accounts);
      const count = loading ? "…" : fmt(t, "qSideCount", { ok: stats.healthy, n: usable });
      const label = loading ? t("qSideLabel") : fmt(t, "qSideAria", { ok: stats.healthy, n: usable });

      const peek = open
        ? h(
            "div",
            { ref: popRef, className: "dcpa-q-pop dcpa-q-side-pop", role: "dialog", "aria-label": t("qSideLabel"), style: popStyle },
            accounts.map((account) => h(SidebarQuotaAccount, { key: account.accountId, t, account, snap, store, now })),
            snap.error ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error" }, fmt(t, "qErrLoad", { error: snap.error })) : null,
            hideError ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error", role: "alert" }, fmt(t, "qSideHideFailed", { error: hideError })) : null,
            h(
              "div",
              { className: "dcpa-q-pop-foot dcpa-q-side-foot" },
              h("span", null, t("qPeekFooter")),
              h("button", { type: "button", className: "dcpa-q-btn", disabled: hiding, onClick: () => void hide() }, t("qSideHide"))
            )
          )
        : null;

      return h(
        "div",
        { ref: wrapRef, className: "dcpa-q-side", "data-wide": wide ? "true" : "false", "data-dsh-plugin": MODULE_ID },
        h(
          "button",
          {
            ref: buttonRef,
            type: "button",
            className: "dcpa-q-side-btn",
            "aria-label": label,
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            title: wide ? undefined : label,
            onClick: () => setOpen((v) => !v),
          },
          h("span", { className: "dcpa-q-bars", "data-level": loading ? "unknown" : level, "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          wide ? h("span", { className: "dcpa-q-side-label" }, t("qSideLabel")) : null,
          wide ? h("span", { className: "dcpa-q-side-count", "data-level": loading ? "unknown" : level }, count) : null
        ),
        peek
      );
    }
