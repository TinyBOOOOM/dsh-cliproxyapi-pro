// @client-source AccountPanel state, actions and connection tab; continued verbatim in account-panel-models.part.js.
    function AccountPanel({ t, account, global, rev, busy, notice, actions, onDirtyChange }) {
      const syncing = busy === "refresh";
      const saving = busy === "save";

      const [tab, setTab] = useState("connection");
      const [menuOpen, setMenuOpen] = useState(false);
      const menuRef = useRef(null);
      const [testResult, setTestResult] = useState(null);

      // Model filter UI state
      const [search, setSearch] = useState("");
      const [tabFilter, setTabFilter] = useState("all"); // "all" | "selected" | "unselected"
      const [familyFilter, setFamilyFilter] = useState("all");
      const [selectedIds, setSelectedIds] = useState(() => new Set());
      const [savedIdsKey, setSavedIdsKey] = useState("");
      const [modelOverrides, setModelOverrides] = useState({});
      const [savedOverridesKey, setSavedOverridesKey] = useState("{}");
      const [editingId, setEditingId] = useState(null);

      // Form draft state
      const [baseURL, setBaseURL] = useState("");
      const [apiKeyDraft, setApiKeyDraft] = useState("");
      // "auto" or the protocol every model is fixed to.
      const [protocol, setProtocol] = useState("auto");
      const [provider, setProvider] = useState("cli-proxy");
      const [displayName, setDisplayName] = useState("CLI Proxy API");
      const [apiKeyEnv, setApiKeyEnv] = useState("CLI_PROXY_API_KEY");
      const [includePrefix, setIncludePrefix] = useState("");
      const [excludePrefix, setExcludePrefix] = useState("");
      const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState("300");
      const [probeTimeoutMs, setProbeTimeoutMs] = useState("5000");

      const savedConnection = (c = account.config ?? {}) => ({
        baseURL: c.baseURL ?? "",
        protocol: c.protocolMode === "fixed" ? c.protocol ?? "openai-completions" : "auto",
        provider: c.provider ?? "cli-proxy",
        displayName: c.displayName ?? "CLI Proxy API",
        apiKeyEnv: c.effectiveApiKeyEnv ?? c.apiKeyEnv ?? "CLI_PROXY_API_KEY",
        includePrefix: c.includePrefix ?? "",
        excludePrefix: c.excludePrefix ?? "",
        refreshIntervalSeconds: String(global?.refreshIntervalSeconds ?? 300),
      });

      // Load the drafts from the saved config on mount and after every save.
      useEffect(() => {
        const c = account.config ?? {};
        const saved = savedConnection(c);
        setBaseURL(saved.baseURL);
        setProtocol(saved.protocol);
        setProvider(saved.provider);
        setDisplayName(saved.displayName);
        setApiKeyEnv(saved.apiKeyEnv);
        setIncludePrefix(saved.includePrefix);
        setExcludePrefix(saved.excludePrefix);
        setRefreshIntervalSeconds(saved.refreshIntervalSeconds);
        setProbeTimeoutMs(String(global?.probeTimeoutMs ?? 5000));
        setApiKeyDraft("");
        setTestResult(null);

        const sel = Array.isArray(c.selectedModels)
          ? c.selectedModels
          : Array.isArray(account.status?.models)
          ? account.status.models.map((m) => m.id)
          : [];
        const nextSet = new Set(sel);
        setSelectedIds(nextSet);
        setSavedIdsKey([...nextSet].sort().join("\0"));
        const nextOverrides = cloneOverrides(c.modelOverrides);
        setModelOverrides(nextOverrides);
        setSavedOverridesKey(overridesKey(nextOverrides));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [rev]);

      useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        const onKey = (e) => {
          if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [menuOpen]);

      const payload = () => ({
        baseURL: baseURL.trim(),
        protocolMode: protocol === "auto" ? "auto" : "fixed",
        ...(protocol === "auto" ? {} : { protocol }),
        provider: provider.trim() || account.config?.provider || "cli-proxy",
        displayName: displayName.trim() || account.config?.displayName || "CLI Proxy API",
        apiKeyEnv: apiKeyEnv.trim() || account.config?.apiKeyEnv || "CLI_PROXY_API_KEY",
        includePrefix: includePrefix.trim(),
        excludePrefix: excludePrefix.trim(),
        // Before the first catalog is seen, an empty draft is not a choice:
        // leave the selection unset so the first probe can recommend one.
        ...(selectedIds.size > 0 || (account.status?.allModels?.length ?? 0) > 0
          ? { selectedModels: [...selectedIds] }
          : {}),
        modelOverrides,
        refreshIntervalSeconds: Math.max(15, Number(refreshIntervalSeconds) || 300),
        probeTimeoutMs: Math.max(250, Number(probeTimeoutMs) || 5000),
        ...(apiKeyDraft.trim() !== "" ? { apiKey: apiKeyDraft.trim() } : {}),
      });

      const st = account.status ?? { state: "idle", modelCount: 0, models: [], allModels: [] };
      const cred = account.credential ?? { configured: false, ref: apiKeyEnv };
      const effectiveUrl = account.config?.effectiveBaseURL || "";
      const enabled = account.config?.enabled !== false;

      // Chat models only: image / video models live on the Generation tab.
      const allModels = useMemo(() => {
        const list =
          Array.isArray(st.allModels) && st.allModels.length > 0 ? st.allModels : Array.isArray(st.models) ? st.models : [];
        return list.filter((m) => (m.kind ?? "chat") === "chat");
      }, [st.allModels, st.models]);
      const mediaCount = useMemo(
        () => (Array.isArray(st.allModels) ? st.allModels.filter((m) => m.kind === "image" || m.kind === "video").length : 0),
        [st.allModels]
      );

      const families = useMemo(() => {
        const counts = new Map();
        for (const m of allModels) {
          const fam = m.family || "other";
          counts.set(fam, (counts.get(fam) ?? 0) + 1);
        }
        return [...counts.entries()];
      }, [allModels]);

      const visibleModels = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allModels.filter((m) => {
          const isChecked = selectedIds.has(m.id);
          if (tabFilter === "selected" && !isChecked) return false;
          if (tabFilter === "unselected" && isChecked) return false;
          if (familyFilter !== "all" && (m.family || "other") !== familyFilter) return false;
          if (q) {
            const matchId = String(m.id).toLowerCase().includes(q);
            const matchName = String(m.name ?? "").toLowerCase().includes(q);
            if (!matchId && !matchName) return false;
          }
          return true;
        });
      }, [allModels, search, tabFilter, familyFilter, selectedIds]);

      // A saved selection may still name a model that is now a media model; it
      // stays saved but is not counted here.
      const selectedChatCount = useMemo(
        () => allModels.reduce((n, m) => n + (selectedIds.has(m.id) ? 1 : 0), 0),
        [allModels, selectedIds]
      );
      const currentIdsKey = useMemo(() => [...selectedIds].sort().join("\0"), [selectedIds]);
      const currentOverridesKey = useMemo(() => overridesKey(modelOverrides), [modelOverrides]);
      const draftConnection = {
        baseURL,
        protocol,
        provider,
        displayName,
        apiKeyEnv,
        includePrefix,
        excludePrefix,
        refreshIntervalSeconds,
      };
      const dirty =
        currentIdsKey !== savedIdsKey ||
        currentOverridesKey !== savedOverridesKey ||
        apiKeyDraft.trim() !== "" ||
        JSON.stringify(draftConnection) !== JSON.stringify(savedConnection());

      useEffect(() => {
        onDirtyChange?.(dirty);
      }, [dirty, onDirtyChange]);

      const toggleModel = useCallback((id) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const checkVisible = useCallback(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const m of visibleModels) next.add(m.id);
          return next;
        });
      }, [visibleModels]);

      const uncheckVisible = useCallback(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const m of visibleModels) next.delete(m.id);
          return next;
        });
      }, [visibleModels]);

      // Computed by the Host from this account's own catalog: newest per family.
      const recommended = Array.isArray(account.recommendedModels) ? account.recommendedModels : [];
      const resetRecommended = useCallback(() => {
        setSelectedIds(new Set(recommended));
      }, [recommended]);

      const updateOverride = useCallback((model, patch) => {
        setModelOverrides((prev) => {
          const next = cloneOverrides(prev);
          const discovered = model.discovered ?? {};
          const current = {
            contextWindow: discovered.contextWindow,
            maxTokens: discovered.maxTokens,
            image: discovered.image === true,
            reasoningLevels: Array.isArray(discovered.reasoningLevels) ? [...discovered.reasoningLevels] : [],
            ...(next[model.id] ?? {}),
          };
          const merged = { ...current, ...patch };
          const normalized = {};
          if (Number.isInteger(merged.contextWindow) && merged.contextWindow > 0 && merged.contextWindow !== discovered.contextWindow) {
            normalized.contextWindow = merged.contextWindow;
          }
          if (Number.isInteger(merged.maxTokens) && merged.maxTokens > 0 && merged.maxTokens !== discovered.maxTokens) {
            normalized.maxTokens = merged.maxTokens;
          }
          if (merged.image !== discovered.image) normalized.image = merged.image === true;
          const discoveredLevels = Array.isArray(discovered.reasoningLevels) ? discovered.reasoningLevels : [];
          const levels = Array.isArray(merged.reasoningLevels) ? merged.reasoningLevels : [];
          if (levels.join("\0") !== discoveredLevels.join("\0")) normalized.reasoningLevels = levels;
          if (PROTOCOLS.includes(merged.protocol)) normalized.protocol = merged.protocol;
          if (Object.keys(normalized).length === 0) delete next[model.id];
          else next[model.id] = normalized;
          return next;
        });
      }, []);

      // The protocol a model would use with the panel's current draft settings.
      const effectiveProtocol = useCallback(
        (m) => modelOverrides[m.id]?.protocol ?? (protocol === "auto" ? m.nativeProtocol ?? "openai-completions" : protocol),
        [modelOverrides, protocol]
      );
      const protocolName = (p) => t(PROTOCOL_NAME_KEYS[p] ?? "protocolNameCompletions");

      const resetOverride = useCallback((id) => {
        setModelOverrides((prev) => {
          const next = cloneOverrides(prev);
          delete next[id];
          return next;
        });
      }, []);

      const quotaSnap = useQuota(sharedQuota);
      const quotaFloor = accountQuotaFloor(quotaSnap.data, account.id);

      const discard = () => {
        setTestResult(null);
        actions.discard();
      };

      const testConnection = async () => {
        setTestResult(null);
        const result = await actions.test(account.id, { baseURL: baseURL.trim(), apiKey: apiKeyDraft.trim() });
        if (result !== undefined) setTestResult(result);
      };

      const statusParts = [
        accountStateLabel(t, enabled ? st.state : "disabled"),
        st.endpoint || effectiveUrl || null,
        allModels.length > 0 ? fmt(t, "modelsCountShort", { n: st.modelCount ?? 0, total: st.totalDiscovered ?? allModels.length }) : null,
      ].filter(Boolean);

      const tabs = [
        ["connection", t("tabConnection")],
        ["models", `${t("tabModels")} ${selectedChatCount}`],
        ["media", mediaCount > 0 ? `${t("tabMedia")} ${mediaCount}` : t("tabMedia")],
        ["quota", quotaFloor === null ? t("tabQuota") : `${t("tabQuota")} ${pctText(quotaFloor)}`],
      ];

      const connectionTab = h(
        "div",
        { className: "dcpa-tabbody" },
        h(
          FieldRow,
          { t, label: t("displayNameLabel"), help: t("displayNameHint"), htmlFor: `dcpa-name-${account.id}` },
          h("input", {
            id: `dcpa-name-${account.id}`,
            className: "dcpa-q-input",
            value: displayName,
            onChange: (e) => setDisplayName(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("baseUrlLabel"), htmlFor: `dcpa-url-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-url-${account.id}`,
              className: "dcpa-q-input",
              value: baseURL,
              placeholder: effectiveUrl || t("baseUrlPlaceholder"),
              onChange: (e) => {
                setBaseURL(e.target.value);
                setTestResult(null);
              },
            }),
            h(
              "button",
              { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void testConnection() },
              busy === "test" ? t("testingBtn") : t("testBtn")
            )
          ),
          testResult
            ? h(
                "p",
                { className: "dcpa-q-msg", "data-tone": testResult.ok ? "ok" : "error", role: "status" },
                testResult.ok
                  ? fmt(t, "testOk", { endpoint: testResult.endpoint, n: testResult.modelCount })
                  : fmt(t, "testFail", { error: testResult.error })
              )
            : null
        ),
        h(
          FieldRow,
          { t, label: t("apiKeyLabel"), help: fmt(t, "apiKeyHint", { ref: cred.ref || apiKeyEnv }), htmlFor: `dcpa-key-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-key-${account.id}`,
              type: "password",
              className: "dcpa-q-input",
              autoComplete: "new-password",
              value: apiKeyDraft,
              placeholder: cred.configured ? t("apiKeySetPlaceholder") : t("apiKeyUnsetPlaceholder"),
              onChange: (e) => {
                setApiKeyDraft(e.target.value);
                setTestResult(null);
              },
            }),
            cred.configured
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-q-btn",
                    "data-variant": "danger",
                    disabled: busy !== null,
                    onClick: () => {
                      if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("clearKeyConfirm"))) return;
                      void actions.patch(account.id, { clearApiKey: true }, t("clearedKeyToast"));
                    },
                  },
                  t("clearKeyBtn")
                )
              : null
          )
        ),
        h(
          FieldRow,
          { t, label: t("protocolLabel"), help: t("protocolHint"), htmlFor: `dcpa-proto-${account.id}` },
          h(
            "select",
            {
              id: `dcpa-proto-${account.id}`,
              className: "dcpa-q-input",
              value: protocol,
              onChange: (e) => setProtocol(e.target.value),
            },
            h("option", { value: "auto" }, t("protocolAuto")),
            PROTOCOLS.map((p) => h("option", { key: p, value: p }, `${t("protocolFixedPrefix")}${protocolName(p)}`))
          )
        ),
        h(
          "details",
          { className: "dcpa-adv" },
          h("summary", null, t("sectionAdvanced")),
          h(
            FieldRow,
            { t, label: t("providerIdLabel"), help: t("providerIdHint"), htmlFor: `dcpa-route-${account.id}` },
            h("input", { id: `dcpa-route-${account.id}`, className: "dcpa-q-input", value: provider, onChange: (e) => setProvider(e.target.value) })
          ),
          h(
            FieldRow,
            { t, label: t("apiKeyEnvLabel"), help: t("apiKeyEnvHint"), htmlFor: `dcpa-ref-${account.id}` },
            h("input", { id: `dcpa-ref-${account.id}`, className: "dcpa-q-input", value: apiKeyEnv, onChange: (e) => setApiKeyEnv(e.target.value) })
          ),
          h(
            FieldRow,
            { t, label: t("includePrefixLabel"), help: t("includePrefixHint"), htmlFor: `dcpa-inc-${account.id}` },
            h("input", {
              id: `dcpa-inc-${account.id}`,
              className: "dcpa-q-input",
              value: includePrefix,
              placeholder: t("includePrefixPlaceholder"),
              onChange: (e) => setIncludePrefix(e.target.value),
            })
          ),
          h(
            FieldRow,
            { t, label: t("excludePrefixLabel"), help: t("excludePrefixHint"), htmlFor: `dcpa-exc-${account.id}` },
            h("input", {
              id: `dcpa-exc-${account.id}`,
              className: "dcpa-q-input",
              value: excludePrefix,
              placeholder: t("excludePrefixPlaceholder"),
              onChange: (e) => setExcludePrefix(e.target.value),
            })
          )
        ),
        h(
          FieldRow,
          { t, label: t("refreshIntervalLabel"), htmlFor: `dcpa-interval-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline dcpa-inline-narrow" },
            h("input", {
              id: `dcpa-interval-${account.id}`,
              type: "number",
              min: "15",
              className: "dcpa-q-input",
              value: refreshIntervalSeconds,
              onChange: (e) => setRefreshIntervalSeconds(e.target.value),
            }),
            h("span", { className: "dcpa-q-sub" }, t("secondsUnit"))
          )
        )
      );
