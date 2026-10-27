// agent-tool media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultMediaSettings, agentPolicy, applySessionPolicy, approvalText, chargeSeconds, parseToolArgs, GENERATE_MEDIA_TOOL, toolCommandLine, toolRunId } from "../../lib/media/index.js";

describe("agent tool (generate_media)", () => {
  it("checks arguments and turns them into a literal command line", () => {
    assert.deepEqual(parseToolArgs({ kind: "image", prompt: " a cat ", count: 2, aspect: "16:9", images: ["a.png"] }), { kind: "image", prompt: "a cat", count: 2, aspect: "16:9", images: ["a.png"] });
    assert.equal(toolCommandLine(parseToolArgs({ kind: "image", prompt: "a -- cat", count: 2 })), "-n 2 -- a -- cat");
    const video = parseToolArgs({ kind: "video", prompt: "跳舞", seconds: 8, resolution: "480p", aspect: "9:16", images: ["a.png", "b.png"], frames: "first-last", model: "grok-imagine-video-1.5" });
    assert.equal(toolCommandLine(video), "-m grok-imagine-video-1.5 --aspect 9:16 -s 8 -r 480p --first-last -- 跳舞");
    assert.equal(toolCommandLine(parseToolArgs({ kind: "video", mode: "extend", prompt: "next", seconds: 4, video: "D:\\my clips\\a.mp4" })), '--video "D:\\my clips\\a.mp4" -s 4 -- next');
    assert.equal(toolCommandLine(parseToolArgs({ kind: "video", mode: "edit", prompt: "red", video: "https://e.test/a b.mp4" })), "--url https://e.test/a%20b.mp4 -- red");
    for (const [args, pattern] of [
      [{ kind: "audio", prompt: "x" }, /kind must be/],
      [{ kind: "image", prompt: " " }, /prompt must be/],
      [{ kind: "image", prompt: "x", seconds: 4 }, /seconds is for videos only/],
      [{ kind: "image", prompt: "x", images: ["1", "2", "3", "4", "5"] }, /at most 4 images/],
      [{ kind: "video", prompt: "x", count: 2 }, /count is for images only/],
      [{ kind: "video", prompt: "x", video: "a.mp4" }, /video is for mode edit/],
      [{ kind: "video", prompt: "x", frames: "reference" }, /frames needs images/],
      [{ kind: "video", mode: "edit", prompt: "x", aspect: "16:9" }, /aspect is not used by mode edit/],
      [{ kind: "video", prompt: "x", seconds: 4.5 }, /seconds must be an integer/],
      [{ kind: "video", prompt: "x", extra: 1 }, /unknown argument "extra"/],
      [{ kind: "image", prompt: "x", aspect: "4:5" }, /aspect must be one of/],
    ]) assert.throws(() => parseToolArgs(args), pattern, JSON.stringify(args));
    assert.equal(toolRunId("toolu_01ABC"), "toolu_01ABC");
    assert.equal(toolRunId("call|00=x"), "call_00_x");
    assert.equal(toolRunId("--"), undefined);
  });

  it("tells the model to pass the user's prompt verbatim instead of an expanded description", () => {
    assert.match(GENERATE_MEDIA_TOOL.description, /Pass the user's prompt in their own words/);
    assert.match(GENERATE_MEDIA_TOOL.description, /never expand/i);
    assert.match(GENERATE_MEDIA_TOOL.parameters.properties.prompt.description, /verbatim/);
    assert.match(GENERATE_MEDIA_TOOL.parameters.properties.prompt.description, /Do not rewrite, expand/);
  });

  it("accepts Responses all-fields calls with nulls and legacy neutral defaults", () => {
    const optional = Object.keys(GENERATE_MEDIA_TOOL.parameters.properties).filter((key) => !["kind", "prompt"].includes(key));
    const nullable = Object.fromEntries(optional.map((key) => [key, null]));
    for (const key of optional) {
      assert.ok(GENERATE_MEDIA_TOOL.parameters.properties[key].oneOf.some((branch) => branch.type === "null"), `${key} can be null in a strict schema`);
    }
    const image = parseToolArgs({ ...nullable, kind: "image", prompt: "10秒 竖屏 原样保留" });
    assert.deepEqual(image, { kind: "image", prompt: "10秒 竖屏 原样保留" });
    assert.equal(toolCommandLine(image), "-- 10秒 竖屏 原样保留");
    const expected = { kind: "video", prompt: "北方下大雪", mode: "generate", aspect: "16:9", seconds: 5, resolution: "480p" };
    const canonical = { ...nullable, kind: "video", prompt: "北方下大雪", seconds: 5, resolution: "480p", aspect: "16:9" };
    assert.deepEqual(parseToolArgs(canonical), expected);
    // The exact field pattern from the failed Responses session, before null was offered.
    const legacy = { ...canonical, mode: "generate", model: "", images: [], frames: "first-frame", video: "", count: 1 };
    assert.deepEqual(parseToolArgs(legacy), expected);
    assert.equal(toolCommandLine(parseToolArgs(legacy)), "--aspect 16:9 -s 5 -r 480p -- 北方下大雪");
    assert.deepEqual(parseToolArgs({ ...nullable, kind: "video", prompt: "next", mode: "extend", video: "clip.mp4", seconds: 4 }), { kind: "video", prompt: "next", mode: "extend", video: "clip.mp4", seconds: 4 });
    assert.deepEqual(parseToolArgs({ ...nullable, kind: "video", prompt: "red", mode: "edit", images: [], frames: "first-frame", video: "clip.mp4", count: 1 }), { kind: "video", prompt: "red", mode: "edit", video: "clip.mp4" });
    assert.equal(legacy.model, "", "normalization does not mutate the input");
    for (const [args, pattern] of [
      [{ ...canonical, count: 2 }, /count is for images only/],
      [{ ...canonical, frames: "reference" }, /frames needs images/],
      [{ ...canonical, frames: "typo" }, /frames must be/],
      [{ ...canonical, frames: "first-frame", images: ["a.png", "b.png"] }, /exactly one image/],
      [{ ...canonical, frames: "first-last", images: ["a.png"] }, /exactly two images/],
      [{ ...canonical, resolution: "1080p" }, /resolution must be/],
      [{ ...canonical, seconds: 16 }, /seconds must be 1–15/],
      [{ ...nullable, kind: "video", prompt: "next", mode: "extend", seconds: 11 }, /seconds must be 2–10/],
      [{ ...nullable, kind: "image", prompt: "x", count: 5 }, /count must be 1–4/],
      [{ ...nullable, kind: "image", prompt: null }, /prompt must be/],
    ]) assert.throws(() => parseToolArgs(args), pattern);
  });

  it("counts video seconds per session, starts again on a new limit or auto, and states it in the approval", () => {
    const settings = defaultMediaSettings();
    const entry = {};
    let policy = agentPolicy(settings, entry);
    assert.deepEqual([policy.videoConfirm, policy.imageConfirm, policy.limit, policy.used], ["ask", "auto", 60, 0]);
    chargeSeconds(entry, policy, 6);
    assert.deepEqual(entry, { usedSeconds: 6, budgetKey: "limited:60", lastConfirm: "ask" });
    assert.equal(agentPolicy(settings, entry).used, 6);
    assert.equal(agentPolicy({ ...settings, videoBudget: { mode: "limited", seconds: 30 } }, entry).used, 0, "a new global limit starts again");
    assert.equal(agentPolicy({ ...settings, videoConfirm: "auto" }, entry).used, 0, "ask → auto starts again");
    chargeSeconds(entry, agentPolicy(settings, entry), -10);
    assert.equal(entry.usedSeconds, undefined, "a refund never goes below zero");
    chargeSeconds(entry, agentPolicy(settings, entry), 8);
    applySessionPolicy(entry, { imageConfirm: "ask" }, settings);
    assert.equal(agentPolicy(settings, entry).used, 8, "image confirmation does not reset the count");
    applySessionPolicy(entry, { videoConfirm: "auto" }, settings);
    policy = agentPolicy(settings, entry);
    assert.deepEqual([policy.videoConfirm, policy.used, policy.sources.videoConfirm], ["auto", 0, "session"]);
    chargeSeconds(entry, policy, 5);
    applySessionPolicy(entry, { videoBudget: { mode: "unlimited" } }, settings);
    assert.deepEqual([agentPolicy(settings, entry).limit, agentPolicy(settings, entry).used], [undefined, 0]);
    applySessionPolicy(entry, { videoConfirm: "inherit", videoBudget: "inherit", imageConfirm: "inherit" }, settings);
    assert.deepEqual(agentPolicy(settings, entry).sources, { imageConfirm: "global", videoConfirm: "global", videoBudget: "global" });
    assert.throws(() => applySessionPolicy(entry, { videoConfirm: "maybe" }, settings), (e) => e.code === "invalid-confirm-mode");
    assert.throws(() => applySessionPolicy(entry, { videoBudget: { mode: "limited", seconds: 0 } }, settings), (e) => e.code === "invalid-video-budget");
    assert.throws(() => applySessionPolicy(entry, {}, settings), (e) => e.code === "invalid-request");

    const option = { ref: "default/grok-imagine-video-1.5", modelId: "grok-imagine-video-1.5", accountName: "BCPA" };
    const text = approvalText({ kind: "video", mode: "generate", option, prompt: "a".repeat(100), seconds: 6, resolution: "720p", aspect: "16:9", references: 2 }, { used: 12, limit: 60 });
    assert.match(text.en, /Generate a 6 s video \(720p, 16:9\) with grok-imagine-video-1\.5 \(BCPA\) with 2 attached image\(s\): "a{80}…"\. It is billed and cannot be cancelled once submitted\. Agent videos in this session so far: 12 of 60 s\./);
    assert.match(text.zh, /生成 6 秒视频（720p, 16:9），附 2 张图.*本会话 agent 已用视频 12 \/ 60 秒/);
    assert.match(approvalText({ kind: "video", mode: "extend", option, prompt: "p", seconds: 4, sourceName: "a.mp4", references: 0 }, { used: 0 }).zh, /把视频 a\.mp4延长 4 秒.*0 秒（不限）/);
    assert.match(approvalText({ kind: "image", option, prompt: "p", count: 2, references: 0 }, {}).en, /^Generate 2 image\(s\) with/);
  });
});
