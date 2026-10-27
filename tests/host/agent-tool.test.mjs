// Host agent-tool tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCpaRoot,
  discoveryCandidates,
  parseCatalog,
  filterModels,
  sortModelsNewestFirst,
  buildPiAiRoutes,
  resolveConfig,
  applyModelOverride,
  nativeProtocol,
  CpaRuntime,
  normalizeState,
  mergeHostConfig,
  newAccountDefaults,
  accountConflicts,
  createCpaController,
  recommendModels,
  apply,
} from "../../lib/index.js";
import { videoImageBudget } from "../../lib/media.js";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
it("generate_media: off by default, then image / video with approval, budget, refunds and sub-agents", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    writeFileSync(join(workDir, "ref.png"), png);
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
    const posts = [];
    let refuse = false;
    let pending = false;
    const fetchImpl = async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && (path.startsWith("/v1/videos/") || path.startsWith("/v1/images/"))) {
        const body = JSON.parse(init.body);
        posts.push({ path, body });
        if (refuse) return new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });
        if (path.startsWith("/v1/images/")) return new Response(JSON.stringify({ data: Array.from({ length: body.n }, () => ({ b64_json: png.toString("base64") })) }));
        return new Response(JSON.stringify({ request_id: `req-${posts.length}` }));
      }
      const poll = /^\/v1\/videos\/(req-\d+)$/.exec(path);
      if (poll) return new Response(JSON.stringify(pending ? { status: "pending" } : { status: "done", video: { url: "https://vidgen.x.ai/v.mp4", duration: 6 } }));
      if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4);
      return serve(url, init);
    };
    const questions = [];
    let answer = "Allow / 允许";
    let policy = "ask";
    const saved = [];
    const root = { id: "s-root", options: { provider: "cli-proxy", model: "claude-opus-5-5" }, session: { id: "s-root", requestHeader: () => undefined } };
    const child = { id: "s-child", options: { provider: "cli-proxy", model: "claude-opus-5-5" }, session: { id: "s-child", requestHeader: () => undefined } };
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: {
          saveImage: async ({ data, mediaType, name }) => (saved.push(name), { attachmentId: `sha256:${saved.length}`, mediaType, bytes: data.byteLength, width: 8, height: 8, name }),
          readImage: async (ref) => ({ ref, data: png }),
        },
        approval: {
          effectivePolicy: () => policy,
          request: async () => { throw new Error("execution approval must not be used for cost consent"); },
        },
        userQuestions: {
          ask: async (req) => (questions.push(req), { answers: [{ id: req.questions[0].id, selected: [answer] }] }),
        },
        llm: { resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }) },
        agents: { list: () => [root, child], isOwnedBy: (id, owner) => id === "s-child" && owner === root },
      },
    });
    let n = 0;
    const call = (args, agent = root, signal = new AbortController().signal) => m.tools.find((t) => t.name === "generate_media").execute(args, { agent, callId: `toolu_${++n}`, signal });
    const session = async (id = "s-root") => (await m.call("GET", `/api/dsh-cliproxyapi/media/session?sessionId=${id}`)).body.session;
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      assert.equal(m.tools.length, 0, "off by default");
      await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: true });
      assert.deepEqual(m.tools.map((t) => t.name), ["generate_media"]);
      const tool = m.tools[0];
      const schema = JSON.stringify({ d: tool.description, p: tool.parameters });
      assert.ok(!/grok-imagine-image|claude|default\//.test(schema), "the schema lists no models or accounts");
      assert.ok(schema.length < 2600, `compact schema (${schema.length} chars)`);

      // Image: no confirmation by default; the model gets previews when it can see images.
      let out = await call({ kind: "image", prompt: "a lighthouse", count: 2, aspect: "16:9", images: ["ref.png"] });
      assert.equal(out.status, "done");
      assert.equal(out.files.length, 2);
      assert.equal(out.previews.length, 2);
      assert.equal(questions.length, 0);
      assert.equal(posts[0].path, "/v1/images/edits");
      assert.equal(posts[0].body.prompt, "a lighthouse");
      assert.equal(posts[0].body.n, 2);
      const content = tool.output.render({}, out);
      assert.equal(content.filter((b) => b.type === "image").length, 2);
      let row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=${out.run}`);
      assert.equal(row.body.run.status, "done", "the call has a chat-row record like a command");
      assert.equal(out.run, "toolu_1");

      // Words that look like options stay in the prompt (literal).
      // A real Responses all-fields call formerly failed on model:"", count:1,
      // then on first-frame without images. It must use the selected model and
      // reach confirmation exactly once as a text-to-video request.
      out = await call({ kind: "video", prompt: "10秒 竖屏 一只猫", mode: "generate", model: "", images: [], frames: "first-frame", video: "", aspect: "16:9", seconds: 4, resolution: "480p", count: 1 });
      assert.equal(questions.length, 1, "videos ask by default");
      assert.match(questions[0].questions[0].question, /4 秒视频/);
      assert.match(questions[0].questions[0].question, /cannot be cancelled/);
      assert.equal(questions[0].agent, root);
      assert.equal(Object.hasOwn(questions[0], "wait"), false, "anonymous questions block at the composer");
      assert.equal(posts[1].body.prompt, "10秒 竖屏 一只猫");
      assert.equal(posts[1].body.duration, 4);
      assert.equal(posts[1].body.model, "grok-imagine-video-1.5", "an empty model uses the user's selected model");
      assert.equal(posts[1].body.image, undefined);
      assert.equal(posts[1].body.reference_images, undefined);
      assert.equal((await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-root&commandId=${out.run}`)).body.run.mode, "text");
      assert.equal(out.status, "done");
      assert.equal(out.files.length, 1);
      assert.equal((await session()).agent.used, 4, "confirmed videos are counted too");

      // Declined: nothing is sent or counted.
      answer = "Decline / 拒绝";
      const before = posts.length;
      await assert.rejects(call({ kind: "video", prompt: "x", seconds: 4 }), /the user declined this video; do not retry/);
      assert.equal(posts.length, before);
      assert.equal((await session()).agent.used, 4);
      answer = "Allow / 允许";

      // Permission presets do not waive media cost consent. A child asks its
      // live root, but its generation record remains in its own session.
      policy = "never";
      const askedBefore = questions.length;
      out = await call({ kind: "video", prompt: "native composer", mode: null, model: null, images: null, frames: null, video: null, aspect: null, seconds: 4, resolution: null, count: null }, child);
      assert.equal(out.status, "done");
      assert.equal(posts.at(-1).body.prompt, "native composer");
      assert.equal(questions.length, askedBefore + 1, "approval never still asks for cost consent");
      assert.equal(questions.at(-1).agent, root, "sub-agent questions target the live root");
      assert.deepEqual((await session()).pendingConfirmations, [], "native questions do not create a fallback dialog");
      assert.equal((await session()).agent.used, 8);
      const late = await m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-child", commandId: out.run, allow: true });
      assert.equal(late.code, 400, "a native confirmation cannot be answered through the fallback route");
      policy = "ask";

      // Auto for this session with a 10 s limit: switching to auto starts the count again.
      let sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-root", videoConfirm: "auto", videoBudget: { mode: "limited", seconds: 10 } });
      assert.equal(sent.body.session.agent.used, 0);
      assert.equal(sent.body.session.agent.sources.videoConfirm, "session");
      const asked = questions.length;
      out = await call({ kind: "video", prompt: "a", seconds: 6 }, child);
      assert.equal(questions.length, asked, "auto does not ask");
      assert.equal((await session()).agent.used, 6, "a sub-agent counts against its root session");
      row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=s-child&commandId=${out.run}`);
      assert.equal(row.body.run.status, "done", "the row lives in the sub-agent's own session");
      const sentBefore = posts.length;
      await assert.rejects(call({ kind: "video", prompt: "b", seconds: 6 }), /budget is 10 s and 6 s are used; this video needs 6 s/);
      assert.equal(posts.length, sentBefore);

      // CPA refuses at once: the seconds come back.
      refuse = true;
      await assert.rejects(call({ kind: "video", prompt: "c", seconds: 4 }), /CPA rejected the request/);
      refuse = false;
      assert.equal((await session()).agent.used, 6);

      // Stop waiting: the job keeps running in the background.
      pending = true;
      const stop = new AbortController();
      const waiting = call({ kind: "video", prompt: "d", seconds: 4 }, root, stop.signal);
      for (let i = 0; i < 100 && posts.length === sentBefore + 1; i += 1) await new Promise((r) => setTimeout(r, 5));
      stop.abort();
      out = await waiting;
      assert.equal(out.status, "running");
      assert.match(out.note, /keeps running in the background/);
      assert.equal((await session()).agent.used, 10);

      // Argument checks reach the model as plain errors.
      await assert.rejects(call({ kind: "image", prompt: "x", seconds: 4 }), /seconds is for videos only/);
      await assert.rejects(call({ kind: "video", mode: "edit", prompt: "x", seconds: 4 }), /edit keeps the source's length/);

      // Edit a local MP4 (no limit for this session now: a new limit starts the count again).
      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-root", videoBudget: { mode: "unlimited" } });
      assert.equal(sent.body.session.agent.used, 0);
      pending = false;
      writeFileSync(join(workDir, "clip.mp4"), mp4);
      out = await call({ kind: "video", mode: "edit", prompt: "make it red", video: "clip.mp4" });
      const edit = posts.at(-1);
      assert.equal(edit.path, "/v1/videos/edits");
      assert.equal(edit.body.prompt, "make it red");
      assert.match(edit.body.video.url, /^data:video\/mp4;base64,/);
      assert.equal(out.status, "done");
      assert.equal(out.mode, "edit");

      // Switching off removes the tool.
      await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: false });
      assert.equal(m.tools.length, 0);
    } finally {
      m.dispose();
    }
  });
});
