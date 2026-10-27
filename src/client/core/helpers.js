// @client-source Account draft, request and display helpers.
    const REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const PROTOCOL_NAME_KEYS = {
      "openai-completions": "protocolNameCompletions",
      "openai-responses": "protocolNameResponses",
      "anthropic-messages": "protocolNameMessages",
    };
    const PROTOCOLS = Object.keys(PROTOCOL_NAME_KEYS);

    function cloneOverrides(value) {
      const out = {};
      for (const [id, entry] of Object.entries(value ?? {})) {
        out[id] = {
          ...entry,
          ...(Array.isArray(entry.reasoningLevels) ? { reasoningLevels: [...entry.reasoningLevels] } : {}),
        };
      }
      return out;
    }

    function overridesKey(value) {
      return JSON.stringify(value ?? {});
    }

    function formatTokens(n) {
      if (typeof n !== "number" || !Number.isFinite(n)) return "";
      if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
      if (n >= 1000) return `${Math.round(n / 1000)}K`;
      return String(n);
    }

    async function postJson(url, body) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      let payload = null;
      try { payload = await res.json(); } catch {}
      if (!res.ok || payload === null || typeof payload !== "object" || payload.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      return payload;
    }

    function stateDotClass(state) {
      return state === "connected"
        ? "dcpa-dot dcpa-dot-connected"
        : state === "probing"
        ? "dcpa-dot dcpa-dot-probing"
        : state === "error"
        ? "dcpa-dot dcpa-dot-error"
        : "dcpa-dot dcpa-dot-idle";
    }
