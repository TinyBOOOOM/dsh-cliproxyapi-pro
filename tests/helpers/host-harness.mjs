// In-memory multi-account settings, credentials and controller fixture.

import { normalizeState, createCpaController } from "../../lib/index.js";
import { fakeServers } from "./host-catalog.mjs";

export function harness(initialState, servers, extraDeps = {}) {
  let state = normalizeState(initialState);
  const providers = {};
  const keys = { CLI_PROXY_API_KEY: "key-a" };
  const controller = createCpaController({
    settings: {
      mutate: async (ns, ops) => {
        if (ns !== "llm-pi-ai") return;
        for (const op of ops) {
          if (op.op === "set") providers[op.path[1]] = op.value;
          else delete providers[op.path[1]];
        }
      },
    },
    readState: () => state,
    writeState: (next) => {
      state = next;
    },
    resolveApiKey: async (ref) => keys[ref],
    describeApiKey: async (ref) => ({ configured: keys[ref] !== undefined, writable: true }),
    setCredential: async (ref, value) => {
      keys[ref] = value;
    },
    unsetCredential: async (ref) => {
      delete keys[ref];
    },
    readExistingPiAiRoute: (key) => providers[key],
    fetch: fakeServers(servers),
    ...extraDeps,
  });
  return { controller, providers, keys, state: () => state };
}
