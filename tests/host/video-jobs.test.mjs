// Host video-jobs tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { videoImageBudget } from "../../lib/media/index.js";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json, fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { settledRun, mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
  it("/cpa-video submits, follows and saves a video, and serves it with byte ranges", async () => {
    const { Writable } = await import("node:stream");
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(100, 3)]);
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const videoCalls = [];
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.includes("/videos")) videoCalls.push({ path, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
        if (path === "/v1/videos/generations") return new Response(JSON.stringify({ request_id: "req-1" }));
        if (path === "/v1/videos/req-1") return new Response(JSON.stringify({ status: "done", video: { url: "https://vidgen.x.ai/req-1.mp4", duration: 6 } }));
        if (path === "/openai/v1/videos/req-1/content") return new Response(mp4, { headers: { "content-type": "video/mp4" } });
        return serve(url, init);
      },
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      const video = m.commands.find((c) => c.name === "cpa-video");
      const signal = new AbortController().signal;
      const result = await video.handler({ agent: { id: "s-1" }, rawInput: "waves at sunset", attachments: [], signal, commandId: "cmd-v-1" });
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /^Submitting a 6 s 720p video \(text\) to grok-imagine-video-1\.5 .*cannot be cancelled/);
      assert.deepEqual(m.emitted[0], ["api-session/status", "s-1", true]);
      const row = await settledRun(m, "s-1", "cmd-v-1");
      assert.equal(row.body.run.status, "done", JSON.stringify(row.body.run));
      assert.equal(row.body.run.kind, "video");
      assert.equal(row.body.run.seconds, 6);
      assert.equal(row.body.run.resolution, "720p");
      assert.equal(row.body.run.videoId, "req-1");
      assert.equal(row.body.files.length, 1);
      assert.equal(row.body.files[0].kind, "video");
      assert.match(row.body.files[0].name, /\.mp4$/);
      assert.deepEqual(videoCalls.map((c) => `${c.method} ${c.path}`), ["POST /v1/videos/generations", "GET /v1/videos/req-1", "GET /openai/v1/videos/req-1/content"]);
      assert.deepEqual(videoCalls[0].body, { model: "grok-imagine-video-1.5", prompt: "waves at sunset", duration: 6, resolution: "720p" });
      assert.ok(!readFileSync(join(m.stateDir, "media-sessions.json"), "utf8").includes("vidgen"), "no upstream URL is stored");
      const jobs = JSON.parse(readFileSync(join(m.stateDir, "media-jobs.json"), "utf8")).jobs;
      assert.equal(jobs[0].state, "done");
      assert.equal(JSON.stringify(jobs).includes("key-a"), false);
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);

      // Byte ranges for <video>.
      const fileId = row.body.files[0].id;
      const ranged = await new Promise((resolve) => {
        const chunks = [];
        const res = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } });
        res.writeHead = (code, headers) => (res.sent = { code, headers });
        res.on("finish", () => resolve({ ...res.sent, body: Buffer.concat(chunks) }));
        const req = { method: "GET", url: `/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=${fileId}`, headers: { host: "127.0.0.1:1", range: "bytes=4-11" } };
        m.routes.get("/api/dsh-cliproxyapi/media/file")(req, res);
      });
      assert.equal(ranged.code, 206);
      assert.equal(ranged.headers["content-range"], `bytes 4-11/${mp4.length}`);
      assert.equal(ranged.body.toString(), "ftypisom");

      const status = await m.commands.find((c) => c.name === "cpa-video-status").handler({ agent: { id: "s-1" } });
      assert.match(status.text, /done\s+grok-imagine-video-1\.5, 6 s {2}waves at sunset {2}\(req-1\)/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-video reports refusals and failed videos, and checks its options and first frame", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    let mode = "refuse";
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/videos/generations") {
          if (mode === "refuse") return new Response(JSON.stringify({ error: { message: "Model is not supported" } }), { status: 400 });
          assert.match(JSON.parse(init.body).image.url, /^data:image\/png;base64,/);
          return new Response(JSON.stringify({ request_id: "req-9" }));
        }
        if (path === "/v1/videos/req-9") return new Response(JSON.stringify({ status: "failed", error: { message: "content moderated" } }));
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: new Uint8Array([1]) }) },
      },
    });
    const signal = new AbortController().signal;
    const video = () => m.commands.find((c) => c.name === "cpa-video");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      await video().handler({ agent: { id: "s-1" }, rawInput: "-s 4 -r 480p x", attachments: [], signal, commandId: "cmd-v-2" });
      let row = await settledRun(m, "s-1", "cmd-v-2");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "upstream-error");
      assert.match(row.body.run.error, /CPA rejected the request \(HTTP 400: Model is not supported\)/);
      assert.equal(existsSync(join(m.stateDir, "media-jobs.json")), false, "nothing was submitted, so no job");

      mode = "accept";
      const image = { type: "image", attachment: { mediaType: "image/png" } };
      await video().handler({ agent: { id: "s-1" }, rawInput: "--aspect 9:16 dance", attachments: [image], signal, commandId: "cmd-v-3" });
      row = await settledRun(m, "s-1", "cmd-v-3");
      assert.equal(row.body.run.errorCode, "video-failed");
      assert.match(row.body.run.error, /content moderated/);
      assert.equal(row.body.run.references, 1);
      assert.equal(JSON.parse(readFileSync(join(m.stateDir, "media-jobs.json"), "utf8")).jobs[0].state, "failed");

      let result = await video().handler({ agent: { id: "s-1" }, rawInput: "x", attachments: Array.from({ length: 15 }, () => image), signal });
      assert.match(result.text, /attach at most 14 images/);
      result = await video().handler({ agent: { id: "s-1" }, rawInput: "-s 30 x", attachments: [], signal });
      assert.match(result.text, /seconds must be a whole number from 1 to 15/);
      result = await video().handler({ agent: { id: "s-1" }, rawInput: "-m grok-imagine-image x", attachments: [], signal });
      assert.match(result.text, /no enabled video model matches/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-video jobs survive a reload: a running job resumes, an old one expires", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(8)]);
    let pending = true;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/videos/generations") return new Response(JSON.stringify({ request_id: "req-5" }));
      if (path === "/v1/videos/req-5") return new Response(JSON.stringify(pending ? { status: "pending" } : { status: "done", video: { url: "https://v/x" } }));
      if (path === "/openai/v1/videos/req-5/content") return new Response(mp4);
      return serve(url, init);
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    const dir = m.dir;
    const signal = new AbortController().signal;
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      await m.commands.find((c) => c.name === "cpa-video").handler({ agent: { id: "s-1" }, rawInput: "rain", attachments: [], signal, commandId: "cmd-v-5" });
      let row;
      for (let i = 0; i < 100; i += 1) {
        row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-v-5");
        if (row.body.run?.phase === "queued" && row.body.run?.videoId === "req-5") break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(row.body.run.status, "running");
      assert.equal(row.body.run.phase, "queued");
    } finally {
      m.dispose();
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
    let jobs = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-jobs.json"), "utf8")).jobs;
    assert.equal(jobs[0].state, "submitted", "a reload pauses the job, it does not end it");
    const sessions = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-sessions.json"), "utf8"));
    assert.equal(sessions.sessions["s-1"].runs[0].status, "running", "no error is recorded for a paused job");

    // An old job next to it: past CPA's 3-hour binding.
    jobs.push({ ...jobs[0], id: "req-old", commandId: "cmd-v-6", submittedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() });
    sessions.sessions["s-1"].runs.unshift({ ...sessions.sessions["s-1"].runs[0], commandId: "cmd-v-6" });
    pending = false;
    m = mountPlugin({ state, fetchImpl, dir, files: { "media-jobs.json": { version: 1, jobs }, "media-sessions.json": sessions }, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    try {
      const resumed = await settledRun(m, "s-1", "cmd-v-5");
      assert.equal(resumed.body.run.status, "done", JSON.stringify(resumed.body.run));
      assert.equal(resumed.body.files[0].kind, "video");
      const old = await settledRun(m, "s-1", "cmd-v-6");
      assert.equal(old.body.run.errorCode, "expired");
      jobs = JSON.parse(readFileSync(join(dir, ".dsh-cliproxyapi", "media-jobs.json"), "utf8")).jobs;
      assert.deepEqual(Object.fromEntries(jobs.map((j) => [j.id, j.state])), { "req-5": "done", "req-old": "expired" });
    } finally {
      m.dispose();
    }
  });
  it("/cpa-video shrinks an oversized first frame, or asks DSH for a smaller one, before sending it", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const bodies = [];
    const bigJpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_500_000)]));
    const smallJpeg = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2000)]));
    const requests = [];
    let withRequestImages = true;
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/videos/generations") {
          bodies.push(init.body);
          return new Response(JSON.stringify({ error: { message: "stop here" } }), { status: 400 });
        }
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: {
          readImage: async (ref) => ({ ref: { mediaType: "image/jpeg", width: 3000, height: 2000 }, data: bigJpeg }),
          get readImageRequest() {
            return withRequestImages ? async (ref, target) => (requests.push(target), { data: smallJpeg, mediaType: "image/jpeg" }) : undefined;
          },
        },
      },
    });
    const signal = new AbortController().signal;
    const image = { type: "image", attachment: { mediaType: "image/jpeg" } };
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      const video = m.commands.find((c) => c.name === "cpa-video");
      const result = await video.handler({ agent: { id: "s-1" }, rawInput: "move", attachments: [image], signal, commandId: "cmd-v-8" });
      assert.equal(result.kind, "success", result.text);
      assert.deepEqual(requests, [{ width: 1280, height: 853, maxBytes: videoImageBudget("move", 1) }]);
      await settledRun(m, "s-1", "cmd-v-8");
      assert.ok(bodies[0].length <= 1024 * 1024, `the body stays within the measured 1 MiB (${bodies[0].length})`);
      assert.match(JSON.parse(bodies[0]).image.url, /^data:image\/jpeg;base64,/);
      withRequestImages = false;
      const refused = await video.handler({ agent: { id: "s-1" }, rawInput: "move", attachments: [image], signal });
      assert.equal(refused.kind, "error");
      assert.match(refused.text, /could not be made smaller than \d+ KB/);
    } finally {
      m.dispose();
    }
  });
});
