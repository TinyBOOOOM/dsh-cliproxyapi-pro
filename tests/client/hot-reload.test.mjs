// hot-reload behavior of the shipped ModuleLoader client.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clientHarness, nodes, content, flushClient, html } from "../helpers/client-harness.mjs";
import { update, reply, button, SCHEMA, capabilities, operation, json, runTimers, quotaData } from "../helpers/client-fixtures.mjs";

describe("hot reload", () => {
  it("keeps the badge and settings entries when the new activation starts before the old one is disposed", () => {
    const h = clientHarness();
    // Mirrors DSH SlotCore: one entry per name + id/key + priority; the lowest priority renders.
    const live = new Map();
    const registry = {
      inject(_name, fn) { return fn(); },
      register(meta, render) {
        const key = `${meta.name}#${meta.id ?? meta.key}#${meta.priority ?? 0}`;
        if (live.has(key)) throw new Error(`slot "${meta.name}" already has an entry with id "${meta.id ?? meta.key}" at priority ${meta.priority ?? 0}`);
        live.set(key, { meta, render });
        return () => live.delete(key);
      },
    };
    const activation = () => {
      const disposers = [];
      const ctx = {
        effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); return off; },
        locale: { register: () => () => {}, bind: () => (key) => h.zh[key] ?? key },
        slots: {
          inject: (name, fn) => { const off = registry.inject(name, fn); if (typeof off === "function") disposers.push(off); },
          register: registry.register,
        },
        inject(_names, fn) { fn({ slots: ctx.slots, modelDirectories: { directoryFor: () => ({ store: null }) } }); },
      };
      h.apply(ctx);
      return () => { for (const off of disposers.splice(0).reverse()) off(); };
    };
    const disposeOld = activation();
    const disposeNew = activation(); // overlaps: the old entries still hold the stable ids
    disposeOld();
    const names = [...live.values()].map((e) => e.meta.name).sort();
    assert.deepEqual(names, ["conversation.chat.commandview", "conversation.chat.commandview", "conversation.chat.commandview", "conversation.chat.commandview", "conversation.composer.dock", "conversation.hero.options", "conversation.hero.options", "conversation.input.right", "conversation.input.right", "plugins.bundle.config", "settings.plugins.tab", "settings.section", "tool.call.toolview"]);
    const chip = [...live.values()].find((e) => e.meta.id === "dsh-cliproxyapi-pro:media");
    assert.equal(chip.meta.priority, 1, "the generation button also shadows one priority lower");
    const badge = [...live.values()].find((e) => e.meta.id === "dsh-cliproxyapi-pro:quota");
    assert.equal(badge.meta.id, "dsh-cliproxyapi-pro:quota", "the id stays stable");
    assert.equal(badge.meta.priority, 1, "the reloaded entry shadows one priority lower");
    disposeNew();
    assert.equal(live.size, 0);
  });
});
