// Deferred native question answerer and root/child media-consent fixture.

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountPlugin } from "./host-mount.mjs";
import { fakeServers, MEDIA_SERVERS, json } from "./host-catalog.mjs";

/** Deferred native question answerer: cancellation models removal of PendingQuestion. */
export function fakeMediaQuestions() {
  const requests = [];
  const active = new Set();
  return {
    requests,
    active,
    ask(request) {
      return new Promise((resolve, reject) => {
        const finish = (settle, value) => {
          active.delete(entry);
          request.signal.removeEventListener("abort", onAbort);
          settle(value);
        };
        const onAbort = () => finish(reject, new Error("ASK_ABORTED"));
        const entry = {
          request,
          answer: (answer) => finish(resolve, answer),
          select: (label) => finish(resolve, { answers: [{ id: request.questions[0].id, selected: [label] }] }),
          reject: () => finish(reject, new Error("native question unavailable")),
        };
        requests.push(entry);
        active.add(entry);
        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) onAbort();
      });
    },
  };
}

export async function mediaConsentFixture({ native = true } = {}) {
  const serve = fakeServers(MEDIA_SERVERS);
  const workDir = mkdtempSync(join(tmpdir(), "cpa-consent-"));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(16)]);
  const posts = [];
  const appended = [];
  const root = { id: "s-root", session: { append: (...args) => appended.push(args) } };
  const child = { id: "s-child", session: { append: (...args) => appended.push(args) } };
  const questions = fakeMediaQuestions();
  const services = {
    workingDirectory: { ensure: async () => workDir },
    agents: { list: () => [root, child], isOwnedBy: (id, owner) => id === child.id && owner === root },
    approval: {
      effectivePolicy: () => { throw new Error("unpublished approval policy must not be read"); },
      request: () => { throw new Error("cost confirmation must not use execution approval"); },
    },
    ...(native ? { userQuestions: questions } : {}),
  };
  const m = mountPlugin({
    state: { version: 2, accounts: [{ id: "default", baseURL: "http://m.test", selectedModels: [] }] },
    extraServices: services,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === "POST" && /\/v1\/(images|videos)\//.test(path)) {
        posts.push({ path, body: JSON.parse(init.body) });
        return path.includes("/images/") ? json({ data: [{ b64_json: png.toString("base64") }] }) : json({ request_id: `req-${posts.length}` });
      }
      if (/^\/v1\/videos\/req-\d+$/.test(path)) return json({ status: "done", video: { duration: 4 } });
      if (/^\/openai\/v1\/videos\/req-\d+\/content$/.test(path)) return new Response(mp4);
      return serve(url, init);
    },
  });
  await m.call("POST", "/api/dsh-cliproxyapi/refresh", {});
  await m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: true, imageConfirm: "ask" });
  let n = 0;
  const tool = m.tools[0];
  const call = (args = {}, agent = child, signal = new AbortController().signal) =>
    tool.execute({ kind: "video", prompt: "北方大雪", seconds: 4, ...args }, { agent, signal, callId: `toolu_${++n}` });
  const until = async (predicate) => {
    for (let i = 0; i < 100; i += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail("confirmation did not arrive");
  };
  const question = async (index = questions.requests.length) => {
    await until(() => questions.requests.length > index);
    return questions.requests[index];
  };
  const session = async (id = root.id) => (await m.call("GET", `/api/dsh-cliproxyapi/media/session${id === undefined ? "" : `?sessionId=${id}`}`)).body.session;
  const row = async (id = `toolu_${n}`, sessionId = child.id) => (await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=${sessionId}&commandId=${id}`)).body;
  return { m, services, questions, root, child, appended, posts, call, until, question, session, row };
}
