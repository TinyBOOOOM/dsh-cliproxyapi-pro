// @client-source Composer peek placement inside a transformed containing block.
    /*
     * The composer peeks (`.dcpa-q-pop`, `position: fixed`) stay inside their
     * component: no portal, nothing appended to document.body. DSH's active
     * composer seat is sticky and carries `will-change: transform`, which makes
     * it the containing block of fixed descendants, so `left` / `bottom` count
     * from the seat, not the viewport. Plain viewport coordinates put the peek
     * somewhere else and let it drift with the composer.
     *
     * Each placement measures where the rendered peek actually landed, derives
     * the containing block's left and bottom edges from the offsets it applied,
     * and converts the wanted viewport position into that box. Ancestors from
     * the containing block upward that clip overflow (the chat scroller) bound
     * the peek together with the viewport. Without such a box the result equals
     * plain viewport placement.
     */
    const PEEK_WIDTH = 340;
    const PEEK_MIN_WIDTH = 160;
    const PEEK_GAP = 6;
    const PEEK_MARGIN = 16;
    const PEEK_MAX_HEIGHT = 440;
    const PEEK_MIN_HEIGHT = 120;
    // Measured once on open at the containing block origin, then shown.
    const PEEK_HIDDEN = Object.freeze({ visibility: "hidden", left: "0px", bottom: "0px" });

    /**
     * Pure placement. `anchor` and `box` are viewport rects of the anchor and of
     * the peek as rendered with `applied` `{ left, bottom }` offsets; `bounds`
     * is the visible area `{ left, top, right, bottom }` in viewport coordinates.
     * Returns offsets in the peek's own containing block.
     */
    function placePeek({ anchor, box, applied, bounds }) {
      const originLeft = box.left - applied.left;
      const originBottom = box.bottom + applied.bottom;
      const room = bounds.right - bounds.left - 2 * PEEK_MARGIN;
      const width = Math.min(PEEK_WIDTH, Math.max(PEEK_MIN_WIDTH, room));
      const left = Math.max(bounds.left + PEEK_MARGIN, Math.min(anchor.left, bounds.right - width - PEEK_MARGIN));
      const edge = anchor.top - PEEK_GAP;
      const maxHeight = Math.max(PEEK_MIN_HEIGHT, Math.min(PEEK_MAX_HEIGHT, edge - bounds.top - PEEK_MARGIN));
      return {
        left: Math.round(left - originLeft),
        bottom: Math.round(originBottom - edge),
        width: Math.round(width),
        maxHeight: Math.round(maxHeight),
      };
    }

    const samePeek = (a, b) =>
      !!a && !!b && a.left === b.left && a.bottom === b.bottom && a.width === b.width && a.maxHeight === b.maxHeight;

    /** Nearest ancestor that becomes the containing block of fixed descendants. */
    function fixedContainer(el) {
      const root = el?.ownerDocument?.documentElement ?? null;
      for (let node = el?.parentElement ?? null; node && node !== root; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (
          (s.transform && s.transform !== "none") ||
          (s.perspective && s.perspective !== "none") ||
          (s.filter && s.filter !== "none") ||
          (s.backdropFilter && s.backdropFilter !== "none") ||
          /transform|perspective|filter/.test(s.willChange ?? "") ||
          /paint|layout|strict|content/.test(s.contain ?? "") ||
          (s.containerType && s.containerType !== "normal")
        ) {
          return node;
        }
      }
      return null;
    }

    /** The containing block and its ancestors that clip a fixed peek. */
    function peekClips(pop) {
      const container = fixedContainer(pop);
      if (!container) return [];
      const root = pop.ownerDocument?.documentElement ?? null;
      const clips = [];
      for (let node = container; node && node !== root; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.overflowX !== "visible" || s.overflowY !== "visible" || /paint|strict|content/.test(s.contain ?? "")) clips.push(node);
      }
      return clips;
    }

    function peekBounds(clips) {
      const bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      for (const node of clips) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        bounds.left = Math.max(bounds.left, r.left);
        bounds.top = Math.max(bounds.top, r.top);
        bounds.right = Math.min(bounds.right, r.right);
        bounds.bottom = Math.min(bounds.bottom, r.bottom);
      }
      return bounds;
    }

    /**
     * Close an open peek on a press outside `wrapRef` (the peek renders inside
     * it) or on Escape, which returns focus to `buttonRef`.
     */
    function useDismissPeek(open, wrapRef, buttonRef, close) {
      const closeRef = useRef(close);
      closeRef.current = close;
      useEffect(() => {
        if (!open || typeof document === "undefined") return undefined;
        const onDown = (e) => {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) closeRef.current();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            closeRef.current();
            buttonRef.current?.focus?.();
          }
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [open]);
    }

    /**
     * Style for a fixed peek anchored above `anchorRef`, rendered with
     * `ref: popRef` inside the same component. Tracks the anchor every frame
     * while open (state changes only when the placement moves) and stays
     * hidden until the first measurement.
     */
    function useAnchoredPeek(open, anchorRef, popRef) {
      const [pos, setPos] = useState(null);
      useEffect(() => {
        if (!open) {
          setPos(null);
          return undefined;
        }
        if (typeof window === "undefined" || typeof getComputedStyle !== "function") return undefined;
        let clips = null;
        let frame = 0;
        const place = () => {
          const anchor = anchorRef.current?.getBoundingClientRect?.();
          const pop = popRef.current;
          const box = pop?.getBoundingClientRect?.();
          if (!anchor || !box || (anchor.width === 0 && anchor.height === 0)) return;
          clips ??= peekClips(pop);
          const applied = { left: parseFloat(pop.style.left) || 0, bottom: parseFloat(pop.style.bottom) || 0 };
          const next = placePeek({ anchor, box, applied, bounds: peekBounds(clips) });
          setPos((prev) => (samePeek(prev, next) ? prev : next));
        };
        const onResize = () => {
          clips = null;
          place();
        };
        const raf = typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame.bind(window) : null;
        const loop = () => {
          place();
          frame = raf(loop);
        };
        place();
        if (raf) frame = raf(loop);
        window.addEventListener("resize", onResize);
        return () => {
          if (raf && frame) window.cancelAnimationFrame?.(frame);
          window.removeEventListener("resize", onResize);
        };
      }, [open]);
      if (!open || !pos) return PEEK_HIDDEN;
      return { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` };
    }
