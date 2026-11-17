// Antigravity quota: host order, hub identity, family merging and Argon pools.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { json, apiOk, harness, scenarioHandler, credentialById } from "../helpers/quota-harness.mjs";

const DAILY = "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const SANDBOX = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary";
const PROD = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary";
const DAILY_MODELS = "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
const HUB_UA = "antigravity/hub/2.23.0 darwin/arm64";

const claudeGroup = (fraction) => ({ displayName: "Claude and GPT models", buckets: [{ bucketId: "3p-5h", window: "5h", remainingFraction: fraction, resetTime: "2026-10-21T10:00:00Z" }] });
const geminiGroup = (fraction, extra = []) => ({ displayName: "Gemini Models", buckets: [{ displayName: "Five Hour Limit Remaining", remainingFraction: fraction, resetTime: "2026-10-21T10:00:00Z" }, ...extra] });
const notFound = () => json(200, { status_code: 404, body: "{}" });
const agUrls = (h) => h.calls.filter((c) => c.body?.auth_index === "4").map((c) => c.body.url);
const rows = (cred) => cred.windows.map((w) => [w.group, w.kind, w.remainingPercent, w.modelPrefixes ?? w.modelIds]);

describe("quota controller", () => {
  it("sends the Antigravity Hub identity on every Antigravity request", async () => {
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (body.url === DAILY) return apiOk({ groups: [claudeGroup(0.5)] });
          if (body.url === DAILY_MODELS) return apiOk({ models: { "gemini-3-flash": { displayName: "Gemini 3 Flash", quotaInfo: { remainingFraction: 0.3 } } } });
          if (body.url.endsWith(":retrieveUserQuotaSummary")) return notFound();
          return undefined;
        },
      }),
    });
    await h.controller.refresh("default");
    const agCalls = h.calls.filter((c) => c.body?.auth_index === "4");
    assert.ok(agCalls.some((c) => c.body.url.endsWith(":loadCodeAssist")), "the tier read is included");
    for (const call of agCalls) assert.equal(call.body.header["User-Agent"], HUB_UA, call.body.url);
    assert.ok(agCalls.some((c) => c.body.url === DAILY_MODELS), "the per-model list was read");
  });

  it("keeps each family from the first summary host that reports it, daily first", async () => {
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (body.url === DAILY) return apiOk({ groups: [claudeGroup(0.75)] });
          if (body.url === SANDBOX) return notFound();
          // Production also reports Claude/GPT (ignored: daily already did) and the Gemini pool.
          if (body.url === PROD) return apiOk({ groups: [claudeGroup(1), geminiGroup(0.6)] });
          return undefined;
        },
      }),
    });
    const snap = await h.controller.refresh("default");
    const ag = credentialById(snap.accounts[0], "ag.json");
    assert.deepEqual(rows(ag), [
      ["Claude and GPT models", "5h", 75, ["claude", "gpt"]],
      ["Gemini Models", "5h", 60, ["gemini", "gemma"]],
    ]);
    assert.deepEqual(agUrls(h).filter((u) => u.includes("v1internal:") && !u.endsWith(":loadCodeAssist")), [DAILY, SANDBOX, PROD]);
  });

  it("never sticks to a fallback host: the next round starts at the daily host again", async () => {
    let dailyUp = false;
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (body.url === DAILY) return dailyUp ? apiOk({ groups: [claudeGroup(0.2), geminiGroup(0.3)] }) : notFound();
          if (body.url === SANDBOX) return notFound();
          if (body.url === PROD) return apiOk({ groups: [claudeGroup(1), geminiGroup(1)] });
          return undefined;
        },
      }),
    });
    let ag = credentialById((await h.controller.refresh("default")).accounts[0], "ag.json");
    assert.deepEqual(ag.windows.map((w) => w.remainingPercent), [100, 100]);
    dailyUp = true;
    h.calls.length = 0;
    ag = credentialById((await h.controller.refresh("default")).accounts[0], "ag.json");
    assert.deepEqual(ag.windows.map((w) => w.remainingPercent), [20, 30]);
    assert.deepEqual(agUrls(h).filter((u) => u.endsWith(":retrieveUserQuotaSummary")), [DAILY]);
  });

  it("narrows an Argon bucket inside the Gemini group to the Argon models", async () => {
    const argon = { bucketId: "gemini-4-argon-weekly", displayName: "Gemini 4 Argon Weekly Limit", remainingFraction: 0.05, resetTime: "2026-10-27T00:00:00Z" };
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => (body.url === DAILY ? apiOk({ groups: [claudeGroup(0.5), geminiGroup(0.8, [argon])] }) : undefined),
      }),
    });
    const ag = credentialById((await h.controller.refresh("default")).accounts[0], "ag.json");
    assert.deepEqual(rows(ag), [
      ["Claude and GPT models", "5h", 50, ["claude", "gpt"]],
      ["Gemini Models", "5h", 80, ["gemini", "gemma"]],
      ["Gemini Models", "7d", 5, ["argon", "gemini-4-argon"]],
    ]);
  });

  it("pools Argon apart from the other Gemini models in the per-model list", async () => {
    const quota = (fraction) => ({ quotaInfo: { remainingFraction: fraction, resetTime: "2026-10-21T09:30:00Z" } });
    const h = harness({
      handler: scenarioHandler({
        apiCall: (body) => {
          if (body.url === DAILY) return apiOk({ groups: [claudeGroup(0.5)] });
          if (body.url.endsWith(":retrieveUserQuotaSummary")) return notFound();
          if (body.url === DAILY_MODELS) {
            return apiOk({ models: {
              "gemini-3-flash": { displayName: "Gemini 3 Flash", ...quota(0.4) },
              "gemini-3.1-pro": { displayName: "Gemini 3.1 Pro", ...quota(0.4) },
              "gemini-4-argon-high": { displayName: "Gemini 4 Argon (High)", ...quota(0.1) },
              "gemini-4-argon-low": { displayName: "Gemini 4 Argon (Low)", ...quota(0.1) },
              "claude-sonnet-5-5": { displayName: "Claude Sonnet 5.5", ...quota(1) },
              chat_20706: { displayName: "Chat", ...quota(1) },
            } });
          }
          return undefined;
        },
      }),
    });
    const ag = credentialById((await h.controller.refresh("default")).accounts[0], "ag.json");
    assert.deepEqual(rows(ag), [
      ["Claude and GPT models", "5h", 50, ["claude", "gpt"]],
      ["Gemini models", "5h", 40, ["gemini", "gemma"]],
      ["Gemini Argon models", "5h", 10, ["argon", "gemini-4-argon"]],
    ], "the summary's Claude/GPT pool wins; chat_* ids are internal");
    assert.equal(agUrls(h).some((u) => u.endsWith(":retrieveUserQuota")), false);
  });
});
