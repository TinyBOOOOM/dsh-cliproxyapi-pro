// Fake CPA catalogs, keyed servers and account/media catalog fixtures.


export const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** A fake CPA: `?client_version=pi` returns the enriched catalog, plain `/v1/models` the owners. */
export function fakeCpa(models) {
  return async (url) =>
    String(url).includes("client_version=pi")
      ? json({ models: models.map(({ owned_by: _o, ...rest }) => rest) })
      : json({ data: models.map((m) => ({ id: m.slug, object: "model", owned_by: m.owned_by })) });
}

/** Two fake CPA servers keyed by host; each also checks the Bearer key. */
export function fakeServers(servers) {
  return async (url, init) => {
    const u = new URL(String(url));
    const server = servers[u.host];
    if (server === undefined) throw new Error(`connect ECONNREFUSED ${u.host}`);
    const auth = init?.headers?.Authorization;
    if (server.key !== undefined && auth !== `Bearer ${server.key}`) {
      return new Response("{}", { status: 401 });
    }
    return fakeCpa(server.models)(url);
  };
}

export const SERVERS = {
  "a.test": {
    key: "key-a",
    models: [
      { slug: "claude-opus-5-5", owned_by: "anthropic" },
      { slug: "gpt-6.1-sol", owned_by: "openai" },
    ],
  },
  "b.test": {
    key: "key-b",
    models: [
      { slug: "gemini-4-argon", owned_by: "google" },
      { slug: "gpt-6-astra", owned_by: "openai" },
    ],
  },
};

export const MEDIA_SERVERS = {
  "m.test": {
    key: "key-a",
    models: [
      { slug: "grok-4.6", owned_by: "xai" },
      { slug: "grok-imagine-image", owned_by: "xai" },
      { slug: "grok-imagine-video-1.5", owned_by: "xai" },
      { slug: "claude-opus-5-5", owned_by: "anthropic" },
    ],
  },
};
