// @client-source Composer-only compatibility generation-cost confirmation.
    // Compatibility path for profiles without the native question service.
    // Only the composer owns these controls; chat rows never ask for consent.
    function MediaConfirmationDock({ t, sessionId = null }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [notice, setNotice] = useState(null);
      const [busy, setBusy] = useState(null);
      const lifetime = useRef(null);
      const answering = useRef(null);
      const answered = useRef(new Set());
      useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        answering.current = null;
        answered.current = new Set();
        setData(null);
        setNotice(null);
        setBusy(null);
        let timer;
        const load = async () => {
          try {
            const res = await fetch(mediaSessionURL(sessionId), { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok || body.ok === false) throw new Error(`HTTP ${res.status}`);
            setData(body.session?.sessionId === sessionId ? body.session : null);
          } catch {
            // Missing/offline service is not an empty consent grant. Retry;
            // pending Host requests still time out closed.
          } finally {
            if (!controller.signal.aborted) {
              setLoading(false);
              timer = setTimeout(load, 2000);
            }
          }
        };
        if (typeof sessionId === "string" && sessionId !== "") void load();
        return () => { controller.abort(); clearTimeout(timer); };
      }, [sessionId]);
      const confirms = data?.sessionId === sessionId && Array.isArray(data.pendingConfirmations)
        ? data.pendingConfirmations.filter((item) => !answered.current.has(item.commandId)) : [];
      const answer = async (commandId, allow) => {
        if (answering.current !== null || answered.current.has(commandId)) return;
        const controller = lifetime.current;
        if (!controller || controller.signal.aborted) return;
        answering.current = commandId;
        setBusy(commandId);
        try {
          await postJson(API.mediaConfirm, { sessionId, commandId, allow });
          if (controller.signal.aborted) return;
          answered.current.add(commandId);
          setData((current) => current ? { ...current, pendingConfirmations: current.pendingConfirmations.filter((item) => item.commandId !== commandId) } : current);
          setNotice(null);
        } catch {
          if (!controller.signal.aborted) setNotice(t("mediaConfirmDeliveryFailed"));
        } finally {
          if (!controller.signal.aborted) { answering.current = null; setBusy(null); }
        }
      };
      if (loading || confirms.length === 0) return null;
      return h("section", { className: "dcpa-confirm-dock", role: "region", "aria-label": t("mediaConfirmWaiting") },
        ...confirms.map((confirm) => h("div", { className: "dcpa-chat-confirm", key: confirm.commandId, role: "group", "aria-label": t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle") },
          h("p", { className: "dcpa-chat-confirm-title" }, t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle")),
          h("p", { className: "dcpa-chat-confirm-text" }, t("mediaLocale") === "zh" ? confirm.zh : confirm.en),
          h("div", { className: "dcpa-q-actions" },
            h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy !== null, onClick: () => void answer(confirm.commandId, true) }, t("mediaConfirmAllow")),
            h("button", { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void answer(confirm.commandId, false) }, t("mediaConfirmDecline"))),
          h("p", { className: "dcpa-chat-note" }, t("mediaConfirmNote")))),
        notice ? h("p", { role: "alert", className: "dcpa-chat-note" }, notice) : null);
    }

