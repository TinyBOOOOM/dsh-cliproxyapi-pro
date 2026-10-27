// Temporary-profile plugin mount, fake Host services/HTTP and background-run polling.

import { apply } from "../../lib/index.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Mount apply() against a temp profile with fake settings/credentials and the
 * given fetch. `extraServices` adds Host services to ctx.get(). Call
 * `dispose()` before the next mount (apply is mounted once per process).
 */
/** Poll a run's chat-row data until its background job has settled. */
export async function settledRun(m, sessionId, commandId) {
  for (let i = 0; i < 200; i++) {
    const row = await m.call("GET", `/api/dsh-cliproxyapi/media/command?sessionId=${sessionId}&commandId=${commandId}`);
    if (row.body?.run?.status !== "running") return row;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("the run did not settle");
}

export function mountPlugin({ state, fetchImpl, extraServices = {}, files = {}, dir: reuseDir }) {
  const dir = reuseDir ?? mkdtempSync(join(tmpdir(), "cpa-mount-"));
  const stateDir = join(dir, ".dsh-cliproxyapi");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "state.json"), JSON.stringify(state));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(stateDir, name), typeof content === "string" ? content : JSON.stringify(content));
  const providers = {};
  const creds = { CLI_PROXY_API_KEY: "key-a" };
  const disposers = [];
  const effects = new Map();
  const tools = [];
  const injected = [];
  const commands = [];
  const routes = new Map();
  const emitted = [];
  const listeners = {};
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  const ctx = {
    settings: {
      describe: () => [{ ns: "llm-pi-ai", value: { providers } }],
      mutate: async (_ns, ops) => {
        for (const op of ops) {
          if (op.op === "set") providers[op.path[1]] = op.value;
          else delete providers[op.path[1]];
        }
      },
    },
    get: (name) =>
      name === "profileContext"
        ? { dir }
        : name === "credentials"
        ? {
            resolve: async (ref) => (creds[ref] === undefined ? undefined : { value: creds[ref] }),
            describe: async (ref) => ({ configured: creds[ref] !== undefined, writable: true }),
            set: async () => {},
            unset: async () => {},
          }
        : extraServices[name],
    on: (event, fn) => ((listeners[event] ??= []).push(fn), () => {}),
    emit: (...args) => emitted.push(args),
    effect: (fn, name) => {
      const d = fn();
      if (typeof d === "function") {
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          d();
        };
        disposers.push(dispose);
        effects.set(name, dispose);
      }
    },
    inject: (deps, fn) => {
      injected.push(...deps);
      fn(sub);
    },
    logger: { info() {}, warn() {} },
  };
  const sub = {
    ...ctx,
    commands: { register: (c) => (commands.push(c), () => {}) },
    tools: {
      register: (t) => {
        tools.push(t);
        return () => {
          const at = tools.indexOf(t);
          if (at >= 0) tools.splice(at, 1);
        };
      },
    },
    webServer: { register: (r) => (routes.set(r.path, r.handler), () => {}) },
  };
  const call = async (method, path, payload) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = {
      method,
      url: path,
      headers: { host: "127.0.0.1:1" },
      async *[Symbol.asyncIterator]() {
        if (body !== "") yield Buffer.from(body);
      },
    };
    let sent;
    const res = {
      writeHead: (code, headers) => (sent = { code, headers }),
      end: (data) => {
        sent.raw = data;
        try {
          sent.body = JSON.parse(String(data));
        } catch {}
      },
    };
    await routes.get(new URL(path, "http://h").pathname)(req, res);
    return sent;
  };
  apply(ctx, {});
  return {
    dir,
    stateDir,
    providers,
    tools,
    injected,
    commands,
    call,
    routes,
    emitted,
    listeners,
    disposeEffect: (name) => effects.get(name)?.(),
    dispose() {
      globalThis.fetch = realFetch;
      for (const d of disposers) d();
    },
  };
}
