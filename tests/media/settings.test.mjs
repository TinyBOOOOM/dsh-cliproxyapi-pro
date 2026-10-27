// settings media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMediaPatch, defaultMediaSettings, loadMediaSettings, MediaError, mediaModelEnabled, normalizeMediaSettings, saveMediaSettings } from "../../lib/media/index.js";

describe("media settings", () => {
  it("normalizes tolerantly with the agreed defaults", () => {
    const defaults = defaultMediaSettings();
    assert.equal(defaults.agentTool, false);
    assert.equal(defaults.videoConfirm, "ask");
    assert.equal(defaults.imageConfirm, "auto");
    assert.deepEqual(defaults.videoBudget, { mode: "limited", seconds: 60 });
    assert.equal(defaults.defaultVideoSeconds, 6);
    assert.equal(defaults.defaultVideoResolution, "720p");
    assert.equal(defaults.outputDir, "generated");
    const odd = normalizeMediaSettings({
      agentTool: "yes",
      defaultVideoSeconds: 30,
      defaultVideoResolution: "1080p",
      videoBudget: { mode: "limited", seconds: 0 },
      lastSelection: { image: "default/grok-imagine-image", video: "no-slash" },
      accounts: { "bad id": {}, default: { disabledModels: ["a", "a", 3], kindOverrides: { x: "video", y: "audio" } } },
      extra: true,
    });
    assert.equal(odd.agentTool, false);
    assert.equal(odd.defaultVideoSeconds, 6);
    assert.equal(odd.defaultVideoResolution, "720p");
    assert.deepEqual(odd.videoBudget, { mode: "limited", seconds: 60 });
    assert.deepEqual(odd.lastSelection, { image: "default/grok-imagine-image" });
    assert.deepEqual(Object.keys(odd.accounts), ["default"]);
    assert.deepEqual(odd.accounts.default, { disabledModels: ["a"], kindOverrides: { x: "video" } });
    assert.equal("extra" in odd, false);
    assert.deepEqual(normalizeMediaSettings(odd), odd);
  });

  it("starts with generation off, reads a file from before the switch as on, and patches it strictly", () => {
    assert.equal(defaultMediaSettings().enabled, false, "a new profile starts off");
    assert.equal(normalizeMediaSettings({ outputDir: "out" }).enabled, true, "an older file without the field stays on");
    assert.equal(normalizeMediaSettings({ enabled: false }).enabled, false);
    assert.equal(normalizeMediaSettings({ enabled: "no" }).enabled, true);
    assert.equal(applyMediaPatch(defaultMediaSettings(), { enabled: true }).settings.enabled, true);
    assert.equal(applyMediaPatch(normalizeMediaSettings({}), { enabled: false }).settings.enabled, false);
    assert.throws(() => applyMediaPatch(defaultMediaSettings(), { enabled: 1 }), (error) => error.code === "invalid-enabled");
  });

  it("rejects invalid patch values with stable codes and reports kind changes", () => {
    const base = defaultMediaSettings();
    const code = (patch) => {
      try {
        applyMediaPatch(base, patch);
        return "ok";
      } catch (error) {
        assert.ok(error instanceof MediaError);
        return error.code;
      }
    };
    assert.equal(code({ defaultVideoSeconds: 16 }), "invalid-video-seconds");
    assert.equal(code({ defaultVideoSeconds: 0 }), "invalid-video-seconds");
    assert.equal(code({ defaultVideoResolution: "1080p" }), "invalid-video-resolution");
    assert.equal(code({ videoConfirm: "never" }), "invalid-confirm-mode");
    assert.equal(code({ videoBudget: { mode: "limited", seconds: 3601 } }), "invalid-video-budget");
    assert.equal(code({ outputDir: "  " }), "invalid-output-dir");
    assert.equal(code({ agentTool: 1 }), "invalid-agent-tool");
    assert.equal(code({ account: { accountId: "bad id" } }), "invalid-account");
    assert.equal(code({ account: { accountId: "default", kindOverrides: { x: "audio" } } }), "invalid-kind");
    assert.equal(code({ account: { accountId: "default", disabledModels: "x" } }), "invalid-model-list");
    assert.equal(code({ surprise: 1 }), "invalid-request");
    assert.equal(code({ videoBudget: { mode: "unlimited" }, defaultVideoSeconds: 15, defaultVideoResolution: "480p" }), "ok");

    const first = applyMediaPatch(base, { account: { accountId: "default", kindOverrides: { "my-model": "image" } } });
    assert.equal(first.kindsChanged, "default");
    assert.deepEqual(first.settings.accounts.default.kindOverrides, { "my-model": "image" });
    const same = applyMediaPatch(first.settings, { account: { accountId: "default", kindOverrides: { "my-model": "image" } } });
    assert.equal(same.kindsChanged, undefined, "an unchanged override needs no re-sync");
    const removed = applyMediaPatch(first.settings, { account: { accountId: "default", kindOverrides: { "my-model": null } } });
    assert.equal(removed.kindsChanged, "default");
    assert.deepEqual(removed.settings.accounts.default.kindOverrides, {});

    const off = applyMediaPatch(base, { account: { accountId: "default", disabledModels: ["grok-imagine-video"] } });
    assert.equal(off.kindsChanged, undefined);
    assert.equal(mediaModelEnabled(off.settings, "default", "grok-imagine-video"), false);
    assert.equal(mediaModelEnabled(off.settings, "default", "grok-imagine-image"), true, "new models start on");
    assert.equal(mediaModelEnabled(off.settings, "other", "grok-imagine-video"), true);
  });

  it("loads missing files as defaults and keeps a copy of a damaged file on save", () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-media-"));
    const file = join(dir, "media-settings.json");
    assert.deepEqual(loadMediaSettings(file), { settings: defaultMediaSettings() });
    writeFileSync(file, "{ not json");
    const damaged = loadMediaSettings(file);
    assert.equal(damaged.error, "invalid-file");
    assert.deepEqual(damaged.settings, defaultMediaSettings());
    saveMediaSettings(file, { ...defaultMediaSettings(), agentTool: true });
    assert.equal(loadMediaSettings(file).settings.agentTool, true);
    const names = readdirSync(dir);
    assert.ok(names.some((n) => /^media-settings\.corrupt-.+\.json$/.test(n)), names.join(", "));
    assert.equal(readFileSync(join(dir, names.find((n) => n.includes("corrupt"))), "utf8"), "{ not json");
    assert.ok(!names.some((n) => n.endsWith(".tmp")));
  });
});
