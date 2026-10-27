// @client-source Account settings section state and actions.
    /**
     * The CLIProxyAPI settings section: one account bar for every tab, then the
     * selected account's header, its 连接 / 模型 / 额度 tabs and one save bar.
     * Owns the account server data; the add-account form creates an account only
     * when the user connects it.
     */
    function CpaSettingsPanel({ t }) {
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(null); // null | "refresh" | "save" | "patch" | "add" | "remove" | "test"
      const [loadError, setLoadError] = useState(null);
      const [notice, setNotice] = useState(null); // { tone: "ok" | "error", text }
      const [data, setData] = useState(null);
      const [activeId, setActiveId] = useState(null);
      // Bumped whenever the server's saved config should replace the drafts.
      const [rev, setRev] = useState(0);
      const [adding, setAdding] = useState(false);
      const dirtyRef = useRef(false);

      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

      const fetchStatus = useCallback(async () => {
        try {
          const res = await fetch(API.status, { cache: "no-store" });
          const body = await res.json();
          if (!res.ok || body.ok === false) {
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          setData(body);
          setRev((r) => r + 1);
          setLoadError(null);
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        void fetchStatus();
      }, [fetchStatus]);

      // Success messages fade after a few seconds; errors stay until the next action.
      useEffect(() => {
        if (notice?.tone !== "ok") return undefined;
        const id = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(id);
      }, [notice]);

      const confirmDiscard = useCallback(() => {
        if (!dirtyRef.current) return true;
        if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
        return window.confirm(t("discardConfirm"));
      }, [t]);

      const run = useCallback(async (kind, fn) => {
        setBusy(kind);
        setNotice(null);
        try {
          return await fn();
        } catch (err) {
          setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
          return undefined;
        } finally {
          setBusy(null);
        }
      }, []);

      const selectAccount = (id) => {
        if (id === active?.id && !adding) return;
        if (!confirmDiscard()) return;
        dirtyRef.current = false;
        setAdding(false);
        setNotice(null);
        setActiveId(id);
        setRev((r) => r + 1);
      };

      const actions = {
        refresh: (accountId) =>
          run("refresh", async () => {
            setData(await postJson(API.refresh, { accountId }));
          }),
        save: (accountId, payload) =>
          run("save", async () => {
            setData(await postJson(API.save, { ...payload, accountId }));
            dirtyRef.current = false;
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: t("savedToast") });
          }),
        // One field, applied at once (enable switch, clear key); drafts stay.
        patch: (accountId, patch, okText) =>
          run("patch", async () => {
            setData(await postJson(API.save, { ...patch, accountId }));
            if (okText) setNotice({ tone: "ok", text: okText });
          }),
        test: (accountId, draft) =>
          run("test", async () => (await postJson(API.testAccount, { ...(accountId ? { accountId } : {}), ...draft })).test),
        remove: (account) => {
          const name = account.config?.displayName || account.id;
          if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(fmt(t, "removeConfirm", { name }))) return;
          void run("remove", async () => {
            const body = await postJson(API.removeAccount, { accountId: account.id });
            dirtyRef.current = false;
            setData(body);
            setActiveId(body.accounts?.[0]?.id ?? null);
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: t("removedToast") });
          });
        },
        // Fresh account status from another request (a media reclassification
        // re-synced routes); drafts stay, so `rev` is not bumped.
        adopt: (payload) => {
          if (Array.isArray(payload?.accounts)) setData(payload);
        },
        // Reload the drafts from the saved config.
        discard: () => {
          dirtyRef.current = false;
          setNotice(null);
          setRev((r) => r + 1);
        },
        add: (draft, enabled) =>
          run("add", async () => {
            const body = await postJson(API.addAccount, { ...draft, enabled });
            setData(body);
            if (body.createdId) setActiveId(body.createdId);
            setAdding(false);
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: enabled ? t("addedToast") : t("addedDisabledToast") });
          }),
      };

      const showAdd = adding || (!loading && data !== null && accounts.length === 0);

      return h(
        "div",
        { className: "dcpa-wrap dcpa-q", "data-dsh-plugin": MODULE_ID },
        h(
          "div",
          { className: "dcpa-acct-bar" },
          accounts.length > 0
            ? h(
                "div",
                { className: "dcpa-q-seg", role: "tablist", "aria-label": t("accountsLabel") },
                accounts.map((a) =>
                  h(
                    "button",
                    {
                      key: a.id,
                      type: "button",
                      role: "tab",
                      className: "dcpa-q-seg-tab",
                      "aria-selected": !showAdd && active?.id === a.id,
                      title: a.config?.provider,
                      onClick: () => selectAccount(a.id),
                    },
                    h("span", { className: stateDotClass(a.config?.enabled === false ? "idle" : a.status?.state) }),
                    a.config?.displayName || a.id
                  )
                )
              )
            : null,
          h(
            "button",
            {
              type: "button",
              className: "dcpa-q-btn",
              "data-variant": "outline",
              disabled: busy !== null || loading || showAdd,
              onClick: () => {
                if (!confirmDiscard()) return;
                dirtyRef.current = false;
                setNotice(null);
                setAdding(true);
              },
            },
            t("addAccountBtn")
          )
        ),
        loadError ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, loadError) : null,
        showAdd
          ? h(AddAccountForm, {
              t,
              busy,
              notice,
              canCancel: accounts.length > 0,
              onCancel: () => {
                setAdding(false);
                setNotice(null);
              },
              onTest: (draft) => actions.test(undefined, draft),
              onAdd: actions.add,
            })
          : active
          ? h(AccountPanel, {
              key: active.id,
              t,
              account: active,
              global: data?.global ?? {},
              rev,
              busy,
              notice,
              actions,
              onDirtyChange: (dirty) => {
                dirtyRef.current = dirty;
              },
            })
          : null
      );
    }

