// Host fallback-consent tests, moved without changing test titles or assertions.

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
  it("generate_media keeps root-owned session-isolated composer fallback only without userQuestions", async () => {
    const f = await mediaConsentFixture({ native: false });
    try {
      const pending = f.call();
      const denied = assert.rejects(pending, /the user declined/);
      let own;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        own = await f.session();
        if (own.pendingConfirmations.length > 0) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(own.pendingConfirmations.length, 1);
      const confirmation = own.pendingConfirmations[0];
      assert.deepEqual(Object.keys(confirmation).sort(), ["commandId", "en", "expiresAt", "kind", "zh"]);
      assert.equal(confirmation.commandId, "toolu_1");
      assert.equal(confirmation.kind, "video");
      assert.match(confirmation.zh, /4 秒视频.*无法取消/);
      assert.match(confirmation.en, /cannot be cancelled/);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, [], "the child does not own the human root's consent");
      assert.deepEqual((await f.session("s-other")).pendingConfirmations, []);
      const anonymous = await f.m.call("GET", "/api/dsh-cliproxyapi/media/session");
      assert.deepEqual(anonymous.body.session.pendingConfirmations, [], "no session means no leaked pending questions");
      assert.equal((await f.row()).confirm, undefined, "the child's media row cannot show root-owned consent");
      assert.equal((await f.row("toolu_1", f.root.id)).confirm.kind, "video", "old API remains compatible for the root owner");
      assert.equal(f.posts.length, 0);
      const wrong = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.child.id, commandId: "toolu_1", allow: true });
      assert.equal(wrong.code, 400, "the calling child cannot answer root-owned consent");
      const unrelated = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: "s-other", commandId: "toolu_1", allow: true });
      assert.equal(unrelated.code, 400);
      const answer = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.root.id, commandId: "toolu_1", allow: false });
      assert.equal(answer.code, 200);
      await denied;
      assert.deepEqual((await f.session()).pendingConfirmations, []);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
      assert.equal((await f.row("toolu_1", f.root.id)).confirm, undefined);
      assert.equal(f.questions.requests.length, 0);
      assert.equal(f.posts.length, 0);
      assert.equal((await f.session()).agent.used, 0);

      const allowed = f.call();
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await f.session()).pendingConfirmations.length > 0) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      const ok = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.root.id, commandId: "toolu_2", allow: true });
      assert.equal(ok.code, 200);
      assert.equal((await allowed).status, "done");
      assert.equal(f.posts.length, 1);
      assert.equal((await f.session()).agent.used, 4);
      assert.deepEqual((await f.session()).pendingConfirmations, []);
      assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
      assert.equal((await f.row()).run.status, "done", "generation records remain in the calling child's session");
      const late = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.root.id, commandId: "toolu_2", allow: true });
      assert.equal(late.code, 400, "settled fallback cannot be answered twice");
    } finally {
      f.m.dispose();
    }
  });

  for (const ending of ["abort", "disable", "scope", "timeout"]) {
    it(`generate_media cleans missing-service fallback after ${ending}`, async (t) => {
      const f = await mediaConsentFixture({ native: false });
      if (ending === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
      try {
        const stop = new AbortController();
        const pending = f.call({}, f.child, stop.signal);
        const refused = assert.rejects(pending, ending === "timeout" ? /within 10 minutes/ : /confirmation.*cancelled/);
        for (let attempt = 0; attempt < 100; attempt += 1) {
          if ((await f.session()).pendingConfirmations.length > 0) break;
          await new Promise((resolve) => setImmediate(resolve));
        }
        assert.equal((await f.session()).pendingConfirmations.length, 1);
        assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
        if (ending === "abort") stop.abort();
        else if (ending === "disable") await f.m.call("POST", "/api/dsh-cliproxyapi/media/save", { agentTool: false });
        else if (ending === "scope") f.m.disposeEffect("cpa: agent tool");
        else t.mock.timers.tick(10 * 60_000);
        await refused;
        assert.deepEqual((await f.session()).pendingConfirmations, []);
        assert.deepEqual((await f.session(f.child.id)).pendingConfirmations, []);
        assert.equal((await f.row("toolu_1", f.root.id)).confirm, undefined);
        assert.equal((await f.row()).confirm, undefined);
        const late = await f.m.call("POST", "/api/dsh-cliproxyapi/media/confirm", { sessionId: f.root.id, commandId: "toolu_1", allow: true });
        assert.equal(late.code, 400);
        assert.equal(f.posts.length, 0);
        assert.equal((await f.session()).agent.used, 0);
      } finally {
        if (ending === "timeout") t.mock.timers.reset();
        f.m.dispose();
      }
    });
  }
});
