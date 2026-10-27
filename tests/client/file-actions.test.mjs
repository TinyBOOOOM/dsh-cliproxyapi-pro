// file-actions behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("image row file actions", () => {
  it("reach DSH's remote.session service, ask the desktop once and pass reveal / application requests", async () => {
    const h = clientHarness();
    const live = [];
    const calls = [];
    let mounted = false;
    const session = {
      canOpenWorkspacePath: async () => (calls.push("can"), { ok: true, value: true }),
      workspacePathApplications: async (request) => (calls.push(["apps", request]), { ok: true, value: [{ id: "x.exe", name: "X", default: true }, { bad: 1 }] }),
      openWorkspacePath: async (request) => (calls.push(["open", request]), { ok: true, value: { opened: true } }),
    };
    const ctx = {
      effect(fn) { return fn(); },
      locale: { register: () => () => {}, bind: () => (key) => key },
      slots: { inject: (_name, fn) => fn(), register: (meta, render) => (live.push({ meta, render }), () => {}) },
      inject(_names, fn) { fn({ slots: ctx.slots, modelDirectories: { directoryFor: () => ({ store: null }) } }); },
      get: (name) => (name === "remote.session" && mounted ? session : undefined),
    };
    h.apply(ctx);
    const row = live.find((e) => e.meta.name === "conversation.chat.commandview");
    const actions = row.render({ node: { name: "cpa-image" }, sessionId: "s-1" }).props.fileActions;
    assert.equal(await actions.available(), false, "not mounted yet");
    mounted = true;
    assert.equal(await actions.available(), true);
    assert.equal(await actions.available(), true);
    assert.deepEqual(calls, ["can"], "asked once");
    assert.deepEqual(JSON.parse(JSON.stringify(await actions.applications("D:\\a.png"))), [{ id: "x.exe", name: "X", default: true }]);
    assert.equal(await actions.open("D:\\a.png", "reveal"), true);
    await actions.open("D:\\a.png", "open", "x.exe");
    await actions.open("D:\\a.png", "open");
    assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(2))), [
      ["open", { path: "D:\\a.png", action: "reveal" }],
      ["open", { path: "D:\\a.png", application: "x.exe" }],
      ["open", { path: "D:\\a.png" }],
    ]);
  });
});
