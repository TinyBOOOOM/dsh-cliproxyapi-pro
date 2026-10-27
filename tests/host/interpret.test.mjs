// Host interpret tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";


import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { settledRun, mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
  it("asks the session's chat model for parameters the rules missed; explicit options win and the prompt only loses words", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const posts = [];
    const llmCalls = [];
    let answer = () => "{}";
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && (path.startsWith("/v1/videos/") || path.startsWith("/v1/images/"))) {
        const body = JSON.parse(init.body);
        posts.push({ path, body });
        if (path.startsWith("/v1/images/")) return new Response(JSON.stringify({ data: Array.from({ length: body.n }, () => ({ b64_json: png.toString("base64") })) }));
        return new Response(JSON.stringify({ request_id: `req-${posts.length}` }));
      }
      if (/^\/v1\/videos\/req-\d+$/.test(path)) return new Response(JSON.stringify({ status: "pending" }));
      return serve(url, init);
    };
    const llm = {
      async *stream(options) {
        llmCalls.push(options);
        const text = answer(options);
        if (text instanceof Error) throw text;
        yield { type: "block-start", index: 0, blockType: "text" };
        yield { type: "text-delta", index: 0, text: text.slice(0, 5) };
        yield { type: "text-delta", index: 0, text: text.slice(5) };
        yield { type: "finish", reason: "stop" };
      },
    };
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir }, attachments: { readImage: async (ref) => ({ ref, data: png }) }, llm },
    });
    const agent = { id: "s-1", options: { provider: "cli-proxy", model: "gpt-5.5" }, session: { id: "s-1", requestHeader: () => ({ config: { provider: "cli-proxy", model: "claude-opus-4-7" } }) } };
    const signal = new AbortController().signal;
    const run = (name, rawInput, attachments, commandId) => m.commands.find((c) => c.name === name).handler({ agent, rawInput, attachments, signal, commandId });
    const image = { type: "image", attachment: { mediaType: "image/png" } };
    const until = async (predicate) => {
      for (let i = 0; i < 200 && !predicate(); i += 1) await new Promise((r) => setTimeout(r, 5));
    };
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      // Plain language the rules cannot read: length, quality, orientation and how the two images are used.
      answer = () => JSON.stringify({ seconds: "10", resolution: "720P", aspect: "9：16", frames: "first-last", prompt: "从白天慢慢变成黑夜" });
      let result = await run("cpa-video", "-r 480p 做成十秒钟的竖版高清视频，第二张当结尾，从白天慢慢变成黑夜", [image, image], "cmd-i-1");
      assert.equal(result.kind, "success", result.text);
      await until(() => posts.length === 1);
      assert.equal(llmCalls[0].provider, "cli-proxy");
      assert.equal(llmCalls[0].model, "claude-opus-4-7", "the model the session last used");
      assert.equal(llmCalls[0].purpose, "cpa-media-params");
      assert.ok(!/resolution:/.test(llmCalls[0].system), "a field set by an option is not asked for");
      assert.match(llmCalls[0].messages[0].content[0].text, /Attached images: 2/);
      const body = posts[0].body;
      assert.equal(body.duration, 10);
      assert.equal(body.resolution, "480p", "the explicit -r wins");
      assert.equal(body.aspect_ratio, "9:16");
      assert.ok(body.image && body.last_frame && body.reference_images === undefined, "first and last frame");
      assert.equal(body.prompt, "从白天慢慢变成黑夜");
      let row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-i-1");
      assert.equal(row.body.run.mode, "first-last");
      assert.equal(row.body.run.seconds, 10);
      assert.deepEqual(row.body.run.interpreted, { by: "cli-proxy/claude-opus-4-7", items: ["10s", "9:16", "first-last"], prompt: true });

      // A rewritten prompt is not accepted: the original is sent.
      answer = () => JSON.stringify({ seconds: 6, prompt: "A cat surfing on a big wave at sunset" });
      await run("cpa-video", "一只猫在冲浪", [], "cmd-i-2");
      await until(() => posts.length === 2);
      assert.equal(posts[1].body.prompt, "一只猫在冲浪");
      assert.equal(posts[1].body.duration, 6);

      // A failed call never blocks the run.
      answer = () => new Error("model unavailable");
      await run("cpa-video", "一只猫在冲浪", [], "cmd-i-3");
      await until(() => posts.length === 3);
      assert.equal(posts[2].body.prompt, "一只猫在冲浪");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-i-3");
      assert.equal(row.body.run.interpreted.failed, true);

      // Images: count and ratio.
      answer = () => JSON.stringify({ count: 3, aspect: "16:9", prompt: "海边的灯塔" });
      result = await run("cpa-image", "来三张横版的 海边的灯塔", [], "cmd-i-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-i-4");
      assert.equal(row.body.run.status, "done", JSON.stringify(row.body.run));
      assert.equal(posts[3].body.n, 3);
      assert.equal(posts[3].body.aspect_ratio, "16:9");
      assert.equal(posts[3].body.prompt, "海边的灯塔");
      assert.equal(row.body.run.count, 3);

      // Extension length in words.
      writeFileSync(join(workDir, "clip.mp4"), Buffer.concat([Buffer.from([0, 0, 0, 0x10]), Buffer.from("ftypisom"), Buffer.alloc(4)]));
      answer = () => JSON.stringify({ seconds: 5, prompt: "镜头拉远" });
      result = await run("cpa-video-extend", "--video clip.mp4 再加五秒，镜头拉远", [], "cmd-i-5");
      assert.equal(result.kind, "success", result.text);
      await until(() => posts.length === 5);
      assert.equal(posts[4].path, "/v1/videos/extensions");
      assert.equal(posts[4].body.duration, 5);
    } finally {
      m.dispose();
    }
  });
});
