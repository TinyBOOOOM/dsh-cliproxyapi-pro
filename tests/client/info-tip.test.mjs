// InfoTip: the help bubble is lifted into the top layer so it can extend past
// the Settings dialog, and stays inside the window (or, without the Popover
// API, inside the visible area of its clipping ancestors).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientHarness, nodes } from "../helpers/client-harness.mjs";

const VISIBLE = { overflow: "visible", overflowX: "visible", overflowY: "visible" };
const SCROLLS = { overflow: "auto", overflowX: "hidden", overflowY: "auto" };

/** Anchor inside a scrolling dialog body (pane) inside the page. */
function layout({ top, left = 150, paneTop = 100, paneBottom = 800 }) {
  const rect = { top, bottom: top + 16, left, right: left + 16 };
  const page = { style: VISIBLE, parentElement: null, getBoundingClientRect: () => ({ top: 0, bottom: 2000, left: 0, right: 2000 }) };
  const pane = { style: SCROLLS, parentElement: page, getBoundingClientRect: () => ({ top: paneTop, bottom: paneBottom, left: 0, right: 600 }) };
  const anchor = { style: VISIBLE, parentElement: pane, rect, getBoundingClientRect: () => ({ ...anchor.rect }) };
  return anchor;
}

/** A bubble element recording the attributes and styles InfoTip writes. */
function bubble({ width = 280, height = 120, popover = true } = {}) {
  const attrs = {};
  const pop = {
    attrs,
    style: {},
    scrollHeight: height,
    shown: false,
    setAttribute(name, value) { attrs[name] = String(value); },
    removeAttribute(name) { delete attrs[name]; },
    matches: () => pop.shown,
    getBoundingClientRect: () => ({ width, height }),
  };
  if (popover) pop.showPopover = () => { pop.shown = true; };
  return pop;
}

function view(innerHeight = 900, innerWidth = 1000) {
  const listeners = [];
  return {
    listeners,
    innerWidth,
    innerHeight,
    getComputedStyle: (node) => node.style,
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}

/** Mount an InfoTip, open it by click, and attach the fake elements. */
function openTip({ anchor, pop, win = view() }) {
  const client = clientHarness({ update: false, loading: false, view: win });
  const props = { t: (key) => key, text: "A long explanation that needs several lines." };
  let tree = client.rerender("InfoTip", props);
  tree.props.ref.current = anchor;
  client.flushEffects();
  nodes(tree, (n) => n.type === "button")[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  tree = client.rerender("InfoTip", props);
  const node = nodes(tree, (n) => n.props.role === "tooltip")[0];
  node.props.ref.current = pop;
  client.flushEffects();
  return { client, props, win, node };
}

describe("InfoTip in the top layer", () => {
  it("shows through the Popover API and extends past the clipping dialog body", () => {
    // Pane ends at 800 with 70 px below the button; the window has 170 px.
    const pop = bubble();
    const { node } = openTip({ anchor: layout({ top: 700 }), pop });
    assert.equal(node.props.className, "dcpa-info-pop");
    assert.equal(pop.attrs.popover, "manual");
    assert.equal(pop.shown, true);
    assert.equal(pop.attrs["data-layer"], "top");
    assert.equal(pop.attrs["data-place"], "below");
    assert.equal(pop.style.top, "722px");
    assert.equal(pop.style.left, "142px");
    assert.equal(pop.style.maxHeight, "");
  });

  it("flips above near the bottom of the window", () => {
    const pop = bubble();
    openTip({ anchor: layout({ top: 860 }), pop });
    assert.equal(pop.attrs["data-place"], "above");
    assert.equal(pop.style.top, `${860 - 6 - 120}px`);
  });

  it("shifts back inside the window horizontally", () => {
    const pop = bubble();
    openTip({ anchor: layout({ top: 200, left: 900 }), pop });
    assert.equal(pop.style.left, `${1000 - 280 - 8}px`);
  });

  it("caps and scrolls only when the whole window cannot hold the bubble", () => {
    const pop = bubble({ height: 400 });
    openTip({ anchor: layout({ top: 140 }), pop, win: view(300) });
    // 130 px below vs 126 px above: stays below, capped to the room.
    assert.equal(pop.attrs["data-place"], "below");
    assert.equal(pop.style.maxHeight, "130px");
    assert.equal(pop.style.overflowY, "auto");
    assert.equal(pop.style.top, "162px");
  });

  it("follows its button on scroll and removes its listeners when closed", () => {
    const anchor = layout({ top: 200 });
    const pop = bubble();
    const win = view();
    const { client, props } = openTip({ anchor, pop, win });
    const scroll = win.listeners.find((l) => l.type === "scroll");
    assert.equal(scroll.capture, true, "captures scrolls of inner panes");
    assert.ok(win.listeners.some((l) => l.type === "resize"));
    anchor.rect = { top: 300, bottom: 316, left: 150, right: 166 };
    scroll.fn();
    assert.equal(pop.style.top, "322px");
    const tree = client.rerender("InfoTip", props);
    nodes(tree, (n) => n.type === "button")[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
    client.rerender("InfoTip", props);
    assert.equal(win.listeners.length, 0);
  });
});

describe("InfoTip without the Popover API", () => {
  it("stays in place and flips above within the clipping dialog body", () => {
    const pop = bubble({ popover: false });
    openTip({ anchor: layout({ top: 700 }), pop });
    assert.equal(pop.attrs.popover, undefined);
    assert.equal(pop.attrs["data-layer"], "inline");
    // Only 70 px below inside the pane, so above; no fixed coordinates.
    assert.equal(pop.attrs["data-place"], "above");
    assert.equal(pop.attrs["data-align"], "start");
    assert.equal(pop.style.top, undefined);
  });
});
