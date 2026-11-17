// @client-source Accessible help/form controls and account status summaries.
    // Gap between the help button and its bubble, the margin kept from the
    // edge of the visible area, and the smallest capped bubble height (px).
    const TIP_GAP = 6;
    const TIP_MARGIN = 8;
    const TIP_MIN_HEIGHT = 48;
    // The bubble's start edge sits this far before the button (matches the CSS).
    const TIP_INSET = 8;

    function tipView() {
      return typeof window === "undefined" ? null : window;
    }

    /** Whether this browser can lift an in-slot element into the top layer. */
    function canUseTopLayer(pop) {
      return typeof pop?.showPopover === "function" && typeof pop?.setAttribute === "function";
    }

    /**
     * The area an in-place element can actually be seen in: the viewport
     * intersected with every ancestor that clips its overflow (the Settings
     * dialog body, scroll panes, popovers).
     */
    function visibleBounds(el) {
      const view = tipView();
      let bounds = {
        top: 0,
        left: 0,
        right: view?.innerWidth ?? Infinity,
        bottom: view?.innerHeight ?? Infinity,
      };
      for (let node = el?.parentElement; node; node = node.parentElement) {
        const style = view?.getComputedStyle?.(node);
        if (!style) break;
        const clips = [style.overflow, style.overflowX, style.overflowY].some((v) => v && v !== "visible");
        if (!clips) continue;
        const r = node.getBoundingClientRect();
        bounds = {
          top: Math.max(bounds.top, r.top),
          left: Math.max(bounds.left, r.left),
          right: Math.min(bounds.right, r.right),
          bottom: Math.min(bounds.bottom, r.bottom),
        };
      }
      return bounds;
    }

    /**
     * Place an open bubble next to its help button, writing only the bubble's
     * own position styles and data attributes.
     *
     * In the top layer (`topLayer`), the bubble is free of every clipping
     * ancestor and is laid out with fixed viewport coordinates: below the
     * button when it fits, otherwise on the roomier side, shifted back inside
     * the window horizontally, and capped with its own scrolling only when the
     * whole window cannot hold it. Without top-layer support it stays absolutely
     * positioned in place and the same rules apply within the visible area of
     * its clipping ancestors.
     */
    function placeTip(anchor, pop, topLayer) {
      const view = tipView();
      const a = anchor?.getBoundingClientRect?.();
      if (!a || !pop?.style) return;
      const bounds = topLayer
        ? { top: 0, left: 0, right: view?.innerWidth ?? Infinity, bottom: view?.innerHeight ?? Infinity }
        : visibleBounds(anchor);
      // Measure the natural size: drop any earlier cap first.
      pop.style.maxHeight = "";
      pop.style.overflowY = "";
      const natural = pop.getBoundingClientRect?.() ?? { width: 0, height: 0 };
      const height = Math.max(natural.height ?? 0, pop.scrollHeight ?? 0);
      const width = natural.width ?? 0;
      const below = bounds.bottom - a.bottom - TIP_GAP - TIP_MARGIN;
      const aboveRoom = a.top - bounds.top - TIP_GAP - TIP_MARGIN;
      const above = height > below && aboveRoom > below;
      const room = above ? aboveRoom : below;
      const shown = height > room ? Math.max(TIP_MIN_HEIGHT, Math.floor(room)) : height;
      if (height > room) {
        pop.style.maxHeight = `${shown}px`;
        pop.style.overflowY = "auto";
      }
      pop.setAttribute?.("data-place", above ? "above" : "below");
      if (topLayer) {
        const maxLeft = bounds.right - width - TIP_MARGIN;
        const left = Math.max(bounds.left + TIP_MARGIN, Math.min(a.left - TIP_INSET, maxLeft));
        const top = above ? a.top - TIP_GAP - shown : a.bottom + TIP_GAP;
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(top)}px`;
        return;
      }
      // In place: open towards the roomier horizontal side of the visible area.
      pop.setAttribute?.("data-align", a.left - bounds.left > bounds.right - a.right ? "end" : "start");
    }

    /**
     * Small "i" help button: the explanation opens on hover, keyboard focus or
     * click (touch), closes on Escape / leaving. The text stays in the locale
     * dictionaries and is announced through aria-describedby.
     *
     * The bubble node is rendered inside this plugin's slot (plugins never
     * write to `document.body`) but is shown through the Popover API in the
     * browser's top layer, so it can extend past the Settings dialog instead of
     * being cut by its clipping containers. It follows its button while the
     * page scrolls or resizes. See {@link placeTip}.
     */
    function InfoTip({ t, text }) {
      const [open, setOpen] = useState(false);
      const ref = useRef(null);
      const popRef = useRef(null);
      const id = useMemo(() => `dcpa-tip-${Math.random().toString(36).slice(2, 9)}`, []);

      // Show and place before paint so the bubble never flashes at a wrong spot.
      useLayoutEffect(() => {
        if (!open) return undefined;
        const anchor = ref.current;
        const pop = popRef.current;
        if (!anchor || !pop) return undefined;
        let topLayer = false;
        if (canUseTopLayer(pop)) {
          try {
            pop.setAttribute("popover", "manual");
            if (!pop.matches?.(":popover-open")) pop.showPopover();
            topLayer = true;
          } catch {
            pop.removeAttribute?.("popover");
          }
        }
        pop.setAttribute?.("data-layer", topLayer ? "top" : "inline");
        const place = () => placeTip(anchor, pop, topLayer);
        place();
        const view = tipView();
        if (typeof view?.addEventListener !== "function") return undefined;
        // Capture scrolls of any pane (the Settings body scrolls, not the window).
        view.addEventListener("scroll", place, true);
        view.addEventListener("resize", place);
        return () => {
          view.removeEventListener("scroll", place, true);
          view.removeEventListener("resize", place);
        };
      }, [open, text]);

      if (!text) return null;
      const show = () => setOpen(true);
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
        // Unmounting a shown popover hides it, so closing needs no hidePopover().
        open ? h("span", { id, ref: popRef, role: "tooltip", className: "dcpa-info-pop" }, text) : null
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
