// @client-source React bindings, client identity and API paths.
    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    const PACKAGE_NAME = "dsh-cliproxyapi-pro";
    const MODULE_ID = "dsh-cliproxyapi-pro";
    const NS = "dsh-cliproxyapi-pro";
    // Stable id of the account/model page in the Settings left navigation.
    const SETTINGS_SECTION_ID = "cliproxyapi";

    // Document-relative API paths (compatible with <base href="./"> in DSH Web/Desktop)
    const API = {
      status: "api/dsh-cliproxyapi/status",
      refresh: "api/dsh-cliproxyapi/refresh",
      save: "api/dsh-cliproxyapi/save",
      addAccount: "api/dsh-cliproxyapi/accounts/add",
      removeAccount: "api/dsh-cliproxyapi/accounts/remove",
      testAccount: "api/dsh-cliproxyapi/accounts/test",
      updateStatus: "api/dsh-cliproxyapi/updates/status",
      updateCheck: "api/dsh-cliproxyapi/updates/check",
      updateSave: "api/dsh-cliproxyapi/updates/save",
      updateDownload: "api/dsh-cliproxyapi/updates/download",
      quotaStatus: "api/dsh-cliproxyapi/quota/status",
      quotaRefresh: "api/dsh-cliproxyapi/quota/refresh",
      quotaSave: "api/dsh-cliproxyapi/quota/save",
      mediaStatus: "api/dsh-cliproxyapi/media/status",
      mediaSave: "api/dsh-cliproxyapi/media/save",
      mediaDiagnose: "api/dsh-cliproxyapi/media/diagnose",
      mediaSession: "api/dsh-cliproxyapi/media/session",
      mediaSessionSave: "api/dsh-cliproxyapi/media/session/save",
      mediaFile: "api/dsh-cliproxyapi/media/file",
      mediaCommand: "api/dsh-cliproxyapi/media/command",
      mediaConfirm: "api/dsh-cliproxyapi/media/confirm",
    };

    // Public, versioned dshmarket Update API (UPDATE-API-V1.md in dshmarket).
    // Installation is delegated to the market; this plugin never runs a
    // package manager. Paths are document-relative like API above.
    const MARKET_API = {
      capabilities: "dsh-market/api/v1/capabilities",
      updates: "dsh-market/api/v1/updates",
      operations: "dsh-market/api/v1/operations",
      restart: "dsh-market/api/v1/restart",
    };
    const MARKET_SCHEMA = "dsh-market/update-api/v1";

