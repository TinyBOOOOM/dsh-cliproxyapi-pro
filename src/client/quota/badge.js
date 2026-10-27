// @client-source Current-model selection subscription and composer quota badge.
    /** Snapshot of the session's model directory (current or pending selection). */
    function useSelection(directory) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (!directory || typeof directory.subscribe !== "function") return undefined;
        let alive = true;
        const off = directory.subscribe(() => {
          if (alive) setTick((n) => n + 1);
        });
        return () => {
          alive = false;
          off?.();
        };
      }, [directory]);
      const snapshot = directory && typeof directory.getSnapshot === "function" ? directory.getSnapshot() : null;
      const current = snapshot?.pending ?? snapshot?.current ?? null;
      return current && typeof current.provider === "string" && typeof current.model === "string" ? current : null;
    }

    /**
     * Composer badge left of the model picker: signal bars + best remaining
     * percentage of the credentials that serve the selected model on the
     * selected model's own CPA account; click opens a peek list. Accounts
     * without a management key show nothing.
     */
    function QuotaBadge({ t, directory: directProp = null, resolveDirectory = null, store = sharedQuota, sessionId = null, placement = "composer", presence = composerBadges }) {
      const shadowed = useBadgePlacement(placement, sessionId, presence);
      const directory = useDirectory(directProp, shadowed ? null : resolveDirectory);
      const selection = useSelection(shadowed ? null : directory);
      const snap = useQuota(selection ? store : null);
      const now = useNow(60 * 1000);
      const [open, setOpen] = useState(false);
      const [pos, setPos] = useState(null);
      const wrapRef = useRef(null);
      const buttonRef = useRef(null);

      const summary = selection ? summarizeModelQuota(snap.data, selection.provider, selection.model) : null;
      const visible = !shadowed && summary !== null && summary.account.keyConfigured === true;

      useEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const rect = buttonRef.current?.getBoundingClientRect?.();
          if (!rect || typeof window === "undefined") return;
          const width = Math.min(340, window.innerWidth - 32);
          const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
          setPos({ left, bottom: Math.max(16, window.innerHeight - rect.top + 6), width });
        };
        place();
        const onDown = (e) => {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            setOpen(false);
            buttonRef.current?.focus?.();
          }
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", place);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", place);
        };
      }, [open]);

      useEffect(() => {
        if (!visible && open) setOpen(false);
      }, [visible, open]);

      if (!visible) return null;
      const { account, entries, best, usableCount } = summary;
      const loadingFirst = account.fetchedAt === undefined && (account.state === "loading" || account.refreshing === true || account.state === "idle");
      const level = quotaLevel(best);
      const label = fmt(t, "qBadgeLabel", { model: selection.model });
      const errorText = quotaErrorText(t, account);
      const refreshing = account.refreshing === true || snap.busy === "refresh";

      const peek = open
        ? h(
            "div",
            {
              className: "dcpa-q-pop",
              role: "dialog",
              "aria-label": label,
              style: pos ? { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px` } : { visibility: "hidden" },
            },
            h(
              "div",
              { className: "dcpa-q-pop-head" },
              h("div", { className: "dcpa-q-pop-model" }, selection.model),
              h("div", { className: "dcpa-q-pop-sub" }, `${account.displayName || account.accountId} · ${fmt(t, "qPeekCreds", { n: usableCount })}`)
            ),
            errorText ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error" }, errorText) : null,
            loadingFirst ? h("p", { className: "dcpa-q-pop-text" }, t("qPeekLoading")) : null,
            !loadingFirst && entries.length === 0 ? h("p", { className: "dcpa-q-pop-text" }, t("qPeekNoCreds")) : null,
            entries.map(({ cred, windows, headroom }, index) =>
              h(
                "div",
                { key: cred.id, className: "dcpa-q-pop-cred" },
                h(
                  "div",
                  { className: "dcpa-q-pop-who" },
                  h("span", { className: "dcpa-q-tag" }, providerName(t, cred.provider)),
                  h("span", { className: "dcpa-q-name", title: cred.label || cred.id }, cred.label || cred.id),
                  index === 0 && cred.status === "active" && headroom !== null && entries.length > 1
                    ? h("span", { className: "dcpa-q-tag", "data-tone": "success" }, t("qPeekBest"))
                    : null,
                  CredentialTags({ t, cred })
                ),
                h(CredentialWindows, { t, cred, windows, now })
              )
            ),
            h(
              "div",
              { className: "dcpa-q-pop-foot" },
              h("span", null,
                account.fetchedAt ? fmt(t, "qUpdated", { time: agoText(t, account.fetchedAt, now) }) : t("qPeekFooter"),
                account.autoRefreshPaused === true ? ` · ${t("qAccountPaused")}` : ""),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-q-btn",
                  disabled: snap.busy !== null || account.refreshing === true,
                  onClick: () => void store?.refresh(account.accountId),
                },
                refreshing ? t("qRefreshing") : t("qRefresh")
              )
            )
          )
        : null;

      return h(
        "span",
        { ref: wrapRef, className: "dcpa-q-wrap", "data-placement": placement, "data-dsh-plugin": MODULE_ID },
        h(
          "button",
          {
            ref: buttonRef,
            type: "button",
            className: "dcpa-q-badge",
            "data-level": level,
            "aria-label": label,
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            title: label,
            onClick: () => setOpen((v) => !v),
          },
          h("span", { className: "dcpa-q-bars", "data-level": level, "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          h("span", { className: "dcpa-q-badge-pct" }, loadingFirst ? "…" : pctText(best))
        ),
        peek
      );
    }

    // #endregion

