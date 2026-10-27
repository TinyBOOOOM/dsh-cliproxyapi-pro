// conversation behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("agent media conversation placement", () => {
  it("folds real tool events into one turn-level node outside both process folds", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    const location = { kind: "step", step: { status: "open", step: 1 }, turn: { status: "open", turn: 1 } };
    const call = { type: "tool/call", seq: 8, data: { name: "generate_media", callId: "toolu|01", arguments: JSON.stringify({ kind: "video", prompt: "南方大雨", seconds: 8, resolution: "480p" }) } };
    const identity = def.match["tool/call"](call);
    assert.equal(identity.role, "start");
    assert.equal(identity.exclusive, undefined, "does not steal other definitions' events");
    const start = { event: call, location };
    const context = { key: "media:toolu|01", id: identity.id, start, matches: [start], state: def.start({}, start) };
    const running = def.buildViewNode(context);
    assert.equal(running.kind, h.MEDIA_NODE_KIND);
    assert.equal(running.groupTree, "turn", "turn escapes inner AND whole-turn process folding; process alone does not");
    assert.equal(running.location, location);
    assert.equal(running.anchorSeq, 8);
    assert.equal(running.key, context.key);
    assert.equal(running.data.phase, "start");
    const card = h.MediaToolRow({ t: (key) => h.zh[key] ?? key, owner: running.data, standalone: true });
    assert.equal(card.props.pending, true);
    assert.equal(card.props.node.commandId, "toolu_01");
    assert.equal(card.props.showConfirm, false);
    const result = { type: "tool/result", surfaceOp: "append", seq: 10, data: { message: { source: { callId: identity.id }, content: [{ type: "text", text: "saved" }] }, meta: { run: "toolu_01" } } };
    const update = def.match["tool/result"](result);
    assert.equal(update.id, identity.id);
    context.state = def.update(context, { event: result, location });
    const done = def.buildViewNode(context);
    assert.equal(done.key, running.key, "completion updates the existing row, not another row");
    assert.equal(done.data.phase, "result");
    assert.equal(done.data.block.meta.run, "toolu_01");
    assert.equal(done.groupTree, "turn");
    const snapshot = { order: ["m"], nodes: new Map([["m", done]]) };
    assert.equal(h.hasMediaNode(snapshot, "toolu_01"), true);
    assert.equal(h.MediaToolRow({ owner: done.data, useChat: (selector) => selector(snapshot) }), null);
  });

  it("ignores replacements, unrelated calls and paged orphan results until their own start is loaded", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    assert.equal(def.match["tool/call"]({ data: { name: "pwsh", callId: "other" } }), null);
    assert.equal(def.match["tool/result"]({ surfaceOp: "replace", data: { message: { source: { callId: "x" } } } }), null);
    assert.equal(def.buildViewNode({ state: undefined, start: undefined }), null);
    assert.equal(def.buildViewNode({ state: null, start: undefined }), null);
    assert.equal(def.update({ state: null }, { event: {} }), null, "never return forbidden undefined from update");
    assert.equal(h.hasMediaNode({ order: ["m"], nodes: new Map([["m", { kind: "command", data: { commandId: "x" } }]]) }, "x"), false);
    const start = { event: { seq: 1, data: { callId: "x", arguments: "{}" } }, location: { kind: "step", step: { status: "closed" }, turn: { status: "open" } } };
    const node = def.buildViewNode({ key: "x", id: "x", start, state: def.start({}, start) });
    assert.equal(node.data.block.isError, true, "interrupted calls must not look pending forever");
  });

  it("renders nested PTC generations outside their parent process, including final-only pages", () => {
    const h = clientHarness();
    const def = h.mediaConversationDefinition;
    const location = { kind: "step", step: { status: "open" }, turn: { status: "open" } };
    const start = { event: { type: "tool/ptc-dispatch-start", seq: 3, data: { name: "generate_media", subCallId: "nested|1", rootCallId: "workflow-1", arguments: { kind: "video", prompt: "大雨" } } }, location };
    assert.equal(def.match["tool/ptc-dispatch-start"](start.event).id, "nested|1");
    const context = { key: "nested-1", id: "nested|1", start, state: def.start({}, start) };
    assert.equal(def.buildViewNode(context).data.block.phase, "start");
    const final = { event: { type: "tool/ptc-dispatch", seq: 4, data: { ...start.event.data, content: [{ type: "text", text: "saved" }], meta: { run: "nested_1" }, isError: false } }, location };
    assert.equal(def.match["tool/ptc-dispatch"](final.event).role, "start", "final-only windows can reconstruct their own named call");
    context.state = def.update(context, final);
    const done = def.buildViewNode(context);
    assert.equal(done.groupTree, "turn");
    assert.equal(done.data.phase, "result");
    assert.equal(done.data.block.meta.run, "nested_1");
    const finalOnly = def.buildViewNode({ key: "final-only", id: "nested|1", start: final, state: def.start({}, final) });
    assert.equal(finalOnly.data.phase, "result");
    assert.equal(finalOnly.data.callId, "nested|1");
    assert.equal(def.match["tool/ptc-dispatch"]({ data: { name: "read", subCallId: "other" } }), null);
  });

  it("registers and disposes the official conversation definition and renderer together", () => {
    const h = clientHarness();
    const definitions = [], registrations = [], disposers = [];
    let removed = 0;
    const ctx = {
      effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); return off; },
      locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
      slots: { inject: (_name, fn) => { const off = fn(); if (typeof off === "function") disposers.push(off); }, register: (meta, render) => (registrations.push({ meta, render }), () => {}) },
      uiConversation: { events: { register: (def) => (definitions.push(def), () => { removed++; }) } },
      inject(names, fn) { if (names.length === 1 && names[0] === "uiConversation") fn(ctx); },
    };
    h.apply(ctx);
    assert.equal(definitions.length, 1);
    const renderer = registrations.find((entry) => entry.meta.name === "conversation.chat.node");
    assert.equal(renderer.meta.key, definitions[0].kind);
    const row = renderer.render({ sessionId: "s-1", node: { data: { callId: "call-1" } } });
    assert.equal(row.props.owner.callId, "call-1");
    assert.equal(row.props.standalone, true);
    assert.ok(registrations.some((entry) => entry.meta.name === "conversation.composer.dock"));
    for (const off of disposers.reverse()) off();
    assert.equal(removed, 1);
    assert.equal(h.timers.size, 0);
  });
});

