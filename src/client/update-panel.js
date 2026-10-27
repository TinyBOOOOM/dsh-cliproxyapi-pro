// @client-source Plugin update panel and plugin page.
    /** Update state is isolated: polling never reloads account data or drafts. */
    function PluginUpdatePanel({ t, market = null, initiallyOpen = false }) {
      const [update, setUpdate] = useState(null);
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(null);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [confirmVersion, setConfirmVersion] = useState(null);
      const lifecycle = useRef(null);

      const loadStatus = useCallback(async () => {
        const life = lifecycle.current;
        if (!life?.mounted || life.action || life.polling) return;
        life.polling = true;
        const serial = ++life.serial;
        const controller = new AbortController();
        life.controllers.add(controller);
        life.statusController = controller;
        try {
          // This GET is read-only. Only an explicit check action probes the registry.
          const next = await requestPluginUpdate(API.updateStatus, undefined, controller.signal);
          if (!life.mounted || serial !== life.serial) return;
          life.snapshot = next;
          setUpdate(next);
          setError((previous) => (previous?.source === "status" ? null : previous));
        } catch (failure) {
          if (!life.mounted || serial !== life.serial || failure?.name === "AbortError") return;
          setError((previous) =>
            previous && previous.source !== "status"
              ? previous
              : { failure, fallback: "updateLoadFailed", source: "status" }
          );
        } finally {
          life.controllers.delete(controller);
          if (life.statusController === controller) life.statusController = null;
          life.polling = false;
          if (life.mounted) setLoading(false);
        }
      }, []);

      useEffect(() => {
        // A fresh lifetime also prevents old StrictMode/HMR requests from winning.
        const life = {
          mounted: true,
          action: false,
          polling: false,
          serial: 0,
          controllers: new Set(),
          statusController: null,
          snapshot: null,
        };
        lifecycle.current = life;
        let timer;
        const poll = async () => {
          await loadStatus();
          if (life.mounted) {
            timer = setTimeout(poll, life.snapshot?.checking || life.snapshot?.downloading ? 2000 : 15000);
          }
        };
        void poll();
        return () => {
          life.mounted = false;
          life.serial += 1;
          clearTimeout(timer);
          for (const controller of life.controllers) controller.abort();
          life.controllers.clear();
        };
      }, [loadStatus]);

      const runAction = useCallback(async (kind, payload = {}) => {
        const life = lifecycle.current;
        if (!life?.mounted || life.action || life.snapshot?.checking || life.snapshot?.downloading) return;
        life.action = true;
        life.serial += 1;
        life.statusController?.abort();
        setBusy(kind);
        setError(null);
        setNotice(null);
        setConfirmVersion(null);
        const controller = new AbortController();
        life.controllers.add(controller);
        const url = kind === "save" ? API.updateSave : kind === "download" ? API.updateDownload : API.updateCheck;
        try {
          const next = await requestPluginUpdate(url, payload, controller.signal);
          if (!life.mounted) return;
          life.snapshot = next;
          setUpdate(next);
          if (kind === "save") setNotice("updateSaved");
          if (kind === "download" && !next.downloadedVersion) setNotice("updateDownloadRequested");
        } catch (failure) {
          if (!life.mounted || failure?.name === "AbortError") return;
          if (failure?.updateState && typeof failure.updateState === "object") {
            life.snapshot = failure.updateState;
            setUpdate(failure.updateState);
          }
          setError({
            failure,
            fallback: kind === "save" ? "updateSaveFailed" : kind === "download" ? "updateDownloadFailed" : "updateCheckFailed",
            source: kind,
          });
        } finally {
          life.controllers.delete(controller);
          life.action = false;
          if (life.mounted) setBusy(null);
        }
      }, []);

      // dshmarket state is shared with the background auto-install runner.
      const [marketState, setMarketState] = useState(() => market?.getState() ?? null);
      const [confirmInstall, setConfirmInstall] = useState(null);
      useEffect(() => {
        if (!market) return undefined;
        let live = true;
        const unsubscribe = market.subscribe((next) => { if (live) setMarketState(next); });
        setMarketState(market.getState());
        if (market.getState().phase === "unknown") void market.discover();
        return () => {
          live = false;
          unsubscribe();
        };
      }, [market]);

      const working = loading || busy !== null || update?.checking === true || update?.downloading === true;
      const blockedReason = update?.blockedReason;
      const downloadBlocked = !!blockedReason && blockedReason !== "linked-install";
      const blockedKey = blockedReason === "linked-install"
        ? "updateLinkedHint"
        : blockedReason === "unsupported-host"
        ? "updateUnsupportedHint"
        : blockedReason === "not-installed"
        ? "updateNotInstalledHint"
        : "updateBlockedHint";
      const canDownload = !!update?.available && typeof update.latestVersion === "string" && !!update.latestVersion && !downloadBlocked;
      const downloading = busy === "download" || update?.downloading === true;
      const checking = busy === "check" || update?.checking === true;
      const availableVersion = update?.latestVersion || t("updateNotChecked");
      const versionSummary = t("updateVersionSummary")
        .replace("{current}", update?.currentVersion || t("updateUnknownVersion"))
        .replace("{latest}", availableVersion);
      const statusError = update?.error || update?.errorCode
        ? { updateCode: update.errorCode }
        : null;
      const linkedInstall = blockedReason === "linked-install";
      const marketReady = marketState?.phase === "ready";
      const marketOperation = marketState?.operation ?? null;
      const marketInstalling = marketState?.installing === true;
      const marketInstalledVersion = marketOperation?.state === "succeeded" &&
        compareVersions(marketOperation.installedVersion, marketOperation.beforeVersion) === 1
        ? marketOperation.installedVersion : null;
      const canMarketInstall = marketReady && !linkedInstall && !downloadBlocked && !marketInstalling &&
        !marketInstalledVersion && !!update?.available && typeof update.latestVersion === "string" && !!update.latestVersion;
      const compactState = loading ? "loading" : marketInstalling ? "installing" : downloading ? "downloading" : checking ? "checking" :
        marketInstalledVersion ? "installed" :
        error || statusError ? "error" : update?.downloadedVersion && update.downloadedVersion === update.latestVersion ? "downloaded" :
          update?.available ? "available" : "idle";
      // Name the actual failure instead of a generic "update error": the
      // status endpoint missing (host not reloaded) reads very differently
      // from a registry that could not be reached.
      const failureCode = statusError?.updateCode ?? update?.errorCode ?? null;
      const compactErrorKey = error
        ? error.source === "status" ? "updateCompactStatusUnavailable" : "updateCompactError"
        : failureCode === "network-error" ? "updateCompactErrorNetwork"
        : failureCode === "service-unavailable" ? "updateCompactStatusUnavailable"
        : failureCode === "channel-unavailable" ? "updateCompactErrorChannel"
        : "updateCompactError";
      const compactText = loading ? t("updateLoading") : marketInstalling ? t("updateMarketInstalling") :
        downloading ? t("updateDownloading") : checking ? t("updateChecking") :
        marketInstalledVersion ? t("updateCompactInstalled").replace("{version}", marketInstalledVersion) :
        error || statusError ? t(compactErrorKey) : compactState === "downloaded"
          ? t("updateCompactDownloaded").replace("{version}", update.downloadedVersion)
          : update?.available ? t("updateCompactAvailable").replace("{version}", availableVersion)
          : update?.latestVersion ? t("updateUpToDate") : t("updateNotChecked");
      let checkedAt = t("updateNotChecked");
      if (update?.lastCheckedAt) {
        const date = new Date(update.lastCheckedAt);
        if (Number.isFinite(date.getTime())) checkedAt = date.toLocaleString();
      }
      const regionName = (region) => t(region === "cn" ? "updateRegionCn" : "updateRegionGlobal");
      const segmented = (field, label, options, selected) =>
        h(
          "div",
          { className: "dcpa-seg", role: "group", "aria-label": t(label) },
          options.map(([value, key]) =>
            h("button", {
              key: value,
              type: "button",
              className: "dcpa-seg-btn",
              disabled: working || !update,
              "aria-pressed": selected === value,
              "data-active": selected === value ? "true" : "false",
              onClick: () => { if (selected !== value) void runAction("save", { [field]: value }); },
            }, t(key))
          )
        );
      const toggle = (field, label, hint, checked, unavailable = false) =>
        h(
          "div",
          { className: "dcpa-update-row dcpa-switch-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t(label)),
            h("p", { className: "dcpa-hint" }, t(hint))
          ),
          h("button", {
            type: "button",
            role: "switch",
            className: "dcpa-switch",
            "aria-label": t(label),
            "aria-checked": checked,
            // An unavailable feature can still be switched off, never on.
            disabled: working || !update || unavailable && !checked,
            onClick: () => { void runAction("save", { [field]: !checked }); },
          }, h("span", { className: "dcpa-switch-thumb" }))
        );

      // One-click/automatic installation through dshmarket. Hidden entirely
      // when the card is rendered without a market client (tests, previews).
      let marketSection = null;
      if (market) {
        const phase = marketState?.phase ?? "unknown";
        const hintKey = phase === "ready"
          ? linkedInstall ? "updateMarketLinkedHint" : "updateMarketReadyHint"
          : phase === "unavailable" ? "updateMarketUnavailableHint" : "updateMarketDetecting";
        const operation = marketOperation;
        const progress = operation?.progress;
        const percent = typeof progress?.percent === "number" && Number.isFinite(progress.percent) ? Math.round(progress.percent) : null;
        const errorCode = marketState?.errorCode ?? null;
        const outcome = operation?.outcome ?? {};
        const target = marketState?.targetVersion;
        const prefix = marketState?.automatic ? `${t("updateMarketAutomaticPrefix")} ` : "";
        let result = null;
        if (marketInstalling) {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-label" }, prefix + (percent === null
              ? t("updateMarketInstalling")
              : t("updateMarketProgress").replace("{percent}", String(percent))))
          );
        } else if (marketInstalledVersion) {
          const restartHint = outcome.restartRequired
            ? marketState?.restartSupported ? "updateMarketRestartHint"
              : marketState?.runtime === "desktop" ? "updateMarketRestartDesktopHint" : "updateMarketRestartManualHint"
            : outcome.refreshRequired ? "updateMarketRefreshHint" : "updateMarketAppliedHint";
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-success" }, prefix + t("updateMarketInstalled").replace("{version}", marketInstalledVersion)),
            typeof target === "string" && compareVersions(marketInstalledVersion, target) === -1
              ? h("p", { className: "dcpa-hint" }, t("updateMarketVersionLower").replace("{installed}", marketInstalledVersion).replace("{target}", target))
              : null,
            h("p", { className: "dcpa-hint" }, t(marketState?.restartRequested ? "updateMarketRestartRequested" : restartHint)),
            outcome.restartRequired && marketState?.restartSupported && !marketState?.restartRequested
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    disabled: marketState?.restarting === true,
                    onClick: () => { void market.restart(); },
                  }, marketState?.restarting ? t("updateMarketRestarting") : t("updateMarketRestartBtn")))
              : !outcome.restartRequired && outcome.refreshRequired
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    onClick: () => { globalThis.location?.reload(); },
                  }, t("updateMarketRefreshBtn")))
              : null
          );
        } else if (operation?.state === "succeeded") {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-hint" }, prefix + t("updateMarketUnchanged")));
        } else if (operation?.state === "cancelled" || operation?.state === "rolled-back") {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-hint" }, prefix + t(operation.state === "cancelled" ? "updateMarketCancelled" : "updateMarketRolledBack")));
        }
        const errorBlock = errorCode && !marketInstalling
          ? h("div", { className: "dcpa-update-notice" },
              h("p", { className: "dcpa-error", role: "alert" }, prefix + marketErrorText(t, errorCode)),
              MARKET_FORCEABLE.has(errorCode) && canMarketInstall
                ? h("div", { className: "dcpa-actions" },
                    h("button", {
                      type: "button",
                      className: "dcpa-btn",
                      disabled: working,
                      onClick: () => { void market.install({ targetVersion: update.latestVersion, force: true }); },
                    }, t("updateMarketForceBtn")))
                : null)
          : null;
        marketSection = h(React.Fragment, null,
          h("div", { className: "dcpa-update-row" },
            h("div", { className: "dcpa-field" },
              h("span", { className: "dcpa-label" }, t("updateMarketLabel")),
              h("p", { className: "dcpa-hint" }, t(hintKey))
            ),
            phase === "ready" && !linkedInstall
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    disabled: working || !canMarketInstall,
                    onClick: () => { setConfirmVersion(null); setConfirmInstall(update.latestVersion); },
                  }, marketInstalling ? t("updateMarketInstalling")
                    : marketInstalledVersion ? t("updateMarketInstalledBtn") : t("updateMarketInstallBtn")))
              : phase === "unavailable"
              ? h("div", { className: "dcpa-actions" },
                  h("button", { type: "button", className: "dcpa-btn", onClick: () => { void market.discover(); } }, t("updateMarketRedetectBtn")))
              : null
          ),
          confirmInstall ? h("div", {
            className: "dcpa-update-notice",
            role: "alertdialog",
            "aria-modal": false,
            "aria-label": t("updateMarketConfirmTitle").replace("{version}", confirmInstall),
          },
            h("p", { className: "dcpa-label" }, t("updateMarketConfirmTitle").replace("{version}", confirmInstall)),
            h("p", { className: "dcpa-hint" }, t("updateMarketConfirmHint")),
            h("div", { className: "dcpa-actions" },
              h("button", {
                type: "button",
                className: "dcpa-btn dcpa-btn-primary",
                disabled: working || !canMarketInstall || confirmInstall !== update?.latestVersion,
                onClick: () => {
                  const version = confirmInstall;
                  setConfirmInstall(null);
                  void market.install({ targetVersion: version });
                },
              }, t("updateMarketConfirmBtn")),
              h("button", { type: "button", className: "dcpa-btn", onClick: () => setConfirmInstall(null) }, t("updateCancelBtn"))
            ),
            confirmInstall !== update?.latestVersion ? h("p", { className: "dcpa-hint" }, t("updateStaleVersion")) : null
          ) : null,
          result,
          errorBlock
        );
      }

      // Native details starts closed. Do not control `open`: polling and saves
      // must preserve the user's expanded/collapsed choice without remounting.
      // `initiallyOpen` (the update-only plugin page) passes a constant `true`
      // that never changes, so React never rewrites it after mount and the
      // user can still collapse the card.
      return h(
        "details",
        {
          className: "dcpa-card dcpa-update-card",
          "aria-label": t("updateTitle"),
          "aria-busy": working,
          ...(initiallyOpen ? { open: true } : {}),
        },
        h("summary", { className: "dcpa-update-summary", title: t("updateToggleDetails") },
          h("span", { className: "dcpa-update-summary-title" }, t("updateTitle")),
          h("span", { className: "dcpa-update-summary-current" },
            t("updateCompactCurrent").replace("{version}", update?.currentVersion || t("updateUnknownVersion"))),
          h("span", { className: "dcpa-update-summary-status", "data-state": compactState, role: "status", "aria-live": "polite" }, compactText)
        ),
        h("div", { className: "dcpa-update-content" },
        h("p", { className: "dcpa-subtitle" }, t("updateSubtitle")),
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateNewVersion")),
            h("span", { className: "dcpa-update-version", role: "status", "aria-live": "polite" },
              loading ? t("updateLoading") : downloading ? t("updateDownloading") : checking ? t("updateChecking") :
                update?.available ? availableVersion : update?.latestVersion ? t("updateUpToDate") : t("updateNotChecked")
            ),
            h("p", { className: "dcpa-hint" }, versionSummary),
            update?.available ? h("span", { className: "dcpa-hint" }, t("updateAvailable")) : null
          ),
          h("div", { className: "dcpa-actions" },
            h("button", {
              type: "button",
              className: "dcpa-btn",
              disabled: working,
              onClick: () => { if (update) void runAction("check"); else { setLoading(true); void loadStatus(); } },
            }, checking ? t("updateChecking") : !update && !loading ? t("updateRetryBtn") : t("updateCheckBtn")),
            h("button", {
              type: "button",
              className: marketReady && !linkedInstall ? "dcpa-btn" : "dcpa-btn dcpa-btn-primary",
              disabled: working || !canDownload,
              onClick: () => { setConfirmInstall(null); setConfirmVersion(update.latestVersion); },
            }, downloading ? t("updateDownloading") : update?.downloadedVersion === update?.latestVersion && update?.downloadedVersion
              ? t("updateDownloadedBtn") : t("updateDownloadBtn"))
          )
        ),
        confirmVersion ? h("div", {
          className: "dcpa-update-notice",
          role: "alertdialog",
          "aria-modal": false,
          "aria-label": t("updateConfirmTitle").replace("{version}", confirmVersion),
        },
          h("p", { className: "dcpa-label" }, t("updateConfirmTitle").replace("{version}", confirmVersion)),
          h("p", { className: "dcpa-hint" }, t(blockedReason === "linked-install" ? "updateLinkedConfirmHint" : "updateConfirmHint")),
          h("div", { className: "dcpa-actions" },
            h("button", {
              type: "button",
              className: "dcpa-btn dcpa-btn-primary",
              disabled: working || !canDownload || confirmVersion !== update?.latestVersion,
              onClick: () => { void runAction("download", { version: confirmVersion }); },
            }, t("updateConfirmBtn")),
            h("button", { type: "button", className: "dcpa-btn", onClick: () => setConfirmVersion(null) }, t("updateCancelBtn"))
          ),
          confirmVersion !== update?.latestVersion ? h("p", { className: "dcpa-hint" }, t("updateStaleVersion")) : null
        ) : null,
        marketSection,
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateChannelLabel")),
            h("p", { className: "dcpa-hint" }, t("updateChannelHint"))
          ),
          segmented("channel", "updateChannelLabel", [
            ["stable", "updateChannelStable"], ["beta", "updateChannelBeta"], ["dev", "updateChannelDev"],
          ], update?.channel || "stable")
        ),
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateRegionLabel")),
            h("p", { className: "dcpa-hint" }, t("updateRegionHint")),
            update?.effectiveRegion ? h("p", { className: "dcpa-hint" }, t("updateEffectiveRegion").replace("{region}", regionName(update.effectiveRegion))) : null
          ),
          segmented("region", "updateRegionLabel", [
            ["auto", "updateRegionAuto"], ["global", "updateRegionGlobal"], ["cn", "updateRegionCn"],
          ], update?.region || "auto")
        ),
        toggle("autoCheck", "updateAutoCheckLabel", "updateAutoCheckHint", update?.autoCheck !== false),
        toggle("autoDownload", "updateAutoDownloadLabel", "updateAutoDownloadHint", update?.autoDownload === true),
        toggle("autoInstall", "updateAutoInstallLabel", "updateAutoInstallHint", update?.autoInstall === true,
          !marketReady || linkedInstall || downloadBlocked),
        blockedReason ? h("div", { className: "dcpa-update-notice" }, h("p", { className: "dcpa-hint" }, t(blockedKey))) : null,
        update?.downloadedVersion && update?.downloadPath ? h("div", { className: "dcpa-update-notice", role: "status" },
          h("p", { className: "dcpa-label" }, t(blockedReason === "linked-install" ? "updateLinkedDownloadedHint" : "updateDownloadedHint").replace("{version}", update.downloadedVersion)),
          h("span", { className: "dcpa-label" }, t("updateDownloadPathLabel")),
          h("code", { className: "dcpa-update-code" }, update.downloadPath),
          blockedReason !== "linked-install" && update.upgradeCommand ? h(React.Fragment, null,
            h("span", { className: "dcpa-label" }, t("updateUpgradeCommandLabel")),
            h("pre", { className: "dcpa-update-code" }, h("code", null, update.upgradeCommand))
          ) : h("p", { className: "dcpa-hint" }, t(blockedReason === "linked-install" ? "updateLinkedSourceHint" : "updateCommandUnavailable"))
        ) : null,
        h("div", { className: "dcpa-update-footer" },
          error ? h("p", { className: "dcpa-error", role: "alert" }, updateErrorText(t, error.failure, error.fallback)) :
            statusError ? h("p", { className: "dcpa-error", role: "alert" }, updateErrorText(t, statusError, "updateCheckFailed")) : null,
          error?.source === "status" ? h("p", { className: "dcpa-hint", role: "note" }, t("updateStatusUnavailableHint")) : null,
          busy === "save" ? h("p", { className: "dcpa-hint", role: "status" }, t("updateSaving")) :
            notice ? h("p", { className: "dcpa-success", role: "status" }, t(notice)) : null,
          h("p", { className: "dcpa-hint" }, t("updateLastChecked").replace("{time}", checkedAt)),
          h("p", { className: "dcpa-hint" }, t("updateOfflineHint"))
        )
        )
      );
    }

    /**
     * The plugin's own page under Plugins (bundle page and Plugins tab): only
     * plugin updates. Account and model settings live in their own settings
     * section ({@link CpaSettingsPanel}).
     */
    function PluginUpdatePage({ t }) {
      return h(
        "div",
        { className: "dcpa-wrap", "data-dsh-plugin": MODULE_ID },
        h("p", { className: "dcpa-hint" }, t("updatePageHint")),
        h(PluginUpdatePanel, { t, market: sharedMarket, initiallyOpen: true })
      );
    }
