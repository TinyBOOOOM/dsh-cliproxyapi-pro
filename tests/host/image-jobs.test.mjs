// Host image-jobs tests, moved without changing test titles or assertions.

import { describe, it } from "node:test";
import assert from "node:assert/strict";


import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { json, fakeServers, MEDIA_SERVERS } from "../helpers/host-catalog.mjs";
import { settledRun, mountPlugin } from "../helpers/host-mount.mjs";

describe("media models", () => {
  it("/cpa-image syncs once when no catalog was read yet, and explains an empty choice per account", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const fetchImpl = async (url, init) =>
      new URL(String(url)).pathname.startsWith("/v1/images/")
        ? new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }))
        : serve(url, init);
    let m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    const signal = new AbortController().signal;
    try {
      // Right after a start or reload: no sync has run yet. The composer button's read syncs once.
      const view = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.deepEqual(view.body.session.options.image.map((o) => o.ref), ["default/grok-imagine-image"]);
      const result = await m.commands.find((c) => c.name === "cpa-image").handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal });
      assert.equal(result.kind, "success", result.text);
    } finally {
      m.dispose();
    }
    m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", displayName: "BCPA", baseURL: "http://m.test", enabled: false, selectedModels: [] }] },
      fetchImpl,
      extraServices: { workingDirectory: { ensure: async () => workDir } },
    });
    try {
      const result = await m.commands.find((c) => c.name === "cpa-image").handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal });
      assert.equal(result.kind, "error");
      assert.match(result.text, /no image model is available \(BCPA: disabled, 0 model\(s\), 0 image\)/);
    } finally {
      m.dispose();
    }
  });

  it("/cpa-image generates into the session folder, records it and serves only recorded files", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
    const imageCalls = [];
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    const m = mountPlugin({
      state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.startsWith("/v1/images/")) {
          imageCalls.push({ path, auth: init.headers.Authorization, body: JSON.parse(init.body) });
          const n = JSON.parse(init.body).n;
          return new Response(JSON.stringify({ data: Array.from({ length: n }, () => ({ b64_json: png.toString("base64") })) }));
        }
        return serve(url, init);
      },
      extraServices: {
        workingDirectory: { ensure: async () => workDir },
        attachments: { readImage: async (ref) => ({ ref, data: png }) },
      },
    });
    try {
      assert.equal(m.tools.length, 0, "no agent tool while the switch is off");
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.deepEqual(sent.body.session.options.image.map((o) => o.ref), ["default/grok-imagine-image"]);
      assert.deepEqual(sent.body.session.current.image, { ref: "default/grok-imagine-image", source: "only" });

      const image = m.commands.find((c) => c.name === "cpa-image");
      const signal = new AbortController().signal;
      let result = await image.handler({ agent: { id: "s-1" }, rawInput: "-n 2 a red fox", attachments: [], signal, commandId: "cmd-t-1" });
      assert.equal(result.kind, "success", result.text);
      assert.match(result.text, /^Generating 2 image\(s\) with grok-imagine-image/, "returns once admitted");
      // The session shows as running while the job runs, and idle after it.
      assert.deepEqual(m.emitted[0], ["api-session/status", "s-1", true]);
      let row = await settledRun(m, "s-1", "cmd-t-1");
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);
      assert.equal(row.code, 200, JSON.stringify(row.body));
      assert.equal(row.body.run.status, "done");
      assert.equal(row.body.run.prompt, "a red fox");
      assert.equal(row.body.run.count, 2);
      assert.equal(row.body.run.folder, "generated", "a display label, not a path");
      // The chat row finds this run's files by command id, in generation order.
      assert.deepEqual(row.body.files.map((f) => f.name.slice(-6)), ["-1.png", "-2.png"]);
      // Paths let the page open / reveal a file through DSH's Session Remote.
      assert.deepEqual(row.body.files.map((f) => f.path), row.body.files.map((f) => join(workDir, "generated", f.name)));
      assert.equal(row.body.folderPath, join(workDir, "generated"));
      assert.equal(row.body.desktop, process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "finder" : "filemanager");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-2&commandId=cmd-t-1");
      assert.deepEqual(row.body.files, [], "another session sees nothing");
      assert.equal(row.body.run, null);
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=bad%20id");
      assert.equal(row.code, 400);

      assert.deepEqual(imageCalls[0], {
        path: "/v1/images/generations",
        auth: "Bearer key-a",
        body: { model: "grok-imagine-image", prompt: "a red fox", n: 2, response_format: "b64_json" },
      });
      const files = readdirSync(join(workDir, "generated"));
      assert.equal(files.length, 2);
      assert.ok(files.every((f) => /^\d{8}-\d{6}-grok-imagine-image-a-red-fox-[12]\.png$/.test(f)), files.join(", "));
      assert.ok(!result.text.includes("key-a"));

      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=s-1");
      const recent = sent.body.session.recent;
      assert.equal(recent.length, 2);
      assert.ok(!JSON.stringify(recent).includes(workDir), "the page gets file names, not paths");
      sent = await m.call("GET", `/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=${recent[0].id}`);
      assert.equal(sent.code, 200);
      assert.equal(sent.headers["content-type"], "image/png");
      assert.deepEqual([...sent.raw], [...png]);
      sent = await m.call("GET", `/api/dsh-cliproxyapi/media/file?sessionId=s-2&id=${recent[0].id}`);
      assert.equal(sent.code, 404, "another session cannot read it");
      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/file?sessionId=s-1&id=0000000000000000");
      assert.equal(sent.code, 404);

      result = await image.handler({
        agent: { id: "s-1" },
        rawInput: "--aspect 1:1 make it blue",
        attachments: [{ type: "image", attachment: { mediaType: "image/png" } }],
        signal,
        commandId: "cmd-t-2",
      });
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-1", "cmd-t-2");
      assert.equal(row.body.run.references, 1);
      assert.equal(imageCalls[1].path, "/v1/images/edits");
      assert.match(imageCalls[1].body.images[0].image_url, /^data:image\/png;base64,/);
      assert.equal(imageCalls[1].body.size, "1024x1024");

      result = await image.handler({ agent: { id: "s-1" }, rawInput: "", attachments: [], signal });
      assert.equal(result.kind, "error");
      assert.match(result.text, /add a prompt/);
      result = await image.handler({ agent: { id: "s-1" }, rawInput: "cat", attachments: [{ type: "file", attachment: {} }], signal });
      assert.match(result.text, /only image attachments/);
      result = await image.handler({ agent: { id: "s-1" }, rawInput: "-m dall-e cat", attachments: [], signal });
      assert.match(result.text, /no enabled image model matches; available: default\/grok-imagine-image/);

      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-1", kind: "image", ref: "default/grok-imagine-image" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      assert.equal(sent.body.session.current.image.source, "session");
      const media = JSON.parse(readFileSync(join(m.stateDir, "media-settings.json"), "utf8"));
      assert.equal(media.lastSelection.image, "default/grok-imagine-image", "the pick is remembered for new sessions");
      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: "s-1", kind: "image", ref: "default/grok-imagine-video-1.5" });
      assert.equal(sent.code, 400);
      assert.equal(sent.body.error, "invalid-model");
      sent = await m.call("GET", "/api/dsh-cliproxyapi/media/session?sessionId=../x");
      assert.equal(sent.code, 400);

      sent = await m.call("POST", "/api/dsh-cliproxyapi/media/save", { outputDir: "art/out" });
      assert.equal(sent.code, 200, JSON.stringify(sent.body));
      result = await image.handler({ agent: { id: "s-3" }, rawInput: "skyline", attachments: [], signal, commandId: "cmd-t-3" });
      assert.equal(result.kind, "success", result.text);
      row = await settledRun(m, "s-3", "cmd-t-3");
      assert.equal(row.body.run.folder, "art/out");
      assert.equal(readdirSync(join(workDir, "art", "out")).length, 1);
    } finally {
      m.dispose();
    }
  });
  it("/cpa-image reports background failures, keeps the session running across agent turns and marks cut-off runs", async () => {
    const serve = fakeServers(MEDIA_SERVERS);
    const workDir = mkdtempSync(join(tmpdir(), "cpa-work-"));
    let release;
    let mode = "reject";
    const fetchImpl = async (url, init) => {
      if (!new URL(String(url)).pathname.startsWith("/v1/images/")) return serve(url, init);
      if (mode === "reject") return new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 });
      return new Promise((resolve, reject) => {
        release = resolve;
        init.signal?.addEventListener("abort", () => reject(init.signal.reason));
      });
    };
    const state = { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] };
    let m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    const signal = new AbortController().signal;
    const image = () => m.commands.find((c) => c.name === "cpa-image");
    try {
      await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
      let result = await image().handler({ agent: { id: "s-1" }, rawInput: "fox", attachments: [], signal, commandId: "cmd-f-1" });
      assert.equal(result.kind, "success", "admitted before the upstream answers");
      let row = await settledRun(m, "s-1", "cmd-f-1");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "upstream-error");
      assert.match(row.body.run.error, /CPA rejected the request \(HTTP 429/);
      assert.deepEqual(row.body.files, []);
      assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false]);

      mode = "hang";
      result = await image().handler({ agent: { id: "s-1" }, rawInput: "owl", attachments: [], signal, commandId: "cmd-f-2" });
      assert.equal(result.kind, "success");
      row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-f-2");
      assert.equal(row.body.run.status, "running");
      // The agent finishing a turn of its own resets the host status to idle; the job republishes it.
      m.emitted.length = 0;
      for (const fn of m.listeners["agent/status"] ?? []) fn({ agent: { id: "s-1" }, status: "idle" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(m.emitted, [["api-session/status", "s-1", true]]);
    } finally {
      m.dispose();
    }
    assert.ok(release, "the request was in flight");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(m.emitted.at(-1), ["api-session/status", "s-1", false], "reload settles the session as idle");
    const stored = JSON.parse(readFileSync(join(m.stateDir, "media-sessions.json"), "utf8"));
    const cut = stored.sessions["s-1"].runs.find((r) => r.commandId === "cmd-f-2");
    assert.equal(cut.status, "error");
    assert.equal(cut.errorCode, "interrupted");
    // A record still marked running that no job of this activation owns (a crash) reads as interrupted.
    m = mountPlugin({ state, fetchImpl, extraServices: { workingDirectory: { ensure: async () => workDir } } });
    try {
      stored.sessions["s-1"].runs[0] = { ...cut, status: "running", errorCode: undefined, error: undefined };
      writeFileSync(join(m.stateDir, "media-sessions.json"), JSON.stringify(stored));
      const row = await m.call("GET", "/api/dsh-cliproxyapi/media/command?sessionId=s-1&commandId=cmd-f-2");
      assert.equal(row.body.run.status, "error");
      assert.equal(row.body.run.errorCode, "interrupted");
    } finally {
      m.dispose();
    }
  });
});
