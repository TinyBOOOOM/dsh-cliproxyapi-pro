// @client-source Market Update API client and opt-in automatic installation.
    // #region dshmarket installation (Update API v1)

    const MARKET_TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled", "rolled-back"]);
    const MARKET_POLL_MS = 1500;
    const MARKET_MAX_POLL_FAILURES = 20;
    const MARKET_FORCEABLE = new Set(["RELEASE_TOO_FRESH", "VERSION_UNCHANGED"]);
    const AUTO_INSTALL_FIRST_MS = 15000;
    const AUTO_INSTALL_INTERVAL_MS = 5 * 60 * 1000;
    const AUTO_INSTALL_RETRY_MS = 6 * 60 * 60 * 1000;
    const AUTO_INSTALL_MEMORY_KEY = `${PACKAGE_NAME}:market-auto-install`;
    const MARKET_ERROR_KEYS = {
      OPERATION_BUSY: "updateMarketBusy",
      AGENTS_RUNNING: "updateMarketAgentsRunning",
      RELEASE_TOO_FRESH: "updateMarketTooFresh",
      VERSION_UNCHANGED: "updateMarketVersionUnchanged",
      DOWNGRADE_DETECTED: "updateMarketDowngrade",
      RESOLVED_VERSION_MISMATCH: "updateMarketMismatch",
      UPDATE_TIMEOUT: "updateMarketTimeout",
      UPDATE_FORBIDDEN: "updateMarketForbidden",
      PLUGIN_NOT_INSTALLED: "updateNotInstalledHint",
      OPERATION_LOST: "updateMarketLost",
      MARKET_UNREACHABLE: "updateMarketUnreachable",
      RESTART_FAILED: "updateMarketRestartFailed",
    };

    function parseVersion(value) {
      const match = typeof value === "string"
        ? /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
        : null;
      return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split(".") : [] } : null;
    }

    /** SemVer precedence, or null when either side is not a version. */
    function compareVersions(a, b) {
      const x = parseVersion(a), y = parseVersion(b);
      if (!x || !y) return null;
      for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
      if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
      for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        const p = x.pre[i], q = y.pre[i];
        if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
        if (p === q) continue;
        const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
        if (pn && qn) return Number(p) > Number(q) ? 1 : -1;
        if (pn !== qn) return pn ? -1 : 1;
        return p > q ? 1 : -1;
      }
      return 0;
    }

    function validMarketOperation(value) {
      return !!value && typeof value === "object" && value.schema === MARKET_SCHEMA &&
        typeof value.operationId === "string" && value.operationId !== "" &&
        value.packageName === PACKAGE_NAME && typeof value.state === "string";
    }

    const marketFailureCode = (operation) =>
      typeof operation?.failure?.code === "string" && operation.failure.code ? operation.failure.code : "UPDATE_FAILED";

    function marketErrorText(t, code) {
      return t(Object.prototype.hasOwnProperty.call(MARKET_ERROR_KEYS, code) ? MARKET_ERROR_KEYS[code] : "updateMarketFailed");
    }

    /**
     * Shared, page-wide client of the dshmarket Update API. One instance lives
     * per client activation so the settings card and the background
     * auto-install runner observe the same operation.
     */
    function createMarketUpdater(io = {}) {
      const doFetch = io.fetch ?? ((url, init) => fetch(url, init));
      const later = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const cancelLater = io.clearTimeout ?? ((id) => clearTimeout(id));
      let state = {
        phase: "unknown", // unknown | discovering | ready | unavailable
        runtime: null,
        restartSupported: false,
        installing: false,
        automatic: false,
        targetVersion: null,
        operation: null,
        errorCode: null,
        restarting: false,
        restartRequested: false,
      };
      const listeners = new Set();
      const controllers = new Set();
      let disposed = false;
      let discovering = null;
      let pollTimer = null;
      let pollFailures = 0;

      const set = (patch) => {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const listener of [...listeners]) listener(state);
      };
      const request = async (url, init = {}) => {
        const controller = new AbortController();
        controllers.add(controller);
        try {
          const res = await doFetch(url, { cache: "no-store", ...init, signal: controller.signal });
          let body = null;
          try { body = await res.json(); } catch {}
          return { status: res.status, ok: res.ok, body };
        } finally {
          controllers.delete(controller);
        }
      };
      const post = (url, payload) => request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const applyOperation = (operation) => {
        const done = MARKET_TERMINAL_STATES.has(operation.state);
        set({
          operation,
          installing: !done,
          errorCode: done && operation.state === "failed" ? marketFailureCode(operation) : null,
        });
        if (!done) schedulePoll();
      };
      const schedulePoll = () => {
        if (pollTimer !== null) cancelLater(pollTimer);
        pollTimer = later(poll, MARKET_POLL_MS);
      };
      const poll = async () => {
        pollTimer = null;
        const id = state.operation?.operationId;
        if (disposed || !id) return;
        try {
          const { status, body } = await request(`${MARKET_API.operations}?operationId=${encodeURIComponent(id)}`);
          if (disposed || state.operation?.operationId !== id) return;
          if (status === 404) {
            // Operations live in the current Host process only.
            set({ installing: false, errorCode: "OPERATION_LOST" });
            return;
          }
          if (status !== 200 || !validMarketOperation(body?.operation) || body.operation.operationId !== id) {
            throw new Error("Invalid market operation");
          }
          pollFailures = 0;
          applyOperation(body.operation);
        } catch (error) {
          if (disposed || error?.name === "AbortError") return;
          if (++pollFailures >= MARKET_MAX_POLL_FAILURES) set({ installing: false, errorCode: "OPERATION_LOST" });
          else schedulePoll();
        }
      };

      return {
        getState: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        /** Reads only the local capability document; never contacts a registry. */
        discover() {
          if (disposed) return Promise.resolve(state);
          if (discovering) return discovering;
          if (state.phase !== "ready") set({ phase: "discovering" });
          discovering = request(MARKET_API.capabilities)
            .then(({ ok, body }) => {
              const usable = ok && body?.schema === MARKET_SCHEMA && body.apiVersion === 1 && body.features?.update === true;
              set({
                phase: usable ? "ready" : "unavailable",
                runtime: usable && typeof body.runtime === "string" ? body.runtime : null,
                restartSupported: usable && body.features?.restart === true && body.restart?.supported === true,
              });
            }, () => {
              set({ phase: "unavailable", runtime: null, restartSupported: false });
            })
            .finally(() => { discovering = null; })
            .then(() => state);
          return discovering;
        },
        /** Starts one market update operation, then follows it until it settles. */
        async install({ targetVersion = null, force = false, automatic = false } = {}) {
          if (disposed || state.phase !== "ready" || state.installing) return state;
          set({ installing: true, automatic, targetVersion, operation: null, errorCode: null, restartRequested: false });
          try {
            const { status, body } = await post(
              MARKET_API.updates,
              force ? { packageName: PACKAGE_NAME, force: true } : { packageName: PACKAGE_NAME }
            );
            if (disposed) return state;
            if (status === 202 && validMarketOperation(body?.operation)) {
              pollFailures = 0;
              applyOperation(body.operation);
              return state;
            }
            const code = typeof body?.failure?.code === "string" && body.failure.code ? body.failure.code
              : status === 409 ? "OPERATION_BUSY"
              : status === 403 ? "UPDATE_FORBIDDEN"
              : status === 400 ? "UPDATE_REJECTED"
              : status === 404 ? "MARKET_UNREACHABLE"
              : "UPDATE_FAILED";
            set({ installing: false, errorCode: code });
          } catch (error) {
            if (!disposed) set({ installing: false, errorCode: error?.name === "AbortError" ? null : "MARKET_UNREACHABLE" });
          }
          return state;
        },
        /** Only offered when the market reports that it owns process restarts. */
        async restart() {
          if (disposed || !state.restartSupported || state.restarting) return state;
          set({ restarting: true, errorCode: null });
          try {
            const { ok } = await post(MARKET_API.restart, {});
            set({ restarting: false, restartRequested: ok, errorCode: ok ? null : "RESTART_FAILED" });
          } catch (error) {
            set({ restarting: false, errorCode: error?.name === "AbortError" ? null : "RESTART_FAILED" });
          }
          return state;
        },
        dispose() {
          disposed = true;
          if (pollTimer !== null) cancelLater(pollTimer);
          pollTimer = null;
          for (const controller of controllers) controller.abort();
          controllers.clear();
          listeners.clear();
        },
      };
    }

    function readAutoInstallMemory() {
      try {
        const raw = JSON.parse(globalThis.localStorage?.getItem(AUTO_INSTALL_MEMORY_KEY) ?? "null");
        return raw && typeof raw.version === "string" && Number.isFinite(raw.at) ? raw : null;
      } catch {
        return null;
      }
    }

    function writeAutoInstallMemory(record) {
      try { globalThis.localStorage?.setItem(AUTO_INSTALL_MEMORY_KEY, JSON.stringify(record)); } catch {}
    }

    /**
     * Opt-in automatic installation. The Host's own automatic check finds the
     * version (channel/region aware); dshmarket installs it. Runs only while a
     * DSH page is open, reads the local status endpoint only, and tries each
     * version at most once per {@link AUTO_INSTALL_RETRY_MS} across reloads.
     */
    function startAutoInstall(market, io = {}) {
      const later = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const cancelLater = io.clearTimeout ?? ((id) => clearTimeout(id));
      const now = io.now ?? (() => Date.now());
      const memory = io.memory ?? { read: readAutoInstallMemory, write: writeAutoInstallMemory };
      const controller = new AbortController();
      const readStatus = io.readStatus ?? ((signal) => requestPluginUpdate(API.updateStatus, undefined, signal));
      let stopped = false;
      let timer = null;
      const unsubscribe = market.subscribe((state) => {
        const operation = state.operation;
        if (state.automatic && operation?.state === "succeeded" && typeof state.targetVersion === "string" &&
            compareVersions(operation.installedVersion, operation.beforeVersion) === 1) {
          memory.write({ version: state.targetVersion, at: now(), done: true });
        }
      });
      const tick = async () => {
        timer = null;
        try {
          const status = await readStatus(controller.signal);
          if (stopped) return;
          const version = status?.latestVersion;
          if (status?.autoInstall !== true || status.autoCheck !== true || status.available !== true ||
              status.blockedReason || typeof version !== "string" || compareVersions(version, status.currentVersion) !== 1) return;
          const last = memory.read();
          if (last && last.version === version && (last.done === true || now() - last.at < AUTO_INSTALL_RETRY_MS)) return;
          if (market.getState().phase !== "ready") await market.discover();
          const snapshot = market.getState();
          if (stopped || snapshot.phase !== "ready" || snapshot.installing) return;
          memory.write({ version, at: now() });
          await market.install({ targetVersion: version, automatic: true });
        } catch {
          // Background work never surfaces errors; the card shows the market state.
        } finally {
          if (!stopped) timer = later(tick, AUTO_INSTALL_INTERVAL_MS);
        }
      };
      timer = later(tick, AUTO_INSTALL_FIRST_MS);
      return () => {
        stopped = true;
        if (timer !== null) cancelLater(timer);
        controller.abort();
        unsubscribe();
      };
    }

    let sharedMarket = null;

    // #endregion
