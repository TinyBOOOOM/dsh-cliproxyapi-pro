// Shared unchanged update, market and quota fixtures for the client suites.
import { nodes, content, flushClient } from "./client-harness.mjs";
export const update = {
  currentVersion: "1.4.1", latestVersion: "1.5.0", available: true,
  autoCheck: true, autoDownload: false, channel: "stable", region: "auto",
  checking: false, downloading: false, lastCheckedAt: "2026-10-19T12:00:00.000Z",
  effectiveRegion: "cn", error: null, errorCode: null, blockedReason: null,
  downloadedVersion: null, downloadPath: null, upgradeCommand: null,
};
export const reply = (state = update) => new Response(JSON.stringify({ ok: true, update: state }));
export const button = (tree, text) => nodes(tree, (node) => node.type === "button" && content(node) === text)[0];

export const SCHEMA = "dsh-market/update-api/v1";
export const capabilities = (overrides = {}) => ({
  schema: SCHEMA, apiVersion: 1, runtime: "desktop",
  features: { check: true, update: true, progress: true, restart: false },
  restart: { supported: false, managedBy: "desktop-host" }, ...overrides,
});
export const operation = (state, extra = {}) => ({
  schema: SCHEMA, operationId: "boot-update-1", kind: "update", packageName: "dsh-cliproxyapi-pro", state,
  beforeVersion: "1.4.1", installedVersion: state === "succeeded" ? "1.5.0" : "1.4.1",
  progress: { phase: null, done: 0, total: null, percent: null },
  outcome: { refreshRequired: false, restartRequired: state === "succeeded", rollback: { available: false } },
  failure: null, ...extra,
});
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
export const runTimers = async (h) => {
  for (const [id, timer] of [...h.timers]) {
    if (timer.ms === 15000) continue; // the card's own status poll
    h.timers.delete(id);
    await timer.fn();
  }
  await flushClient();
};

export const quotaData = {
  generatedAt: "2026-10-21T06:00:00.000Z", refreshing: false,
  accounts: [
    {
      accountId: "default", displayName: "BCPA", provider: "cli-proxy",
      routes: ["cli-proxy", "cli-proxy-responses", "cli-proxy-messages"], enabled: true,
      keyRef: "CLI_PROXY_MANAGEMENT_KEY", keyConfigured: true, state: "ok", refreshing: false,
      fetchedAt: "2026-10-21T06:00:00.000Z",
      pickerModels: [
        { id: "claude-opus-5-5", route: "cli-proxy-messages" },
        { id: "devin/claude-opus-5-5", route: "cli-proxy-messages" },
        { id: "gpt-6.1-sol", route: "cli-proxy-responses" },
      ],
      credentials: [
        { id: "claude-a.json", label: "a@x.dev", provider: "claude", status: "active", models: ["claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "c5", kind: "5h", label: "", remainingPercent: 40, resetAt: null }, { id: "c7", kind: "7d", label: "", remainingPercent: 70, resetAt: null }] },
        { id: "claude-b.json", label: "b@x.dev", provider: "claude", status: "active", models: ["claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "c5", kind: "5h", label: "", remainingPercent: 90, resetAt: null }] },
        { id: "devin.json", label: "devin", provider: "devin", prefix: "devin", status: "active", models: ["devin/claude-opus-5-5"], quotaState: "unsupported", windows: [] },
        { id: "codex.json", label: "c@x.dev", provider: "codex", status: "disabled", models: ["gpt-6.1-sol"], quotaState: "ok",
          windows: [{ id: "x", kind: "7d", label: "", remainingPercent: 0, resetAt: null }] },
        { id: "ag.json", label: "g@x.dev", provider: "antigravity", status: "active", models: ["gemini-4-argon", "claude-opus-5-5"], quotaState: "ok",
          windows: [{ id: "g1", kind: "5h", label: "Gemini", remainingPercent: 10, resetAt: null, modelPrefixes: ["gemini"] },
            { id: "g2", kind: "5h", label: "Claude", remainingPercent: 55, resetAt: null, modelPrefixes: ["claude", "gpt"] }] },
      ],
      modelIndex: {
        "claude-opus-5-5": ["claude-a.json", "claude-b.json"],
        "devin/claude-opus-5-5": ["devin.json"],
        "gpt-6.1-sol": ["codex.json"],
      },
      modelMatch: { "claude-opus-5-5": "model-list", "devin/claude-opus-5-5": "prefix", "gpt-6.1-sol": "model-list" },
    },
    {
      accountId: "account-2", displayName: "ZZ", provider: "cli-proxy-2",
      routes: ["cli-proxy-2", "cli-proxy-2-responses", "cli-proxy-2-messages"], enabled: true,
      keyRef: "CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2", keyConfigured: false, state: "nokey", refreshing: false,
      pickerModels: [], credentials: [], modelIndex: {},
    },
  ],
};

