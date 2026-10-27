// @client-source Accessible help/form controls and account status summaries.
    /**
     * Small "i" help button: the explanation opens on hover, keyboard focus or
     * click (touch), closes on Escape / leaving. The text stays in the locale
     * dictionaries and is announced through aria-describedby.
     */
    function InfoTip({ t, text }) {
      const [open, setOpen] = useState(false);
      const [alignEnd, setAlignEnd] = useState(false);
      const ref = useRef(null);
      const id = useMemo(() => `dcpa-tip-${Math.random().toString(36).slice(2, 9)}`, []);
      if (!text) return null;
      // Open towards the roomier side of the surrounding page.
      const show = () => {
        const el = ref.current;
        const box = el?.closest?.(".dcpa-wrap, .dcpa-q-pop")?.getBoundingClientRect?.();
        const r = el?.getBoundingClientRect?.();
        if (box && r) setAlignEnd(r.left - box.left > box.width / 2);
        setOpen(true);
      };
      return h(
        "span",
        {
          ref,
          className: "dcpa-info",
          onMouseEnter: show,
          onMouseLeave: () => setOpen(false),
        },
        h(
          "button",
          {
            type: "button",
            className: "dcpa-info-btn",
            "aria-label": t("infoLabel"),
            "aria-describedby": open ? id : undefined,
            "aria-expanded": open,
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (open) setOpen(false);
              else show();
            },
            onFocus: show,
            onBlur: () => setOpen(false),
            onKeyDown: (e) => {
              if (e.key === "Escape") setOpen(false);
            },
          },
          "i"
        ),
        open ? h("span", { id, role: "tooltip", className: "dcpa-info-pop", "data-align": alignEnd ? "end" : "start" }, text) : null
      );
    }

    /** One labelled form row: label (+ help) on the left, control on the right. */
    function FieldRow({ t, label, help, htmlFor, children, stack = false }) {
      return h(
        "div",
        { className: stack ? "dcpa-frow dcpa-frow-stack" : "dcpa-frow" },
        h(
          "div",
          { className: "dcpa-frow-label" },
          htmlFor ? h("label", { htmlFor }, label) : h("span", null, label),
          help ? h(InfoTip, { t, text: help }) : null
        ),
        h("div", { className: "dcpa-frow-control" }, children)
      );
    }

    function accountStateLabel(t, state) {
      return state === "connected"
        ? t("statusConnected")
        : state === "probing"
        ? t("statusProbing")
        : state === "error"
        ? t("statusError")
        : state === "disabled"
        ? t("statusDisabled")
        : t("statusIdle");
    }

    /** Lowest remaining percentage among an account's usable credentials (tab hint). */
    function accountQuotaFloor(quotaData, accountId) {
      const account = (quotaData?.accounts ?? []).find((a) => a.accountId === accountId);
      if (!account || account.keyConfigured !== true) return null;
      const values = (account.credentials ?? [])
        .filter((c) => c.status === "active")
        .map((c) => credentialHeadroom(c))
        .filter((v) => v !== null);
      return values.length > 0 ? Math.min(...values) : null;
    }

