// @client-source Composer/hero presence, model-directory recovery and clock hooks.
    /**
     * Which sessions currently have a composer badge mounted. The composer
     * renders conversation.input.right only once the session is bound (its
     * input state exists), but the New Session hero shows the model selector
     * earlier. The hero badge (conversation.hero.options) therefore renders
     * only while no composer badge is mounted for the same session, so the
     * user always sees exactly one badge. Plain in-memory counts; no DOM.
     */
    function createBadgePresence() {
      const counts = new Map();
      const listeners = new Set();
      const notify = () => {
        for (const fn of [...listeners]) fn();
      };
      return {
        add(id) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
          notify();
          let done = false;
          return () => {
            if (done) return;
            done = true;
            const n = (counts.get(id) ?? 1) - 1;
            if (n > 0) counts.set(id, n);
            else counts.delete(id);
            notify();
          };
        },
        has: (id) => (counts.get(id) ?? 0) > 0,
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };
    }
    const composerBadges = createBadgePresence();
    // The generation-model button has its own composer/hero presence.
    const mediaChips = createBadgePresence();
    // The Generation tab tells the composer buttons when the master switch
    // changed, so they appear / disappear without waiting for a retry.
    const mediaGenerationListeners = new Set();
    const announceMediaGeneration = () => {
      for (const fn of [...mediaGenerationListeners]) {
        try {
          fn();
        } catch {}
      }
    };

    /**
     * Composer placement announces itself for its session; hero placement
     * reports whether a composer badge already covers the session.
     */
    function useBadgePlacement(placement, sessionId, presence = composerBadges) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (typeof sessionId !== "string" || sessionId === "") return undefined;
        if (placement === "hero") {
          let alive = true;
          const off = presence.subscribe(() => {
            if (alive) setTick((n) => n + 1);
          });
          setTick((n) => n + 1);
          return () => {
            alive = false;
            off();
          };
        }
        return presence.add(sessionId);
      }, [placement, sessionId, presence]);
      return placement === "hero" && typeof sessionId === "string" && presence.has(sessionId);
    }

    /**
     * The session's model-directory store, resolved at render time. DSH caches
     * a slot entry's inject() result per session binding, and right after a
     * page load, host restart or session switch `directoryFor()` can still
     * throw (no scope/binding yet). Resolving inside inject would cache that
     * miss for good, so inject hands over a resolver and this hook retries
     * (1 s for the first 30 s, then every 5 s) until the directory exists.
     */
    function useDirectory(direct, resolve) {
      const [, setTick] = useState(0);
      let resolved = direct ?? null;
      if (resolved === null && typeof resolve === "function") {
        try {
          resolved = resolve() ?? null;
        } catch {
          resolved = null;
        }
      }
      const missing = resolved === null && typeof resolve === "function";
      useEffect(() => {
        if (!missing) return undefined;
        let alive = true;
        let id = null;
        let tries = 0;
        const tick = () => {
          id = null;
          if (!alive) return;
          tries += 1;
          setTick((n) => n + 1);
          id = setTimeout(tick, tries < 30 ? 1000 : 5000);
        };
        id = setTimeout(tick, 300);
        return () => {
          alive = false;
          if (id !== null) clearTimeout(id);
        };
      }, [missing, resolve]);
      return resolved;
    }

    /** Re-render every `ms` so relative times stay current. */
    function useNow(ms) {
      const [now, setNow] = useState(() => Date.now());
      useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(id);
      }, [ms]);
      return now;
    }
