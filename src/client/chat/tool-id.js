// @client-source Tool-call to media-run identifier mapping.
    // #region generate_media tool rows (tool.call.toolview, key "generate_media")

    /** The run id the host derives from a tool call id (mirrors toolRunId in lib/media/agent-tool.js). */
    function toolRunId(callId) {
      const raw = String(callId ?? "").replace(/[^A-Za-z0-9._:-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 119);
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(raw) ? raw : null;
    }

