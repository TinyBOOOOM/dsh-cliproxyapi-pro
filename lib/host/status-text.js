// Human-readable account discovery and quota status for slash commands.

import { DEFAULT_REFRESH_INTERVAL_SECONDS, PROTOCOLS } from "./config.js";

export function renderAccountStatus(account) {
  const { config: cfg, credential: keyInfo, status } = account;
  const selectedMode =
    cfg.selectionSaved === false
      ? "Selected Filter: not chosen yet (the first successful probe checks the newest model of each family)"
      : Array.isArray(cfg.selectedModels) && cfg.selectedModels.length > 0
      ? `Selected Filter: ${cfg.selectedModels.length} model(s) checked`
      : "Selected Filter: All models (no selection filter active)";
  const modelListPreview =
    Array.isArray(status.models) && status.models.length > 0
      ? `Active Models in Picker: ${status.models
          .slice(0, 12)
          .map((m) => m.id)
          .join(", ")}${status.models.length > 12 ? ` ... (+${status.models.length - 12} more)` : ""}`
      : undefined;
  const media = (status.allModels ?? []).filter((m) => m.kind === "image" || m.kind === "video");
  const mediaLine =
    media.length > 0
      ? `Media Models (not in the picker): ${media.filter((m) => m.kind === "image").length} image, ${media.filter((m) => m.kind === "video").length} video`
      : undefined;
  const counts = status.protocolCounts ?? {};
  const protocolLine =
    cfg.protocolMode === "fixed"
      ? `Protocol: ${cfg.protocol} (fixed for every model)`
      : `Protocol: native per model (${PROTOCOLS.filter((p) => counts[p])
          .map((p) => `${p}: ${counts[p]}`)
          .join(", ") || "none synced yet"})`;
  const lines = [
    `Account "${cfg.displayName}" [id: ${account.id}] — ${cfg.enabled ? "enabled" : "disabled"}`,
    `CLIProxyAPI Status: ${status.state}`,
    `Provider Routes: ${(status.state === "connected" && status.routes ? status.routes : [cfg.provider]).join(", ")}`,
    protocolLine,
    `Configured Base URL: ${cfg.baseURL || "(auto-discover / inherited)"}`,
    ...(status.endpoint ? [`Active Endpoint: ${status.endpoint}`] : []),
    `API Key Reference: ${keyInfo.ref} (${keyInfo.configured ? "configured" : "not set"})`,
    selectedMode,
    `Synchronized Models: ${status.modelCount}${
      status.totalDiscovered ? ` (of ${status.totalDiscovered} discovered)` : ""
    }`,
    ...(modelListPreview ? [modelListPreview] : []),
    ...(mediaLine ? [mediaLine] : []),
    ...(status.refreshedAt ? [`Last Refreshed: ${status.refreshedAt}`] : []),
    ...(status.error ? [`Error: ${status.error}`] : []),
  ];
  return lines.join("\n");
}

/** One line per account: management key, quota state and what the picker models map to. Never includes keys. */
export function renderQuotaText(snapshot, onlyAccountId) {
  const accounts = (snapshot?.accounts ?? []).filter((a) => onlyAccountId === undefined || a.accountId === onlyAccountId);
  if (accounts.length === 0) return "";
  const lines = ["Quota (CPA management API):"];
  for (const a of accounts) {
    if (!a.keyConfigured) {
      lines.push(`- ${a.displayName} [${a.accountId}]: no management key (${a.keyRef})`);
      continue;
    }
    const creds = Array.isArray(a.credentials) ? a.credentials : [];
    const state = a.state + (a.errorCode ? ` (${a.errorCode}${a.errorStatus ? ` ${a.errorStatus}` : ""})` : "") + (a.refreshing ? ", refreshing" : "");
    lines.push(`- ${a.displayName} [${a.accountId}]: ${state}; ${creds.length} credential(s)${a.fetchedAt ? `; fetched ${a.fetchedAt}` : ""}; routes ${(a.routes ?? []).join(", ") || "none"}`);
    for (const m of a.pickerModels ?? []) {
      const ids = a.modelIndex?.[m.id] ?? [];
      const names = ids.map((id) => {
        const c = creds.find((x) => x.id === id);
        if (!c) return id;
        const pct = (c.windows ?? []).map((w) => w.remainingPercent).filter((v) => typeof v === "number");
        return `${c.provider}:${c.label || c.id}${pct.length ? ` ${Math.round(Math.min(...pct))}%` : ""}${c.status === "active" ? "" : ` (${c.status})`}`;
      });
      lines.push(`    ${m.route}/${m.id} -> ${names.length ? names.join(", ") : "no credential"} [${a.modelMatch?.[m.id] ?? "none"}]`);
    }
  }
  return lines.join("\n");
}

export function renderStatusText(payload, onlyAccountId) {
  const accounts = payload.accounts ?? [];
  if (accounts.length === 0) {
    return "No CLIProxyAPI account is configured. Add one in Settings → CLIProxyAPI.";
  }
  const shown =
    onlyAccountId === undefined ? accounts : accounts.filter((a) => a.id === onlyAccountId);
  const enabled = accounts.filter((a) => a.config.enabled).length;
  const header = `CLIProxyAPI accounts: ${accounts.length} (${enabled} enabled); auto refresh every ${payload.global?.refreshIntervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS}s`;
  return [header, ...shown.map(renderAccountStatus)].join("\n\n");
}
