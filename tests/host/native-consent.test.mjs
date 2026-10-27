// Host native-consent tests, moved without changing test titles or assertions.

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
import { mediaConsentFixture } from "../helpers/host-consent.mjs";

describe("media models", () => {
  it("generate_media blocks at the root native composer without command mirroring or an upstream request", async () => {
    const f = await mediaConsentFixture();
    try {
      const pending = f.call();
      const entry = await f.question(0);
      const { request } = entry;
      assert.equal(request.agent, f.root, "only the live human root may answer");
      assert.equal(Object.hasOwn(request, "wait"), false, "no continued/folded callId card");
      assert.equal(Object.hasOwn(request, "callId"), false);
      assert.equal(request.questions.length, 1);
      const question = request.questions[0];
      assert.match(question.header, /Video.*视频/);
      assert.match(question.question, /4 秒视频.*无法取消/);
      assert.match(question.question, /cannot be cancelled/);
      assert.deepEqual(question.options, [{ label: "Allow / 允许" }, { label: "Decline / 拒绝" }]);
      assert.equal(question.multiSelect, false);
      assert.notEqual(request.signal, undefined);
      assert.equal(request.signal.aborted, false);
      assert.deepEqual(f.posts, [], "no paid request before an exact allow");
      assert.equal((await f.row()).run, null, "no run is recorded before consent");
      assert.equal((await f.row()).confirm, undefined, "native consent never creates a second row dialog");
      assert.deepEqual((await f.session()).pendingConfirmations, []);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
      assert.equal((await f.session()).agent.used, 0);
      entry.select("Allow / 允许");
      const out = await pending;
      assert.equal(out.status, "done");
      assert.equal(out.commandRow, false, "deprecated output flag remains false");
      assert.equal(out.files.length, 1);
      assert.equal(f.posts.length, 1);
      assert.equal((await f.session()).agent.used, 4, "confirmed videos still count against the root");
      assert.equal((await f.session(f.child.id)).agent.used, 0);
      assert.equal((await f.row()).run.status, "done", "the run belongs to the child session");
      assert.deepEqual(f.appended, [], "the host never impersonates a user slash command");
      assert.equal(request.signal.aborted, true, "native pending UI is removed after settlement");
      assert.equal(f.questions.active.size, 0);
    } finally {
      f.m.dispose();
    }
  });

  it("generate_media requires one exact allow; declines missing, custom and ambiguous native answers", async () => {
    const f = await mediaConsentFixture();
    try {
      const cases = [
        ["explicit decline", (id) => ({ answers: [{ id, selected: ["Decline / 拒绝"] }] })],
        ["missing batch", () => undefined],
        ["empty batch", () => ({ answers: [] })],
        ["missing selection", (id) => ({ answers: [{ id }] })],
        ["empty selection", (id) => ({ answers: [{ id, selected: [] }] })],
        ["custom allow", (id) => ({ answers: [{ id, selected: [], custom: "Allow / 允许" }] })],
        ["custom with selected allow", (id) => ({ answers: [{ id, selected: ["Allow / 允许"], custom: "yes" }] })],
        ["empty custom with selected allow", (id) => ({ answers: [{ id, selected: ["Allow / 允许"], custom: "" }] })],
        ["allow and decline", (id) => ({ answers: [{ id, selected: ["Allow / 允许", "Decline / 拒绝"] }] })],
        ["duplicate allow", (id) => ({ answers: [{ id, selected: ["Allow / 允许", "Allow / 允许"] }] })],
        ["wrong label", (id) => ({ answers: [{ id, selected: ["Allow"] }] })],
        ["wrong question", () => ({ answers: [{ id: "other", selected: ["Allow / 允许"] }] })],
        ["extra answer", (id) => ({ answers: [{ id, selected: ["Allow / 允许"] }, { id: "other", selected: [] }] })],
      ];
      for (const [label, answer] of cases) {
        const index = f.questions.requests.length;
        const pending = f.call();
        const denied = assert.rejects(pending, /the user declined this video; do not retry/, label);
        const entry = await f.question(index);
        entry.answer(answer(entry.request.questions[0].id));
        await denied;
        assert.equal(entry.request.signal.aborted, true, `${label}: pending question is removed`);
        assert.equal(f.questions.active.size, 0, label);
        assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, [], label);
      }
      assert.equal(f.posts.length, 0);
      assert.equal((await f.session()).agent.used, 0);
      assert.deepEqual(f.appended, []);
    } finally {
      f.m.dispose();
    }
  });

  it("generate_media asks for images too and skips native questions only in media auto mode", async () => {
    const f = await mediaConsentFixture();
    try {
      const pending = f.call({ kind: "image", seconds: null });
      const entry = await f.question(0);
      assert.match(entry.request.questions[0].header, /Image.*图像/);
      assert.match(entry.request.questions[0].question, /北方大雪/);
      assert.equal(f.posts.length, 0);
      entry.select("Allow / 允许");
      assert.equal((await pending).status, "done");
      await f.m.call("POST", "/api/dsh-cliproxyapi/media/session/save", { sessionId: f.root.id, imageConfirm: "auto", videoConfirm: "auto" });
      assert.equal((await f.call({ kind: "image", seconds: null })).status, "done");
      assert.equal((await f.call()).status, "done");
      assert.equal(f.questions.requests.length, 1, "auto generates without any question");
      assert.equal(f.posts.length, 3);
    } finally {
      f.m.dispose();
    }
  });

  it("generate_media never opens a fallback consent dialog after native question failure", async () => {
    const f = await mediaConsentFixture();
    try {
      let pending = f.call();
      let refused = assert.rejects(pending, /confirmation.*could not be shown/);
      const entry = await f.question(0);
      entry.reject();
      await refused;
      assert.equal(entry.request.signal.aborted, true);
      for (const service of [
        { ask: () => { throw new Error("native synchronous failure"); } },
        {},
      ]) {
        f.services.userQuestions = service;
        pending = f.call();
        refused = assert.rejects(pending, /confirmation.*could not be shown/);
        await refused;
      }
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
      assert.equal((await f.row()).confirm, undefined);
      const late = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.child.id, commandId: "toolu_1", allow: true });
      assert.equal(late.code, 400);
      assert.equal(f.posts.length, 0);
      assert.equal((await f.session()).agent.used, 0);
    } finally {
      f.m.dispose();
    }
  });

  it("generate_media cancels native consent on the calling child's signal and ignores late allow", async () => {
    const f = await mediaConsentFixture();
    try {
      const controller = new AbortController();
      const signal = controller.signal;
      const listeners = new Set();
      const add = signal.addEventListener.bind(signal);
      const remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = (type, listener, options) => {
        if (type === "abort") listeners.add(listener);
        return add(type, listener, options);
      };
      signal.removeEventListener = (type, listener, options) => {
        if (type === "abort") listeners.delete(listener);
        return remove(type, listener, options);
      };
      const pending = f.call({}, f.child, signal);
      const cancelled = assert.rejects(pending, /confirmation.*cancelled/);
      const entry = await f.question(0);
      assert.notEqual(entry.request.signal, signal, "question has an owned cancellable signal");
      assert.equal(entry.request.agent, f.root);
      assert.equal(listeners.size, 1);
      controller.abort();
      await cancelled;
      assert.equal(entry.request.signal.aborted, true);
      assert.equal(listeners.size, 0, "calling signal listener is removed");
      assert.equal(f.questions.active.size, 0);
      entry.select("Allow / 允许");
      await Promise.resolve();
      assert.equal(f.posts.length, 0);
      assert.equal((await f.session()).agent.used, 0);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);

      const preAborted = new AbortController();
      preAborted.abort();
      await assert.rejects(f.call({}, f.child, preAborted.signal));
      assert.equal(f.questions.requests.length, 1, "pre-aborted calls do not publish a question");
    } finally {
      f.m.dispose();
    }
  });

  for (const teardown of ["disable", "scope", "plugin"]) {
    it(`generate_media removes native consent on ${teardown} teardown`, async () => {
      const f = await mediaConsentFixture();
      try {
        const pending = f.call();
        const cancelled = assert.rejects(pending, /confirmation.*cancelled/);
        const entry = await f.question(0);
        if (teardown === "disable") await f.m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: false });
        else if (teardown === "scope") f.m.disposeEffect("cpa: agent tool");
        else f.m.dispose();
        await cancelled;
        assert.equal(entry.request.signal.aborted, true);
        assert.equal(f.questions.active.size, 0);
        entry.select("Allow / 允许");
        await Promise.resolve();
        assert.equal(f.posts.length, 0);
        assert.equal(f.m.tools.length, 0);
        if (teardown !== "plugin") assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
      } finally {
        f.m.dispose();
      }
    });
  }

  it("generate_media bounds native consent to ten minutes and clears its timeout after answers", async (t) => {
    const f = await mediaConsentFixture();
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const pending = f.call();
      const expired = assert.rejects(pending, /did not answer.*within 10 minutes/);
      const entry = await f.question(0);
      t.mock.timers.tick(10 * 60_000 - 1);
      assert.equal(entry.request.signal.aborted, false);
      t.mock.timers.tick(1);
      await expired;
      assert.equal(entry.request.signal.aborted, true);
      assert.equal(f.questions.active.size, 0);
      entry.select("Allow / 允许");
      await Promise.resolve();
      assert.equal(f.posts.length, 0);
      assert.equal((await f.session()).agent.used, 0);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);

      const next = f.call();
      const denied = assert.rejects(next, /the user declined/);
      const answered = await f.question(1);
      answered.select("Decline / 拒绝");
      await denied;
      t.mock.timers.tick(10 * 60_000);
      assert.equal(f.questions.active.size, 0);
      assert.equal(f.posts.length, 0);
    } finally {
      t.mock.timers.reset();
      f.m.dispose();
    }
  });
});
