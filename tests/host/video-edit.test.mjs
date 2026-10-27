// Host video-edit tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";


import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json, fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { settledRun, mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
  it("/cpa-video sends references or pinned frames, and /cpa-video-edit / -extend reuse xAI's short-lived link", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const posts = [];
    let next = 0;
    const durations = {};
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (init?.method === "POST" && path.startsWith("/v1/videos/")) {
          const body = JSON.parse(init.body);
          const id = `req-${++next}`;
          posts.push({ path, body, id });
          durations[id] = path.endsWith("/extensions") ? 6 + body.duration : 6;
          return new Response(JSON.stringify({ request_id: id }));
        }
        const poll = /^\/v1\/videos\/(req-\d+)$/.exec(path);
        if (poll) return new Response(JSON.stringify({ status: "done", video: { url: `https://vidgen.x.ai/${poll[1]}.mp4`, duration: durations[poll[1]] } }));
        if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4);
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: new Uint8Array([1, 2, 3]) }) },
      },
    });
    const signal = new AbortController().signal;
    const image = { type: "image", attachment: { mediaType: "image/png" } };
    const run = (name, rawInput, attachments, commandId, sessionId = "s-1") =>
      m.commands.find((c) => c.name === name).handler({ agent: { id: sessionId }, rawInput, attachments, signal, commandId });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await run("cpa-video", "三个人跳舞", [image, image, image], "cmd-m-1");
      assert.match(result.text, /\(reference\)/);
      let row = await settledRun(m, "s-1", "cmd-m-1");
      assert.equal(row.body.run.mode, "reference");
      assert.equal(posts[0].body.reference_images.length, 3);
      assert.equal(posts[0].body.image, undefined);
      assert.deepEqual(row.body.actions.edit, true, "a 6 s video can be edited");
      assert.equal(row.body.actions.extend, true);
      assert.ok(!JSON.stringify(row.body).includes("vidgen"), "the page never sees xAI's link");

      await run("cpa-video", "首尾帧 从白天到黑夜", [image, image], "cmd-m-2");
      await settledRun(m, "s-1", "cmd-m-2");
      assert.ok(posts[1].body.image && posts[1].body.last_frame && posts[1].body.reference_images === undefined);
      await run("cpa-video", "--last 落在这里", [image], "cmd-m-3");
      await settledRun(m, "s-1", "cmd-m-3");
      assert.ok(posts[2].body.last_frame && posts[2].body.image === undefined);
      result = await run("cpa-video", "--first-last x", [image], "cmd-m-x");
      assert.match(result.text, /need attached images/);

      // Extend the newest video by 4 s, then edit the first one by id.
      result = await run("cpa-video-extend", "4秒 然后转身离开", [], "cmd-m-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-m-4");
      assert.deepEqual(posts[3], { path: "/v1/videos/extensions", id: "req-4", body: { model: "grok-imagine-video", prompt: "然后转身离开", video: { url: "https://vidgen.x.ai/req-3.mp4" }, duration: 4 } });
      assert.equal(row.body.run.mode, "extend");
      assert.equal(row.body.run.sourceCommandId, "cmd-m-3");
      assert.equal(row.body.run.status, "done");
      assert.equal(row.body.actions.edit, false, "the 10 s result is too long to edit");
      assert.equal(row.body.actions.extend, true);

      await run("cpa-video-edit", "--from cmd-m-1 把衣服换成红色", [], "cmd-m-5");
      await settledRun(m, "s-1", "cmd-m-5");
      assert.deepEqual(posts[4].body, { model: "grok-imagine-video", prompt: "把衣服换成红色", video: { url: "https://vidgen.x.ai/req-1.mp4" } });
      result = await run("cpa-video-edit", "--from cmd-m-4 换背景", [], "cmd-m-6");
      assert.match(result.text, /at most 8\.7 seconds/);
      result = await run("cpa-video-extend", "继续", [], "cmd-m-7", "s-2");
      assert.match(result.text, /no source video/);
      result = await run("cpa-video-extend", "-s 12 继续", [], "cmd-m-8");
      assert.match(result.text, /adds 2 to 10 seconds/);

      for (const file of ["media-sessions.json", "media-jobs.json"]) {
        assert.ok(!readFileSync(join(m.stateDir, file), "utf8").includes("vidgen"), `${file} keeps no xAI link`);
      }
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video-edit / -extend take any MP4: attached, --video, --url, or a generated file after its link is gone", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const box = (type, payload) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(8 + payload.length);
      head.write(type, 4, "latin1");
      return Buffer.concat([head, payload]);
    };
    const mp4Of = (seconds, fill = 32) => {
      const mvhd = Buffer.alloc(100);
      mvhd.writeUInt32BE(1000, 12);
      mvhd.writeUInt32BE(Math.round(seconds * 1000), 16);
      return Buffer.concat([box("ftyp", Buffer.from("isom\0\0\0\0isom")), box("mdat", Buffer.alloc(fill, 7)), box("moov", box("mvhd", mvhd))]);
    };
    writeFileSync(join(workDir, "clip.mp4"), mp4Of(5));
    writeFileSync(join(workDir, "long.mp4"), mp4Of(12));
    writeFileSync(join(workDir, "note.txt"), "not a video");
    const stored = join(workDir, "stored.mp4");
    writeFileSync(stored, mp4Of(4));
    const posts = [];
    let next = 0;
    let extensions = 405;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && path.startsWith("/v1/videos/")) {
        if (path.endsWith("/extensions") && extensions === 405) {
          posts.push({ path, refused: true });
          return new Response(JSON.stringify({ error: { message: "status 405", type: "invalid_request_error" } }), { status: 405 });
        }
        const id = `req-${++next}`;
        posts.push({ path, body: JSON.parse(init.body), id });
        return new Response(JSON.stringify({ request_id: id }));
      }
      if (/^\/v1\/videos\/req-\d+$/.test(path)) return new Response(JSON.stringify({ status: "done", video: { url: "https://vidgen.x.ai/x.mp4", duration: 5 } }));
      if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4Of(5));
      return serve(url, init);
    };
    const streamOnly = { attachmentId: "sha256:" + "a".repeat(64), name: "phone clip.mp4", bytes: mp4Of(3).length };
    const attachments = {
      readImage: async (ref) => ({ ref, data: new Uint8Array([1, 2, 3]) }),
      fileHostPath: (ref) => (ref.name === "stored.mp4" ? stored : undefined),
      readFileStream: async function* () {
        yield new Uint8Array(mp4Of(3));
      },
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir }, attachments } });
    const signal = new AbortController().signal;
    const run = (name, rawInput, files, commandId) =>
      m.commands.find((c) => c.name === name).handler({ agent: { id: "s-1" }, rawInput, attachments: files, signal, commandId });
    const dataOf = (post) => Buffer.from(post.body.video.url.replace(/^data:video\/mp4;base64,/, ""), "base64");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await run("cpa-video-edit", "--video clip.mp4 换成红色", [], "cmd-e-1");
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /uploading clip\.mp4/);
      let row = await settledRun(m, "s-1", "cmd-e-1");
      assert.equal(posts[0].path, "/v1/videos/edits");
      assert.deepEqual(dataOf(posts[0]), mp4Of(5), "the local file goes inline as a data URI");
      assert.equal(row.body.run.sourceName, "clip.mp4");
      assert.equal(row.body.run.seconds, 5);

      result = await run("cpa-video-edit", "加一只猫", [{ type: "file", attachment: { attachmentId: "sha256:" + "b".repeat(64), name: "stored.mp4", bytes: 10 } }], "cmd-e-2");
      assert.equal(result.kind, "success", result.text);
      await settledRun(m, "s-1", "cmd-e-2");
      assert.deepEqual(dataOf(posts[1]), mp4Of(4), "an attachment is read from its host path");
      result = await run("cpa-video-edit", "加一只狗", [{ type: "file", attachment: streamOnly }], "cmd-e-3");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-3");
      assert.deepEqual(dataOf(posts[2]), mp4Of(3), "or streamed from the attachment store");
      assert.equal(row.body.run.sourceName, "phone clip.mp4");

      result = await run("cpa-video-edit", "--url https://example.com/v/a.mp4 变成夜晚", [], "cmd-e-4");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-4");
      assert.deepEqual(posts[3].body, { model: "grok-imagine-video", prompt: "变成夜晚", video: { url: "https://example.com/v/a.mp4" } });
      assert.equal(row.body.run.sourceName, "example.com");
      assert.equal(row.body.run.sourceKind, "url");

      // A path typed straight into the prompt is the source, not prompt text; 480p is taken out.
      result = await run("cpa-video-edit", `${join(workDir, "clip.mp4")}   480p  这个背景换成中国街头`, [], "cmd-e-path");
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /Ignored 480p/);
      row = await settledRun(m, "s-1", "cmd-e-path");
      assert.equal(posts.at(-1).body.prompt, "这个背景换成中国街头");
      assert.deepEqual(dataOf(posts.at(-1)), mp4Of(5));
      assert.equal(row.body.run.prompt, "这个背景换成中国街头");
      assert.deepEqual(row.body.run.ignored, ["480p"]);
      assert.equal(row.body.run.sourceName, "clip.mp4");
      assert.equal(row.body.run.sourceKind, "upload");

      const before = posts.length;
      for (const [line, files, pattern] of [
        ["--video long.mp4 x", [], /at most 8\.7 seconds \(this one has 12 s\)/],
        ["--video note.txt x", [], /must be an MP4/],
        ["--video missing.mp4 x", [], /no video file at missing\.mp4/],
        ["--video clip.mp4 --url https://example.com/a.mp4 x", [], /use one source video/],
        ["--video clip.mp4 x", [{ type: "file", attachment: streamOnly }], /use one source video/],
        ["x", [{ type: "image", attachment: { mediaType: "image/png" } }], /attach one MP4 video/],
        ["x", [{ type: "file", attachment: { ...streamOnly, bytes: 15 * 1024 * 1024 } }], /15\.0 MiB; videos up to 14 MiB/],
        ["--url ftp://example.com/a.mp4 x", [], /public http\(s\) address/],
      ]) {
        result = await run("cpa-video-edit", line, files);
        assert.equal(result.kind, "error", line);
        assert.match(result.text, pattern, line);
      }
      assert.equal(posts.length, before, "refused sources never reach CPA");

      // An upstream without the extension route: the run fails with a clear
      // message, and the next extension is refused without another request.
      result = await run("cpa-video-extend", "--video clip.mp4 -s 4 继续", [], "cmd-e-5");
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-e-5");
      assert.equal(row.body.run.errorCode, "route-unsupported");
      assert.match(row.body.run.error, /does not offer video extension \(HTTP 405\)/);
      const refusedPosts = posts.length;
      result = await run("cpa-video-extend", "--video clip.mp4 继续", []);
      assert.match(result.text, /does not offer video extension/);
      assert.equal(posts.length, refusedPosts);
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-e-1");
      assert.equal(row.body.actions.extend, false, "the row hides Extend for that account");
      assert.equal(row.body.actions.edit, true);
    } finally {
      m.dispose();
    }

    // After a reload xAI's link is forgotten: --from sends the generated file itself.
    extensions = 200;
    m = mountPlugin({ state, fetchImpl, dir: m.dir, extraServices: { workingDirectory: { ensure: async () => workDir }, attachments } });
    try {
      const row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-e-1");
      assert.equal(row.body.actions.edit, true, "the downloaded file can still be edited");
      assert.equal(row.body.actions.expiresAt, undefined, "no link is remembered");
      const result = await run("cpa-video-extend", "--from cmd-e-1 -s 3 继续", [], "cmd-e-6");
      assert.equal(result.kind, "success", result.text);
      await settledRun(m, "s-1", "cmd-e-6");
      const post = posts.at(-1);
      assert.equal(post.path, "/v1/videos/extensions");
      assert.equal(post.body.duration, 3);
      assert.deepEqual(dataOf(post), mp4Of(5), "the file CPA downloaded for cmd-e-1");
    } finally {
      m.dispose();
    }
  });
});
