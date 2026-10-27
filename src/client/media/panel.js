// @client-source Per-account generation settings and read-only diagnostics panel.
    function MediaPanel({ t, account, onStatus }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(null); // null | "save" | "diag"
      const [notice, setNotice] = useState(null);
      const [diag, setDiag] = useState(null);
      const [diagError, setDiagError] = useState(null);
      const [markId, setMarkId] = useState("");
      const [markKind, setMarkKind] = useState("image");
      const [copied, setCopied] = useState(false);
      // null = not edited; the saved value is shown.
      const [outputDraft, setOutputDraft] = useState(null);
      const mounted = useRef(true);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      const load = useCallback(async (signal) => {
        try {
          const res = await fetch(API.mediaStatus, { cache: "no-store", signal });
          const body = await res.json();
          if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
          if (signal?.aborted) return;
          setData(body.media ?? null);
          setError(null);
        } catch (err) {
          if (signal?.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!signal?.aborted) setLoading(false);
        }
      }, []);

      // Reload when the account's catalog changes (a probe or save elsewhere).
      useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
      }, [load, account.id, account.status?.refreshedAt, account.status?.totalDiscovered]);

      useEffect(() => {
        if (notice?.tone !== "ok") return undefined;
        const id = setTimeout(() => {
          if (mounted.current) setNotice(null);
        }, 4000);
        return () => clearTimeout(id);
      }, [notice]);

      useEffect(() => {
        if (!copied) return undefined;
        const id = setTimeout(() => {
          if (mounted.current) setCopied(false);
        }, 2000);
        return () => clearTimeout(id);
      }, [copied]);

      const mine = (data?.accounts ?? []).find((a) => a.id === account.id);
      const models = Array.isArray(mine?.models) ? mine.models : [];
      const images = models.filter((m) => m.kind === "image");
      const videos = models.filter((m) => m.kind === "video");
      const movedToChat = Object.entries(mine?.kindOverrides ?? {})
        .filter(([, kind]) => kind === "chat")
        .map(([id]) => id);
      const markable = (mine?.chatModelIds ?? []).filter((id) => !movedToChat.includes(id));

      const save = async (accountPatch) => {
        setBusy("save");
        setNotice(null);
        try {
          const body = await postJson(API.mediaSave, { account: { accountId: account.id, ...accountPatch } });
          if (!mounted.current) return;
          setData(body.media ?? null);
          if (body.status !== undefined) onStatus?.(body.status);
          setNotice({ tone: "ok", text: t(body.status !== undefined ? "mediaKindSaved" : "mediaSaved") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: mediaErrorText(t, err) });
        } finally {
          if (mounted.current) setBusy(null);
        }
      };

      // Global (all-account) preferences, each saved on its own.
      const saveGlobal = async (patch, after) => {
        setBusy("save");
        setNotice(null);
        try {
          const body = await postJson(API.mediaSave, patch);
          if (!mounted.current) return;
          setData(body.media ?? null);
          after?.();
          if ("enabled" in patch) announceMediaGeneration();
          setNotice({ tone: "ok", text: t("mediaSaved") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: mediaErrorText(t, err) });
        } finally {
          if (mounted.current) setBusy(null);
        }
      };
      const saveOutputDir = async () => {
        if (outputDraft === null) return;
        await saveGlobal({ outputDir: outputDraft.trim() }, () => setOutputDraft(null));
      };

      const toggleEnabled = (model) => {
        const off = Array.isArray(mine?.disabledModels) ? mine.disabledModels : [];
        const next = model.enabled ? [...new Set([...off, model.id])] : off.filter((id) => id !== model.id);
        return save({ disabledModels: next });
      };

      const setKind = (model, kind) =>
        save({ kindOverrides: { [model.id]: kind === model.detectedKind ? null : kind } });

      const runDiagnostic = async () => {
        setBusy("diag");
        setDiagError(null);
        try {
          const body = await postJson(API.mediaDiagnose, { accountId: account.id });
          if (mounted.current) setDiag(body.diagnostic ?? null);
        } catch (err) {
          if (mounted.current) setDiagError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(null);
        }
      };

      const copyDiagnostic = async () => {
        try {
          if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") return;
          await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
          if (mounted.current) setCopied(true);
        } catch {}
      };

      const kindSelect = (model) =>
        h(
          "select",
          {
            className: "dcpa-q-input dcpa-media-kind",
            value: model.kind,
            "aria-label": fmt(t, "mediaKindFor", { model: model.id }),
            disabled: busy !== null,
            onChange: (e) => void setKind(model, e.target.value),
          },
          ["image", "video", "chat"].map((kind) => h("option", { key: kind, value: kind }, t(MEDIA_KIND_KEYS[kind])))
        );

      const modelRow = (model) =>
        h(
          "div",
          { key: model.id, className: "dcpa-model-row dcpa-media-row" },
          h(
            "div",
            { className: "dcpa-model-left" },
            h("span", { className: "dcpa-model-id" }, model.id),
            model.name && model.name !== model.id ? h("span", { className: "dcpa-model-name" }, model.name) : null,
            model.aliasOf
              ? h(
                  "span",
                  { className: "dcpa-model-tags" },
                  h("span", { className: "dcpa-q-tag", "data-tone": "info" }, fmt(t, "mediaAliasTag", { target: model.aliasOf })),
                  h(InfoTip, { t, text: fmt(t, "mediaAliasHint", { target: model.aliasOf }) })
                )
              : null,
            h(
              "span",
              { className: "dcpa-q-tag", ...(model.overridden ? { "data-tone": "warning" } : {}) },
              t(model.overridden ? "mediaOverriddenTag" : "mediaDetectedTag")
            )
          ),
          h(
            "div",
            { className: "dcpa-q-actions" },
            kindSelect(model),
            model.overridden
              ? h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void save({ kindOverrides: { [model.id]: null } }) },
                  t("mediaResetKind")
                )
              : null,
            h(
              "button",
              {
                type: "button",
                role: "switch",
                className: "dcpa-switch",
                "aria-checked": model.enabled === true,
                "aria-label": fmt(t, "mediaEnabledLabel", { model: model.id }),
                disabled: busy !== null,
                onClick: () => void toggleEnabled(model),
              },
              h("span", { className: "dcpa-switch-thumb" })
            )
          )
        );

      const group = (titleKey, list) =>
        list.length === 0
          ? null
          : h(
              "div",
              { className: "dcpa-media-block" },
              h("h4", { className: "dcpa-media-group" }, `${t(titleKey)} (${list.length})`),
              h("div", { className: "dcpa-model-list" }, list.map(modelRow))
            );

      const catalogRead = (mine?.discovered ?? 0) > 0;

      const diagnostic = h(
        "div",
        { className: "dcpa-media-card" },
        h(
          "div",
          { className: "dcpa-media-card-head" },
          h("span", { className: "dcpa-frow-label" }, t("diagTitle"), h(InfoTip, { t, text: t("diagHint") })),
          h(
            "button",
            { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void runDiagnostic() },
            busy === "diag" ? t("diagRunning") : t("diagRun")
          )
        ),
        diagError ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, diagError) : null,
        diag
          ? h(
              "div",
              { className: "dcpa-media-diag" },
              diag.keyConfigured === false ? h("p", { className: "dcpa-q-sub" }, t("diagNoKey")) : null,
              [
                ["diagEnriched", diag.catalogs?.enriched],
                ["diagListing", diag.catalogs?.listing],
              ].map(([labelKey, catalog]) =>
                h(
                  "div",
                  { key: labelKey, className: "dcpa-media-diag-item" },
                  h(
                    "div",
                    { className: "dcpa-media-diag-row" },
                    h("span", null, t(labelKey)),
                    h("span", { className: "dcpa-q-sub" }, diagCatalogText(t, catalog))
                  ),
                  Array.isArray(catalog?.media) && catalog.media.length > 0
                    ? h(
                        "ul",
                        { className: "dcpa-media-diag-list" },
                        catalog.media.map((entry) =>
                          h(
                            "li",
                            { key: entry.id },
                            h("span", { className: "dcpa-model-id" }, entry.id),
                            ` · ${t(MEDIA_KIND_KEYS[entry.kind] ?? "mediaKindChat")}`,
                            entry.fields && Object.keys(entry.fields).length > 0 ? ` · ${diagFieldsText(entry.fields)}` : ""
                          )
                        )
                      )
                    : null
                )
              ),
              h(
                "div",
                { className: "dcpa-media-diag-item" },
                h("div", { className: "dcpa-media-diag-row" }, h("span", null, t("diagRoutes"))),
                h(
                  "ul",
                  { className: "dcpa-media-diag-list" },
                  (diag.routes ?? []).map((route) =>
                    h("li", { key: route.route }, h("span", { className: "dcpa-model-id" }, route.route), ` · ${diagRouteText(t, route)}`)
                  )
                )
              ),
              h(
                "details",
                { className: "dcpa-media-raw" },
                h("summary", null, t("diagRaw")),
                h("pre", { className: "dcpa-media-pre" }, JSON.stringify(diag, null, 2)),
                h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", "data-variant": "outline", onClick: () => void copyDiagnostic() },
                  copied ? t("diagCopied") : t("diagCopy")
                )
              )
            )
          : null
      );

      // The optional agent tool (generate_media): switch, confirmation and the video seconds limit.
      const agentOn = data?.settings?.agentTool === true;
      const confirmSelect = (field, labelKey) =>
        h(
          "label",
          { className: "dcpa-inline dcpa-media-agent-row" },
          h("span", { className: "dcpa-media-sublabel" }, t(labelKey)),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: data?.settings?.[field] ?? (field === "videoConfirm" ? "ask" : "auto"),
              disabled: busy !== null || !agentOn,
              onChange: (e) => void saveGlobal({ [field]: e.target.value }),
            },
            h("option", { value: "ask" }, t("mediaConfirmAsk")),
            h("option", { value: "auto" }, t("mediaConfirmAuto"))
          )
        );
      const globalBudget = data?.settings?.videoBudget ?? { mode: "limited", seconds: 60 };
      const agentCard = h(
        "div",
        { className: "dcpa-media-card", "data-agent": agentOn ? "on" : "off" },
        h(
          "div",
          { className: "dcpa-media-agent-head" },
          h("span", { className: "dcpa-frow-label" }, t("mediaAgentTitle"), h(InfoTip, { t, text: t("mediaAgentHint") })),
          h(
            "button",
            {
              type: "button",
              role: "switch",
              className: "dcpa-switch",
              "aria-checked": agentOn,
              "aria-label": t("mediaAgentTitle"),
              disabled: busy !== null,
              onClick: () => void saveGlobal({ agentTool: !agentOn }),
            },
            h("span", { className: "dcpa-switch-thumb" })
          )
        ),
        h("p", { className: "dcpa-q-sub" }, t(agentOn ? "mediaAgentOnNote" : "mediaAgentOffNote")),
        confirmSelect("videoConfirm", "mediaVideoConfirm"),
        confirmSelect("imageConfirm", "mediaImageConfirm"),
        h(
          "div",
          { className: "dcpa-inline dcpa-media-agent-row" },
          h("span", { className: "dcpa-media-sublabel" }, t("mediaVideoBudget"), h(InfoTip, { t, text: t("mediaVideoBudgetHint") })),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              "aria-label": t("mediaVideoBudget"),
              value: budgetValue(globalBudget),
              disabled: busy !== null || !agentOn,
              onChange: (e) => void saveGlobal({ videoBudget: budgetFromValue(e.target.value) }),
            },
            budgetChoices(globalBudget).map((n) => h("option", { key: n, value: `limited:${n}` }, fmt(t, "mediaBudgetSeconds", { n }))),
            h("option", { value: "unlimited" }, t("mediaBudgetUnlimited"))
          )
        )
      );

      if (loading && data === null) {
        return h("div", { className: "dcpa-tabbody dcpa-models dcpa-media" }, h("p", { className: "dcpa-q-sub" }, t("mediaLoading")));
      }

      // The master switch (all accounts): off hides every generation feature.
      const generationOn = data?.settings?.enabled === true;
      const masterCard = h(
        "div",
        { className: "dcpa-media-card", "data-generation": generationOn ? "on" : "off" },
        h(
          "div",
          { className: "dcpa-media-agent-head" },
          h("span", { className: "dcpa-frow-label" }, t("mediaMasterTitle"), h(InfoTip, { t, text: t("mediaMasterHint") })),
          h(
            "button",
            {
              type: "button",
              role: "switch",
              className: "dcpa-switch",
              "aria-checked": generationOn,
              "aria-label": t("mediaMasterTitle"),
              disabled: busy !== null || data === null,
              onClick: () => void saveGlobal({ enabled: !generationOn }),
            },
            h("span", { className: "dcpa-switch-thumb" })
          )
        ),
        h("p", { className: "dcpa-q-sub" }, t(generationOn ? "mediaMasterOnNote" : "mediaMasterOffNote"))
      );
      const messages = [
        error ? h("p", { key: "err", className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "mediaLoadError", { error })) : null,
        data?.settingsError ? h("p", { key: "invalid", className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, t("mediaSettingsInvalid")) : null,
        notice ? h("p", { key: "notice", className: "dcpa-q-msg", "data-tone": notice.tone, role: notice.tone === "error" ? "alert" : "status" }, notice.text) : null,
      ];

      if (!generationOn) {
        return h("div", { className: "dcpa-tabbody dcpa-models dcpa-media" }, masterCard, ...messages);
      }

      return h(
        "div",
        { className: "dcpa-tabbody dcpa-models dcpa-media" },
        masterCard,
        h("p", { className: "dcpa-q-sub" }, t("mediaIntro")),
        ...messages,
        mine && models.length === 0
          ? h("p", { className: "dcpa-hint" }, t(catalogRead ? "mediaNone" : "mediaNoCatalog"))
          : null,
        group("mediaImageGroup", images),
        group("mediaVideoGroup", videos),
        movedToChat.length > 0
          ? h(
              "div",
              { className: "dcpa-media-block" },
              h("h4", { className: "dcpa-media-group" }, t("mediaMovedTitle"), h(InfoTip, { t, text: t("mediaMovedHint") })),
              h(
                "div",
                { className: "dcpa-model-list" },
                movedToChat.map((id) =>
                  h(
                    "div",
                    { key: id, className: "dcpa-model-row dcpa-media-row" },
                    h("div", { className: "dcpa-model-left" }, h("span", { className: "dcpa-model-id" }, id)),
                    h(
                      "button",
                      { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void save({ kindOverrides: { [id]: null } }) },
                      t("mediaResetKind")
                    )
                  )
                )
              )
            )
          : null,
        markable.length > 0
          ? h(
              "div",
              { className: "dcpa-media-card" },
              h("span", { className: "dcpa-frow-label" }, t("mediaMarkTitle"), h(InfoTip, { t, text: t("mediaMarkHint") })),
              h(
                "div",
                { className: "dcpa-inline" },
                h(
                  "select",
                  {
                    className: "dcpa-q-input",
                    value: markId,
                    "aria-label": t("mediaMarkSelect"),
                    onChange: (e) => setMarkId(e.target.value),
                  },
                  h("option", { value: "" }, t("mediaMarkSelect")),
                  markable.map((id) => h("option", { key: id, value: id }, id))
                ),
                h(
                  "select",
                  {
                    className: "dcpa-q-input dcpa-media-kind",
                    value: markKind,
                    "aria-label": t("mediaKindLabel"),
                    onChange: (e) => setMarkKind(e.target.value),
                  },
                  ["image", "video"].map((kind) => h("option", { key: kind, value: kind }, t(MEDIA_KIND_KEYS[kind])))
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-q-btn",
                    "data-variant": "outline",
                    disabled: busy !== null || markId === "",
                    onClick: () => {
                      const id = markId;
                      setMarkId("");
                      void save({ kindOverrides: { [id]: markKind } });
                    },
                  },
                  t("mediaMarkBtn")
                )
              )
            )
          : null,
        h(
          "div",
          { className: "dcpa-media-card" },
          h("label", { className: "dcpa-frow-label", htmlFor: `dcpa-media-out-${account.id}` }, t("mediaOutputTitle"), h(InfoTip, { t, text: t("mediaOutputHint") })),
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-media-out-${account.id}`,
              className: "dcpa-q-input",
              value: outputDraft ?? data?.settings?.outputDir ?? "",
              onChange: (e) => setOutputDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") void saveOutputDir();
              },
            }),
            h(
              "button",
              {
                type: "button",
                className: "dcpa-q-btn",
                "data-variant": "outline",
                disabled: busy !== null || outputDraft === null || outputDraft.trim() === (data?.settings?.outputDir ?? ""),
                onClick: () => void saveOutputDir(),
              },
              t("mediaOutputSave")
            )
          )
        ),
        videos.length > 0
          ? h(
              "div",
              { className: "dcpa-media-card" },
              h("div", { className: "dcpa-frow-label" }, t("mediaVideoDefaults"), h(InfoTip, { t, text: t("mediaVideoDefaultsHint") })),
              h(
                "div",
                { className: "dcpa-inline" },
                h("label", { className: "dcpa-media-sublabel", htmlFor: `dcpa-media-vs-${account.id}` }, t("mediaVideoSeconds")),
                h(
                  "select",
                  {
                    id: `dcpa-media-vs-${account.id}`,
                    className: "dcpa-q-input dcpa-media-select",
                    value: String(data?.settings?.defaultVideoSeconds ?? 6),
                    disabled: busy !== null,
                    onChange: (e) => void saveGlobal({ defaultVideoSeconds: Number(e.target.value) }),
                  },
                  Array.from({ length: 15 }, (_, i) => h("option", { key: i + 1, value: String(i + 1) }, fmt(t, "mediaSecondsOption", { n: i + 1 })))
                ),
                h("label", { className: "dcpa-media-sublabel", htmlFor: `dcpa-media-vr-${account.id}` }, t("mediaVideoResolution")),
                h(
                  "select",
                  {
                    id: `dcpa-media-vr-${account.id}`,
                    className: "dcpa-q-input dcpa-media-select",
                    value: data?.settings?.defaultVideoResolution ?? "720p",
                    disabled: busy !== null,
                    onChange: (e) => void saveGlobal({ defaultVideoResolution: e.target.value }),
                  },
                  ["480p", "720p"].map((r) => h("option", { key: r, value: r }, r))
                )
              )
            )
          : null,
        images.length + videos.length > 0 ? agentCard : null,
        diagnostic
      );
    }

    // #endregion
