// video media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVideoCommand, parseVideoEditCommand, submitVideoEdit, submitVideo, isMp4, mp4Duration, interpretationRequest, parseInterpretation, interpretedPrompt, interpretationLabels, videoImageBudget, VIDEO_GENERATION_BODY_MAX_BYTES, retrieveVideo, downloadVideo, sniffVideoType, createMediaJobStore, normalizeJob, videoState, parseImageCommand } from "../../lib/media/index.js";

describe("video generation", () => {
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(32, 7)]);

  it("parses /cpa-video options and rejects bad ones", () => {
    assert.deepEqual(parseVideoCommand("-m grok --aspect 9:16 -s 8 -r 480P a cat surfing"), { model: "grok", aspect: "9:16", seconds: 8, resolution: "480p", prompt: "a cat surfing" });
    assert.deepEqual(parseVideoCommand("-- -s is part of the prompt"), { prompt: "-s is part of the prompt" });
    assert.throws(() => parseVideoCommand("-s 16 x"), (e) => e.code === "invalid-video-seconds");
    assert.throws(() => parseVideoCommand("-s 0 x"), (e) => e.code === "invalid-video-seconds");
    assert.throws(() => parseVideoCommand("-r 1080p x"), (e) => e.code === "invalid-video-resolution");
    assert.throws(() => parseVideoCommand("--aspect 9:20 x"), (e) => e.code === "invalid-aspect");
    assert.throws(() => parseVideoCommand("-n 2 x"), (e) => e.code === "invalid-option");
    assert.throws(() => parseVideoCommand("-s 4"), (e) => e.code === "missing-prompt");
    // Plain-language options at either end of the prompt; explicit flags win.
    assert.deepEqual(parseVideoCommand("10 秒 480p 这个角色跳社会摇"), { seconds: 10, resolution: "480p", prompt: "这个角色跳社会摇" });
    assert.deepEqual(parseVideoCommand("跳舞，16:9，6 秒"), { seconds: 6, aspect: "16:9", prompt: "跳舞" });
    assert.deepEqual(parseVideoCommand("竖屏 8s 一只猫 720P"), { seconds: 8, aspect: "9:16", resolution: "720p", prompt: "一只猫" });
    assert.deepEqual(parseVideoCommand("-s 4 10秒 跳舞"), { seconds: 4, prompt: "跳舞" });
    assert.deepEqual(parseVideoCommand("3 秒后爆炸"), { prompt: "3 秒后爆炸" }, "only whole words count");
    assert.deepEqual(parseVideoCommand("烟花在 10 秒 内绽放"), { prompt: "烟花在 10 秒 内绽放" }, "only at the start or the end");
    assert.throws(() => parseVideoCommand("20 秒 跳舞"), (e) => e.code === "invalid-video-seconds");
    assert.throws(() => parseVideoCommand("9:20 跳舞"), (e) => e.code === "invalid-aspect");
    assert.deepEqual(parseImageCommand("2张 16:9 一只猫"), { aspect: "16:9", count: 2, prompt: "一只猫" });
    assert.deepEqual(parseImageCommand("一只猫 横屏"), { aspect: "16:9", prompt: "一只猫" });
    assert.throws(() => parseImageCommand("一只猫 5张"), (e) => e.code === "invalid-count");
    // How attached images are used.
    assert.equal(parseVideoCommand("--ref 跳舞").frames, "reference");
    assert.equal(parseVideoCommand("--first-last 跳舞").frames, "first-last");
    assert.equal(parseVideoCommand("首尾帧 从白天到黑夜").frames, "first-last");
    assert.deepEqual(parseVideoCommand("参考图 8秒 三个人跳舞"), { seconds: 8, frames: "reference", prompt: "三个人跳舞" });
    // Edit / extend.
    assert.deepEqual(parseVideoEditCommand("--from cmd-a-1 把衣服换成红色", "edit"), { from: "cmd-a-1", prompt: "把衣服换成红色" });
    assert.deepEqual(parseVideoEditCommand("然后转身离开 4秒", "extend"), { seconds: 4, prompt: "然后转身离开" });
    assert.deepEqual(parseVideoEditCommand("4秒 然后离开", "edit"), { ignored: ["4s"], prompt: "然后离开" }, "an edit has no length: the word is taken out and reported");
    // A path written into the prompt is the source (the 2026-10-22 report: it went to xAI as prompt text).
    assert.deepEqual(
      parseVideoEditCommand("D:\\proj\\generated\\20261022-171306-grok-10-秒-480p-跳舞.mp4   480p  这个背景换成中国街头，正在下雪。", "edit"),
      { video: "D:\\proj\\generated\\20261022-171306-grok-10-秒-480p-跳舞.mp4", ignored: ["480p"], prompt: "这个背景换成中国街头，正在下雪。" }
    );
    assert.deepEqual(parseVideoEditCommand("@D:\\my clips\\a b.mp4 换成雪", "edit"), { video: "D:\\my clips\\a b.mp4", prompt: "换成雪" });
    assert.deepEqual(parseVideoEditCommand("换成雪 D:\\my clips\\a b.mp4", "edit"), { video: "D:\\my clips\\a b.mp4", prompt: "换成雪" });
    assert.deepEqual(parseVideoEditCommand('"C:\\x y\\v.mov" 16:9 换成雪', "edit"), { video: "C:\\x y\\v.mov", ignored: ["16:9"], prompt: "换成雪" });
    assert.deepEqual(parseVideoEditCommand("clip.mp4 换成雪", "edit"), { video: "clip.mp4", prompt: "换成雪" });
    assert.deepEqual(parseVideoEditCommand("-s 4 继续 720p", "extend"), { seconds: 4, ignored: ["720p"], prompt: "继续" });
    assert.deepEqual(parseVideoEditCommand("--from cmd-a-1 a.mp4 x", "edit"), { from: "cmd-a-1", prompt: "a.mp4 x" }, "an explicit source wins");
    assert.deepEqual(parseVideoEditCommand("把 demo 换成雪", "edit"), { prompt: "把 demo 换成雪" });
    assert.throws(() => parseVideoCommand("1080p 跳舞"), (e) => e.code === "invalid-video-resolution");
    assert.throws(() => parseVideoEditCommand("-s 4 x", "edit"), (e) => e.code === "invalid-option");
    assert.throws(() => parseVideoEditCommand("-s 11 x", "extend"), (e) => e.code === "invalid-extend-seconds");
    assert.throws(() => parseVideoEditCommand("--from bad! x", "edit"), (e) => e.code === "invalid-option");
    assert.throws(() => parseVideoEditCommand("--from cmd-a-1", "edit"), (e) => e.code === "missing-prompt");
    assert.deepEqual(parseVideoEditCommand('--video "D:\\my clips\\a.mp4" -m grok 换成红色', "edit"), { video: "D:\\my clips\\a.mp4", model: "grok", prompt: "换成红色" });
    assert.deepEqual(parseVideoEditCommand("--url=https://example.com/a.mp4 -s 3 继续", "extend"), { url: "https://example.com/a.mp4", seconds: 3, prompt: "继续" });
    assert.throws(() => parseVideoEditCommand("--url https://u:p@example.com/a.mp4 x", "edit"), (e) => e.code === "invalid-video-url");
    assert.throws(() => parseVideoEditCommand("--url file:///C:/a.mp4 x", "edit"), (e) => e.code === "invalid-video-url");
    assert.throws(() => parseVideoEditCommand("--from cmd-a-1 --video a.mp4 x", "edit"), (e) => e.code === "one-video-source");
  });

  it("builds the parameter question for the chat model and validates its answer", () => {
    const asked = interpretationRequest({ command: "video", text: "十秒钟竖版", images: 2, fixed: ["resolution"] });
    assert.deepEqual(asked.fields, ["seconds", "aspect", "frames"]);
    assert.match(asked.system, /exactly one JSON object/);
    assert.match(asked.user, /Attached images: 2/);
    assert.deepEqual(interpretationRequest({ command: "video", text: "x" }).fields, ["seconds", "resolution", "aspect"], "no frames without images");
    assert.deepEqual(interpretationRequest({ command: "edit", text: "x" }).fields, []);
    const video = parseInterpretation('Sure:\n```json\n{"seconds":"12","resolution":"720P","aspect":"9：16","frames":"reference","count":3,"prompt":"竖版 跳舞"}\n```', {
      command: "video", text: "十二秒 高清 竖版 跳舞", fields: ["seconds", "resolution", "aspect", "frames"], images: 1,
    });
    assert.deepEqual(video, { values: { seconds: 12, resolution: "720p", aspect: "9:16", frames: "reference" }, prompt: "竖版 跳舞" });
    const bad = parseInterpretation('{"seconds":40,"resolution":"1080p","aspect":"5:4","frames":"first-frame","prompt":"x"}', { command: "video", text: "跳舞跳舞", fields: ["seconds", "resolution", "aspect", "frames"], images: 2 });
    assert.deepEqual(bad.values, {}, "out-of-range values and a first frame for two images are dropped");
    assert.equal(bad.prompt, "跳舞跳舞", "a prompt that is not a deletion of the original is ignored");
    assert.equal(parseInterpretation("I cannot help", { command: "image", text: "x", fields: [] }), undefined);
    assert.deepEqual(parseInterpretation('{"count":2,"seconds":5}', { command: "image", text: "两张猫", fields: ["aspect", "count"] }).values, { count: 2 }, "fields not asked for are dropped");
    assert.equal(parseInterpretation('{"frames":"first-frame"}', { command: "video", text: "x", fields: ["frames"], images: 1 }).values.frames, "first");
    assert.equal(interpretedPrompt("一只猫", "一只猫在一个很大很大的浪上冲浪，夕阳西下，金色的光"), "一只猫在一个很大很大的浪上冲浪，夕阳西下，金色的光", "removing most of the text is not a parameter cleanup");
    assert.equal(interpretedPrompt("从白天变成黑夜", "做成十秒钟的 从白天变成黑夜"), "从白天变成黑夜");
    assert.deepEqual(interpretationLabels({ seconds: 10, resolution: "720p", aspect: "9:16", count: 2, frames: "reference" }), ["10s", "720p", "9:16", "×2", "reference"]);
  });

  it("reads an MP4's length from moov/mvhd and budgets images for the 1 MiB generation body", () => {
    const box = (type, payload) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(8 + payload.length);
      head.write(type, 4, "latin1");
      return Buffer.concat([head, payload]);
    };
    const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0isom"));
    const v0 = Buffer.alloc(100);
    v0.writeUInt32BE(600, 12);
    v0.writeUInt32BE(5220, 16);
    assert.equal(mp4Duration(Buffer.concat([ftyp, box("mdat", Buffer.alloc(40)), box("moov", box("trak", Buffer.alloc(8)), box("mvhd", v0))])), undefined, "mvhd must be inside moov at its level");
    assert.equal(mp4Duration(Buffer.concat([ftyp, box("mdat", Buffer.alloc(40)), box("moov", Buffer.concat([box("trak", Buffer.alloc(8)), box("mvhd", v0)]))])), 8.7);
    const v1 = Buffer.alloc(120);
    v1[0] = 1;
    v1.writeUInt32BE(1000, 20);
    v1.writeBigUInt64BE(12345n, 24);
    assert.equal(mp4Duration(new Uint8Array(Buffer.concat([ftyp, box("moov", box("mvhd", v1))]))), 12.35);
    assert.equal(mp4Duration(Buffer.concat([ftyp, box("mdat", Buffer.alloc(4))])), undefined, "no moov");
    assert.equal(mp4Duration(Buffer.from("not a video at all")), undefined);
    assert.equal(isMp4(ftyp), true);
    assert.equal(isMp4(Buffer.from("RIFF0000WEBP")), false);
    const one = videoImageBudget("move", 1);
    const body = JSON.stringify({
      model: "grok-imagine-video-1.5", prompt: "move", duration: 15, aspect_ratio: "16:9", resolution: "720p",
      image: { url: "data:image/jpeg;base64," + "A".repeat(Math.ceil(one / 3) * 4) },
    });
    assert.ok(one > 700_000 && body.length <= VIDEO_GENERATION_BODY_MAX_BYTES, `one image: ${one}, body ${body.length}`);
    assert.ok(videoImageBudget("move", 14) * 14 < one, "shared between images");
    assert.ok(videoImageBudget("长".repeat(4000), 1) < one, "a long prompt leaves less room");
    assert.equal(videoImageBudget("x", 0), 0);
  });

  it("sends a local video inline, refuses an oversized body locally and names a missing upstream route", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response(JSON.stringify({ request_id: "req-9" })));
    await submitVideoEdit({ fetch: fetchImpl, rootURL: "http://c", mode: "edit", sourceData: new Uint8Array([1, 2, 3]), prompt: "red" });
    assert.deepEqual(JSON.parse(calls[0].init.body).video, { url: "data:video/mp4;base64,AQID" });
    await assert.rejects(
      submitVideo({ fetch: fetchImpl, rootURL: "http://c", model: "grok-imagine-video", prompt: "p", seconds: 4, image: { mediaType: "image/jpeg", data: new Uint8Array(800_000) } }),
      (e) => e.code === "request-too-large"
    );
    assert.equal(calls.length, 1, "an oversized generation body never leaves the plugin");
    await assert.rejects(
      submitVideoEdit({ fetch: async () => new Response(JSON.stringify({ error: { message: "status 405" } }), { status: 405 }), rootURL: "http://c", mode: "extend", sourceUrl: "https://e.test/a.mp4", prompt: "p", seconds: 4 }),
      (e) => e.code === "route-unsupported" && e.detail === "extensions"
    );
    await assert.rejects(
      submitVideo({ fetch: async () => new Response('{"error":"Failed to read request body: length limit exceeded"}', { status: 400 }), rootURL: "http://c", model: "grok-imagine-video", prompt: "p", seconds: 4 }),
      (e) => e.code === "request-too-large"
    );
  });

  it("submits through the native route with the alias resolved and only the given options", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response(JSON.stringify({ request_id: "req-1" })));
    const result = await submitVideo({ fetch: fetchImpl, rootURL: "http://cpa.test", apiKey: "k", model: "sora-2-pro", prompt: "waves", seconds: 6, resolution: "720p" });
    assert.deepEqual(result, { requestId: "req-1" });
    assert.equal(calls[0].url, "http://cpa.test/v1/videos/generations");
    assert.equal(calls[0].init.headers.Authorization, "Bearer k");
    assert.deepEqual(JSON.parse(calls[0].init.body), { model: "grok-imagine-video", prompt: "waves", duration: 6, resolution: "720p" });
    await submitVideo({ fetch: fetchImpl, rootURL: "http://cpa.test", model: "grok-imagine-video-1.5", prompt: "p", seconds: 4, aspect: "1:1", image: { mediaType: "image/png", data: new Uint8Array([1, 2]) } });
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.aspect_ratio, "1:1");
    assert.equal(body.image.url, "data:image/png;base64,AQI=");
    assert.equal(calls[1].init.headers.Authorization, undefined, "no key, no header");
    await assert.rejects(
      submitVideo({ fetch: async () => new Response(JSON.stringify({ error: { message: "Model x is not supported, see https://x" } }), { status: 400 }), rootURL: "http://c", model: "x", prompt: "p", seconds: 4 }),
      (e) => e.code === "upstream-error" && e.detail === "HTTP 400: Model x is not supported, see [url]"
    );
    await assert.rejects(submitVideo({ fetch: async () => new Response("{}"), rootURL: "http://c", model: "x", prompt: "p", seconds: 4 }), (e) => e.code === "invalid-response");
    await submitVideo({ fetch: fetchImpl, rootURL: "http://cpa.test", model: "grok-imagine-video-1.5", prompt: "p", seconds: 4, lastFrame: { mediaType: "image/jpeg", data: new Uint8Array([9]) }, references: [{ mediaType: "image/png", data: new Uint8Array([1]) }] });
    const pinned = JSON.parse(calls[2].init.body);
    assert.equal(pinned.last_frame.url, "data:image/jpeg;base64,CQ==");
    assert.deepEqual(pinned.reference_images, [{ url: "data:image/png;base64,AQ==" }]);
    await submitVideoEdit({ fetch: fetchImpl, rootURL: "http://cpa.test", apiKey: "k", mode: "extend", sourceUrl: "https://vidgen.x.ai/a.mp4", prompt: "next", seconds: 5 });
    assert.equal(calls[3].url, "http://cpa.test/v1/videos/extensions");
    assert.deepEqual(JSON.parse(calls[3].init.body), { model: "grok-imagine-video", prompt: "next", video: { url: "https://vidgen.x.ai/a.mp4" }, duration: 5 });
    await submitVideoEdit({ fetch: fetchImpl, rootURL: "http://cpa.test", mode: "edit", sourceUrl: "https://vidgen.x.ai/a.mp4", prompt: "red", seconds: 5 });
    assert.equal(calls[4].url, "http://cpa.test/v1/videos/edits");
    assert.equal(JSON.parse(calls[4].init.body).duration, undefined, "edits keep the source's length");
  });

  it("maps CPA / xAI states and passes a finished video's HTTPS link only as sourceUrl", async () => {
    const answer = (payload, status = 200) => async () => new Response(JSON.stringify(payload), { status });
    const base = { rootURL: "http://c", requestId: "req-1" };
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "pending" }) }), { state: "queued" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "processing", progress: 41.6 }) }), { state: "running", progress: 42 });
    const done = await retrieveVideo({ ...base, fetch: answer({ status: "done", video: { url: "https://vidgen.x.ai/secret.mp4", duration: 6 } }) });
    assert.deepEqual(done, { state: "done", sourceUrl: "https://vidgen.x.ai/secret.mp4", seconds: 6 });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ video: { url: "https://v/x.mp4" } }) }), { state: "done", sourceUrl: "https://v/x.mp4" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "done", video: { url: "http://v/x.mp4" } }) }), { state: "done" }, "only HTTPS links are kept");
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "expired" }) }), { state: "failed", error: "the video could not be generated" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ error: { message: "moderated, see https://x.ai/p" } }) }), { state: "failed", error: "moderated, see [url]" });
    await assert.rejects(retrieveVideo({ ...base, fetch: answer({ error: { message: "gone" } }, 404) }), (e) => e.code === "upstream-error" && e.status === 404);
    assert.equal(videoState("succeeded"), "done");
    assert.equal(videoState("weird"), undefined);
  });

  it("streams the download into a new file, recognizes the container and enforces the size limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-video-"));
    const calls = [];
    const serve = (bytes, headers = {}) => async (url, init) => (calls.push({ url, auth: init.headers.Authorization }), new Response(bytes, { headers }));
    const first = await downloadVideo({ fetch: serve(MP4), rootURL: "http://c", apiKey: "k", requestId: "req 1", dir, stem: "clip" });
    assert.equal(first, join(dir, "clip.mp4"));
    assert.deepEqual([...readFileSync(first)], [...MP4]);
    assert.equal(calls[0].url, "http://c/openai/v1/videos/req%201/content", "downloaded through CPA, never from the upstream host");
    assert.equal(calls[0].auth, "Bearer k");
    const second = await downloadVideo({ fetch: serve(MP4), rootURL: "http://c", requestId: "r", dir, stem: "clip" });
    assert.equal(second, join(dir, "clip-2.mp4"), "never replaces a file");
    await assert.rejects(downloadVideo({ fetch: serve(Buffer.from("<html>nope</html> padding padding")), rootURL: "http://c", requestId: "r", dir, stem: "bad" }), (e) => e.code === "invalid-video");
    await assert.rejects(downloadVideo({ fetch: serve(MP4), rootURL: "http://c", requestId: "r", dir, stem: "big", maxBytes: 20 }), (e) => e.code === "video-too-large");
    await assert.rejects(downloadVideo({ fetch: serve(MP4, { "content-length": "999999999" }), rootURL: "http://c", requestId: "r", dir, stem: "big2" }), (e) => e.code === "video-too-large");
    assert.deepEqual(readdirSync(dir).sort(), ["clip-2.mp4", "clip.mp4"], "nothing partial is left behind");
    await assert.rejects(
      downloadVideo({ fetch: async () => new Response("not ready", { status: 502 }), rootURL: "http://c", requestId: "r", dir, stem: "x" }),
      (e) => e.code === "upstream-error" && e.detail === "HTTP 502: not ready"
    );
    assert.deepEqual(sniffVideoType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0])), { mediaType: "video/webm", ext: "webm" });
  });

  it("keeps video jobs without keys or URLs, merges updates and drops old finished jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-jobs-"));
    let clock = Date.parse("2026-10-22T08:00:00Z");
    const store = createMediaJobStore(join(dir, "media-jobs.json"), { now: () => clock });
    const job = { id: "req-1", state: "submitted", accountId: "default", modelId: "grok-imagine-video", ref: "default/grok-imagine-video", sessionId: "s-1", commandId: "cmd-a-1", cwd: dir, outputDir: "generated", prompt: "p", seconds: 6, submittedAt: new Date(clock).toISOString(), apiKey: "secret", url: "https://x" };
    const saved = store.put(job);
    assert.equal("apiKey" in saved || "url" in saved, false);
    assert.equal(store.put({ ...saved, state: "done", finishedAt: new Date(clock).toISOString() }).state, "done");
    assert.equal(store.list().length, 1);
    assert.equal(normalizeJob({ ...job, cwd: "relative" }), undefined);
    assert.equal(normalizeJob({ ...job, id: "bad id" }), undefined);
    clock += 8 * 24 * 60 * 60 * 1000;
    assert.equal(store.list().length, 0, "finished jobs are kept 7 days");
    writeFileSync(join(dir, "media-jobs.json"), "{ broken");
    assert.deepEqual(store.list(), []);
    store.put({ ...job, id: "req-2", submittedAt: new Date(clock).toISOString() });
    assert.ok(readdirSync(dir).some((n) => n.startsWith("media-jobs.corrupt-")));
  });
});
