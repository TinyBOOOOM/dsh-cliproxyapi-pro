// @client-source Shared quota status store and subscription hook.
    function createQuotaStore(io = {}) {
      const fetchImpl = io.fetch ?? ((...args) => fetch(...args));
      const setT = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const clearT = io.clearTimeout ?? ((id) => clearTimeout(id));
      const listeners = new Set();
      let state = { data: null, loading: false, error: null, busy: null, busyAccount: null, loadedAt: 0 };
      let timer = null;
      let disposed = false;
      let seq = 0;
      let retryDelay = 0;
      const inflight = new Set();

      const emit = (patch) => {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const fn of [...listeners]) fn();
      };

      const request = async (url, init) => {
        const controller = new AbortController();
        inflight.add(controller);
        try {
          const res = await fetchImpl(url, { cache: "no-store", ...init, signal: controller.signal });
          let body = null;
          try {
            body = await res.json();
          } catch {}
          if (!res.ok || body === null || body.ok === false) {
            throw new Error(body?.error || `HTTP ${res.status}`);
          }
          return body;
        } finally {
          inflight.delete(controller);
        }
      };

      const schedule = () => {
        if (timer !== null) clearT(timer);
        timer = null;
        if (disposed || listeners.size === 0) return;
        // A stale "refreshing" snapshot must not turn failed status reads into a 4 s loop.
        const delay = retryDelay || (state.data?.refreshing ? QUOTA_BUSY_POLL_MS : QUOTA_POLL_MS);
        timer = setT(() => {
          timer = null;
          void load().finally(schedule);
        }, delay);
      };

      const load = async () => {
        if (disposed) return;
        const mine = ++seq;
        emit({ loading: true });
        try {
          const body = await request(API.quotaStatus);
          if (!disposed && mine === seq) {
            retryDelay = 0;
            emit({ data: body.quota ?? null, error: null, loading: false, loadedAt: Date.now() });
          }
        } catch (error) {
          if (disposed) return;
          if (mine === seq) {
            retryDelay = retryDelay ? Math.min(retryDelay * 2, 300 * 1000) : QUOTA_POLL_MS;
            emit({ error: error instanceof Error ? error.message : String(error), loading: false });
          }
        }
      };

      const mutate = async (kind, url, payload) => {
        if (disposed) return { ok: false };
        const mine = ++seq;
        emit({ busy: kind, busyAccount: payload?.accountId ?? null, error: null });
        try {
          const body = await request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? {}),
          });
          if (!disposed && mine === seq) {
            retryDelay = 0;
            emit({ data: body.quota ?? state.data, error: null, loading: false, loadedAt: Date.now() });
          }
          emit({ busy: null, busyAccount: null });
          schedule();
          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ busy: null, busyAccount: null, ...(mine === seq ? { error: message } : {}) });
          return { ok: false, error: message };
        }
      };

      return {
        getSnapshot: () => state,
        subscribe(fn) {
          if (disposed) return () => {};
          listeners.add(fn);
          if (listeners.size === 1) {
            if (state.data === null || Date.now() - state.loadedAt > QUOTA_POLL_MS) void load().finally(schedule);
            else schedule();
          }
          return () => {
            listeners.delete(fn);
            if (listeners.size === 0 && timer !== null) {
              clearT(timer);
              timer = null;
            }
          };
        },
        load,
        refresh: (accountId) => mutate("refresh", API.quotaRefresh, accountId ? { accountId } : {}),
        saveKey: (accountId, managementKey) => mutate("save", API.quotaSave, { accountId, managementKey }),
        clearKey: (accountId) => mutate("clear", API.quotaSave, { accountId, clear: true }),
        dispose() {
          disposed = true;
          if (timer !== null) clearT(timer);
          timer = null;
          for (const c of inflight) c.abort();
          inflight.clear();
          listeners.clear();
        },
      };
    }

    let sharedQuota = null;

    /** Subscribe a component to the shared quota store (null when inactive). */
    function useQuota(store) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (store === null || store === undefined) return undefined;
        let alive = true;
        const off = store.subscribe(() => {
          if (alive) setTick((n) => n + 1);
        });
        return () => {
          alive = false;
          off();
        };
      }, [store]);
      return store ? store.getSnapshot() : { data: null, loading: false, error: null, busy: null };
    }

