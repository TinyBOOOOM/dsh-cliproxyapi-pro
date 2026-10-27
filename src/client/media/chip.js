// @client-source Session image/video model menus and agent-generation settings.
    // #region Generation-model button (composer / hero)

    function mediaFileURL(sessionId, id) {
      return `${API.mediaFile}?sessionId=${encodeURIComponent(sessionId)}&id=${encodeURIComponent(id)}`;
    }

    function mediaSessionURL(sessionId) {
      return typeof sessionId === "string" && sessionId !== "" ? `${API.mediaSession}?sessionId=${encodeURIComponent(sessionId)}` : API.mediaSession;
    }

    const IMAGE_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("rect", { x: 1.75, y: 2.75, width: 12.5, height: 10.5, rx: 2, stroke: "currentColor", strokeWidth: 1.3 }),
        h("circle", { cx: 5.5, cy: 6.25, r: 1.25, fill: "currentColor" }),
        h("path", { d: "M2.5 12l3.6-3.4 2.4 2.2 2.2-2 2.8 2.6", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })
      );

    /** Composer row width (px) below which the image / video buttons show icons only. */
    const MEDIA_COMPACT_WIDTH = 640;

    const VIDEO_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("rect", { x: 1.75, y: 3.75, width: 9, height: 8.5, rx: 2, stroke: "currentColor", strokeWidth: 1.3 }),
        h("path", { d: "M10.75 7l3.5-2v6l-3.5-2", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })
      );

    const AGENT_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("circle", { cx: 8, cy: 8, r: 2.15, stroke: "currentColor", strokeWidth: 1.25 }),
        h("path", {
          d: "M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1",
          stroke: "currentColor",
          strokeWidth: 1.2,
          strokeLinecap: "round",
        })
      );

    /**
     * Pick the session's image and video models next to the composer (results
     * show in the /cpa-image and /cpa-video chat rows). Each kind has its own
     * button and menu; the agent rules are a secondary menu of either one.
     * Renders nothing without a generation model.
     * Hook order: slot 0 = data, slot 1 = loading (test harness).
     */
    function MediaChip({ t, sessionId = null, placement = "composer", presence = mediaChips }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      // Which kind's model menu is open (image / video), or null.
      const [openKind, setOpenKind] = useState(null);
      const [pos, setPos] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      // Bumped to reload while no image model is known yet.
      const [retry, setRetry] = useState(0);
      // Secondary menu: this session's agent tool rules.
      const [agentPane, setAgentPane] = useState(false);
      const wrapRef = useRef(null);
      const buttonRef = useRef(null);
      const mounted = useRef(true);
      const shadowed = useBadgePlacement(placement, sessionId, presence);
      // Icon-only buttons while the composer row is narrow (names move to aria-label).
      const [compact, setCompact] = useState(false);
      useEffect(() => {
        // Measure the composer card (the nearest ancestor holding the text input),
        // not the small button cluster this chip sits in.
        if (typeof document === "undefined") return undefined;
        let row = wrapRef.current?.parentElement ?? null;
        for (let el = row; el && el !== document.body; el = el.parentElement) {
          if (el.querySelector?.("textarea, [contenteditable='true'], [contenteditable='plaintext-only']")) { row = el; break; }
        }
        if (!row || typeof ResizeObserver === "undefined") return undefined;
        const measure = () => setCompact(row.clientWidth > 0 && row.clientWidth < MEDIA_COMPACT_WIDTH);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => observer.disconnect();
      }, [shadowed, data !== null]);

      const closeMenu = () => {
        setOpenKind(null);
        setAgentPane(false);
      };

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      // Load on mount, on session change and whenever a model menu opens. While
      // the host reports no generation model, or says its catalog missed the
      // plain listing that carries some image models, look again after 3 s,
      // 10 s, then every 30 s; otherwise there is no background polling.
      useEffect(() => {
        if (shadowed) return undefined;
        const controller = new AbortController();
        let again = null;
        (async () => {
          let needsRetry = true;
          try {
            const res = await fetch(mediaSessionURL(sessionId), { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
            setData(body.session ?? null);
            needsRetry = body.session?.catalogIncomplete === true ||
              !["image", "video"].some((kind) => Array.isArray(body.session?.options?.[kind]) && body.session.options[kind].length > 0);
          } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
          // 3 s, 10 s, then every 30 s (the host also syncs once on this request).
          if (needsRetry && !controller.signal.aborted) again = setTimeout(() => setRetry((n) => n + 1), [3000, 10000][retry] ?? 30 * 1000);
        })();
        return () => {
          controller.abort();
          if (again !== null) clearTimeout(again);
        };
      }, [sessionId, shadowed, openKind, retry]);

      useEffect(() => {
        if (openKind === null) return undefined;
        const place = () => {
          // Anchor the menu to the whole two-button group; it sits left of the
          // model selector either way.
          const rect = wrapRef.current?.getBoundingClientRect?.();
          if (!rect || typeof window === "undefined") return;
          const width = Math.min(340, window.innerWidth - 32);
          const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
          setPos({ left, bottom: Math.max(16, window.innerHeight - rect.top + 6), width });
        };
        place();
        const onDown = (e) => {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) closeMenu();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            closeMenu();
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
      }, [openKind]);

      const hasSession = typeof sessionId === "string" && sessionId !== "";
      const agent = data?.agent ?? null;
      const agentAvailable = agent?.enabled === true && hasSession;
      const kinds = ["image", "video"]
        .map((kind) => {
          const options = Array.isArray(data?.options?.[kind]) ? data.options[kind] : [];
          const currentRef = data?.current?.[kind]?.ref ?? null;
          const current = options.find((o) => o.ref === currentRef) ?? null;
          return { kind, options, currentRef, source: data?.current?.[kind]?.source ?? null, name: current ? current.name || current.modelId : null };
        })
        .filter((k) => k.options.length > 0);
      if (shadowed || kinds.length === 0) return null;

      const imageKind = kinds.find((k) => k.kind === "image") ?? null;
      const videoKind = kinds.find((k) => k.kind === "video") ?? null;
      const activeKind = openKind === "image" ? imageKind : openKind === "video" ? videoKind : null;
      const showingAgent = openKind !== null && agentPane && agentAvailable;
      const kindLabel = (k) =>
        k.name
          ? fmt(t, k.kind === "image" ? "mediaChipLabel" : "mediaChipVideoLabel", { model: k.name })
          : t(k.kind === "image" ? "mediaChipChoose" : "mediaChipVideoChoose");
      const openMenu = (kind, element) => {
        if (openKind === kind) {
          closeMenu();
          return;
        }
        buttonRef.current = element ?? null;
        setAgentPane(false);
        setOpenKind(kind);
      };

      const pick = async (kind, ref) => {
        setBusy(true);
        setError(null);
        try {
          const body = await postJson(API.mediaSessionSave, { ...(hasSession ? { sessionId } : {}), kind, ref });
          if (mounted.current) setData(body.session ?? null);
        } catch (err) {
          if (mounted.current) setError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };

      const optionGroups = (k) => {
        const groups = [];
        for (const option of k.options) {
          const group = groups.find((g) => g.accountId === option.accountId);
          if (group) group.items.push(option);
          else groups.push({ accountId: option.accountId, name: option.accountName, items: [option] });
        }
        return h(
          "div",
          { className: "dcpa-m-section", "data-kind": k.kind },
          k.source !== null && k.source !== "session" && hasSession ? h("p", { className: "dcpa-q-pop-text" }, t("mediaChipInherited")) : null,
          groups.map((group) =>
            h(
              "div",
              { key: group.accountId, role: "group", "aria-label": group.name },
              groups.length > 1 ? h("div", { className: "dcpa-m-group" }, group.name) : null,
              group.items.map((option) =>
                h(
                  "button",
                  {
                    key: option.ref,
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": option.ref === k.currentRef,
                    className: "dcpa-menu-item dcpa-m-option",
                    disabled: busy,
                    onClick: () => void pick(k.kind, option.ref),
                  },
                  h("span", { className: "dcpa-m-check", "aria-hidden": "true" }, option.ref === k.currentRef ? "✓" : ""),
                  h("span", { className: "dcpa-m-name" }, option.name || option.modelId),
                  option.aliasOf ? h("span", { className: "dcpa-q-tag", "data-tone": "info" }, fmt(t, "mediaAliasTag", { target: option.aliasOf })) : null
                )
              )
            )
          )
        );
      };

      // This session's rules for the agent tool: a secondary menu reached from
      // either model menu, never mixed into the model lists.
      const setPolicy = async (patch) => {
        setBusy(true);
        setError(null);
        try {
          const body = await postJson(API.mediaSessionSave, { sessionId, ...patch });
          if (mounted.current) setData(body.session ?? null);
        } catch (err) {
          if (mounted.current) setError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      const policySelect = (field, labelKey) =>
        h(
          "label",
          { className: "dcpa-m-policy-row" },
          h("span", null, t(labelKey)),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: agent.sources?.[field] === "session" ? agent[field] : "inherit",
              disabled: busy,
              onChange: (e) => void setPolicy({ [field]: e.target.value }),
            },
            h("option", { value: "inherit" }, fmt(t, "mediaFollowGlobal", { value: t((agent.global?.[field] ?? agent[field]) === "ask" ? "mediaConfirmAsk" : "mediaConfirmAuto") })),
            h("option", { value: "ask" }, t("mediaConfirmAsk")),
            h("option", { value: "auto" }, t("mediaConfirmAuto"))
          )
        );
      const sessionBudget = agent?.videoBudget ?? null;
      const agentSettings = !agentAvailable ? null : h(
        "div",
        { className: "dcpa-m-agent-pane", "data-kind": "agent" },
        policySelect("videoConfirm", "mediaVideoConfirm"),
        policySelect("imageConfirm", "mediaImageConfirm"),
        h(
          "label",
          { className: "dcpa-m-policy-row" },
          h("span", null, t("mediaVideoBudget")),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: agent.sources?.videoBudget === "session" ? budgetValue(sessionBudget) : "inherit",
              disabled: busy,
              onChange: (e) => void setPolicy({ videoBudget: e.target.value === "inherit" ? "inherit" : budgetFromValue(e.target.value) }),
            },
            h(
              "option",
              { value: "inherit" },
              fmt(t, "mediaFollowGlobal", { value: (agent.global?.videoBudget ?? sessionBudget)?.mode === "limited" ? fmt(t, "mediaBudgetSeconds", { n: (agent.global?.videoBudget ?? sessionBudget).seconds }) : t("mediaBudgetUnlimited") })
            ),
            budgetChoices(sessionBudget).map((n) => h("option", { key: n, value: `limited:${n}` }, fmt(t, "mediaBudgetSeconds", { n }))),
            h("option", { value: "unlimited" }, t("mediaBudgetUnlimited"))
          )
        ),
        h(
          "p",
          { className: "dcpa-q-pop-text", "data-agent-used": String(agent.used ?? 0) },
          sessionBudget?.mode === "limited"
            ? fmt(t, "mediaAgentUsed", { used: agent.used ?? 0, limit: sessionBudget.seconds })
            : fmt(t, "mediaAgentUsedUnlimited", { used: agent.used ?? 0 })
        )
      );
      const agentButton = h(
        "button",
        { type: "button", className: "dcpa-q-btn dcpa-m-agent-open", onClick: () => setAgentPane(true) },
        h(AGENT_ICON),
        h("span", null, t("mediaAgentSettings"))
      );
      const popVisible = openKind !== null && (showingAgent || activeKind !== null);
      const head = !popVisible
        ? null
        : showingAgent
        ? h(
            "div",
            { className: "dcpa-q-pop-head dcpa-m-agent-head" },
            h(
              "button",
              { type: "button", className: "dcpa-q-btn dcpa-m-back", "aria-label": t("mediaBack"), onClick: () => setAgentPane(false) },
              "‹ ",
              t("mediaBack")
            ),
            h("div", { className: "dcpa-q-pop-model" }, t("mediaAgentSection"))
          )
        : h(
            "div",
            { className: "dcpa-q-pop-head" },
            h("div", { className: "dcpa-q-pop-model" }, t(activeKind.kind === "image" ? "mediaImageGroup" : "mediaVideoGroup")),
            h("div", { className: "dcpa-q-pop-sub" }, t(activeKind.kind === "image" ? "mediaChipHint" : "mediaChipVideoHint"))
          );

      const pop = popVisible
          ? h(
              "div",
              {
                className: "dcpa-q-pop dcpa-m-pop",
                role: "dialog",
                "aria-label": showingAgent ? t("mediaAgentSection") : t(activeKind.kind === "image" ? "mediaImageGroup" : "mediaVideoGroup"),
                style: pos ? { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px` } : { visibility: "hidden" },
              },
              head,
              ...(showingAgent ? [agentSettings] : [optionGroups(activeKind), agentAvailable ? h("div", { className: "dcpa-m-foot" }, agentButton) : null]),
              error ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error", role: "alert" }, fmt(t, "mediaPickFailed", { error })) : null
            )
          : null;

      const chipButton = (k) =>
        h(
          "button",
          {
            type: "button",
            className: "dcpa-q-badge dcpa-m-chip dcpa-m-chip-button",
            "data-kind": k.kind,
            "data-compact": compact ? "true" : undefined,
            "aria-label": kindLabel(k),
            "aria-haspopup": "dialog",
            "aria-expanded": openKind === k.kind,
            disabled: loading && data === null,
            onClick: (e) => openMenu(k.kind, e?.currentTarget ?? null),
          },
          h(
            "span",
            { className: "dcpa-m-chip-part" },
            h(k.kind === "image" ? IMAGE_ICON : VIDEO_ICON),
            compact ? null : h("span", { className: "dcpa-m-chip-label" }, k.name ?? t(k.kind === "image" ? "mediaChipChoose" : "mediaChipVideoChoose"))
          )
        );

      return h(
        "span",
        { ref: wrapRef, className: "dcpa-q-wrap dcpa-m-chip-group", "data-placement": placement, "data-dsh-plugin": MODULE_ID },
        imageKind !== null ? chipButton(imageKind) : null,
        imageKind !== null && videoKind !== null ? h("span", { className: "dcpa-m-chip-sep", "aria-hidden": "true" }) : null,
        videoKind !== null ? chipButton(videoKind) : null,
        pop
      );
    }
    // #endregion
