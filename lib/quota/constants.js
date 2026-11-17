// Quota timing, normalization labels, and upstream protocol constants.
export const QUOTA_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_QUOTA_TIMEOUT_MS = 15_000;
export const DEFAULT_QUOTA_CONCURRENCY = 4;
export const MAX_QUOTA_RESPONSE_BYTES = 4 * 1024 * 1024;

export const MANAGEMENT_KEY_REF = "CLI_PROXY_MANAGEMENT_KEY";
export const STATUS_MESSAGE_MAX = 160;

export const UPSTREAM = {
  codexUsage: "https://chatgpt.com/backend-api/wham/usage",
  claudeProfile: "https://api.anthropic.com/api/oauth/profile",
  claudeUsage: "https://api.anthropic.com/api/oauth/usage",
  googleLoad: "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  googleQuota: "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  // Same order as CPA's management center: CPA serves Antigravity through the
  // daily host, whose numbers are the ones that move; the production host's
  // Gemini group can read 100% regardless of use, so it comes last. A summary
  // may carry only the "Claude and GPT models" group (5h and weekly buckets);
  // Gemini then comes from the per-model list.
  antigravityQuota: [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  ],
  antigravityModels: [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  ],
  kimiUsage: "https://api.kimi.com/coding/v1/usages",
  // Kimi International (kimi.ai) accounts use the same API on another host.
  kimiAiUsage: "https://api.kimi.ai/coding/v1/usages",
  // Meta Muse Code subscription usage (needs the credential's dca_token).
  metaUsage: "https://api.meta.ai/muse-code/key",
  xaiBillingWeekly: "https://cli-chat-proxy.grok.com/v1/billing?format=credits",
  xaiBillingMonthly: "https://cli-chat-proxy.grok.com/v1/billing",
  // Connect RPC (JSON); the same call CPA's management center makes for Devin.
  devinStatus: "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus",
};

// Client identity sent by CPA's management center; `$TOKEN$` is substituted
// by CPA's api-call with the credential's own session token.
export const DEVIN_METADATA = {
  ideName: "chisel",
  ideVersion: "3000.10.21",
  apiKey: "$TOKEN$",
  locale: "en",
  os: "darwin",
  extensionVersion: "3000.10.21",
  clientName: "chisel",
};

export const AG_META = { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
export const GEMINI_META = { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
// The Antigravity Hub identity CPA itself sends (internal/misc/antigravity_version.go,
// mirrored by its management center): Cloud Code omits groups and newer models
// for clients below 2.23.0, so every Antigravity quota request uses it.
export const AG_UA = "antigravity/hub/2.23.0 darwin/arm64";
export const CODEX_UA = "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal";

export const GROUP_CLAUDE_GPT = "Claude and GPT models";
export const GROUP_GEMINI = "Gemini models";
// Gemini Argon models: some plans (e.g. Google AI Pro) give them a quota of
// their own, separate from the other Gemini models.
export const GROUP_ARGON = "Gemini Argon models";
export const GROUP_OTHER = "Other models";

export const W5H = 5 * 60 * 60;
export const W1D = 24 * 60 * 60;
export const W7D = 7 * W1D;
export const KIND_RANK = { "5h": 0, "7d": 1, "30d": 2, "1d": 3, other: 4 };

export const PLAN_LABELS = {
  free: "Free",
  "free-tier": "Free",
  "plan-free": "Free",
  basic: "Basic",
  standard: "Standard",
  team: "Team",
  "plan-team": "Team",
  pro: "Pro",
  "plan-pro": "Pro",
  "g1-pro-tier": "Pro",
  max: "Max",
  "plan-max": "Max",
  plus: "Plus",
  ultra: "Ultra",
  "g1-ultra-tier": "Ultra",
  "ultra-lite": "Ultra Lite",
  "g1-ultra-lite-tier": "Ultra Lite",
  paid: "Paid",
  enterprise: "Enterprise",
};
