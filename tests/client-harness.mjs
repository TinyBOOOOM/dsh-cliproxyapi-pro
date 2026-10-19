// Minimal deterministic Hook renderer for this zero-dependency ModuleLoader client.
// This is a test fixture, not a React replacement shipped to users.
import vm from "node:vm";
import { readFileSync } from "node:fs";

export function clientHarness({ update = null, loading = true, fetch = async () => { throw new Error("fake fetch required"); } } = {}) {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, active = true, afterUnmountWrites = 0, nextTimer = 0;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    Fragment: Symbol("Fragment"),
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: index === 0 ? update : index === 1 ? loading : typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (value) => {
        if (!active) afterUnmountWrites++;
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value;
      }];
    },
    useRef(initial) { const i = cursor++; return (slots[i] ??= { current: initial }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) {
        slots[i]?.cleanup?.();
        slots[i] = { deps };
        effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
  };
  let exports;
  const context = {
    window: { __ModuleLoader__: { load({ factory }) { exports = factory((name) => { if (name !== "react") throw new Error(`unexpected require ${name}`); return React; }); } } },
    AbortController, Date, console, fetch,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8").replace("return module.exports;", "exports.__test = {PluginUpdatePanel, CpaSettingsPanel, CSS, zh, en}; return module.exports;");
  vm.runInNewContext(source, context, { filename: "client.js" });
  return {
    ...exports.__test, timers,
    render(language = "zh", mountEffects = true) {
      cursor = 0;
      const dictionary = exports.__test[language];
      const tree = exports.__test.PluginUpdatePanel({ t: (key) => dictionary[key] ?? key });
      if (mountEffects) for (const effect of effects.splice(0)) effect();
      return tree;
    },
    renderContainer() {
      cursor = 0;
      return exports.__test.CpaSettingsPanel({ t: (key) => exports.__test.zh[key] ?? key });
    },
    unmount() { active = false; for (const slot of slots) slot?.cleanup?.(); },
    get afterUnmountWrites() { return afterUnmountWrites; },
  };
}

export function nodes(tree, predicate) {
  if (tree === null || tree === undefined || typeof tree === "boolean" || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap((child) => nodes(child, predicate))];
}
export function content(tree) {
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return (tree.children ?? []).map(content).join("");
}
export const flushClient = () => new Promise((resolve) => setImmediate(resolve));

export function html(tree) {
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return escape(tree);
  const children = (tree.children ?? []).map(html).join("");
  if (typeof tree.type === "symbol") return children;
  if (typeof tree.type !== "string") throw new Error("Render the isolated update card only");
  const attrs = Object.entries(tree.props).flatMap(([key, value]) => {
    if (/^on[A-Z]/.test(key) || ["key", "children"].includes(key) || value === null || value === undefined || value === false && !key.startsWith("aria-")) return [];
    const name = key === "className" ? "class" : key;
    return [`${name}="${escape(value === true && !key.startsWith("aria-") ? "" : value)}"`];
  }).join(" ");
  return `<${tree.type}${attrs ? ` ${attrs}` : ""}>${children}</${tree.type}>`;
}
