// Recorded catalogs for recommendation tests: two real CPA servers (fields the
// plugin reads, no keys or addresses) and subsets of models.dev / OpenRouter.

import { readFileSync } from "node:fs";
import { parseCatalog } from "../../lib/index.js";
import { mergeListing } from "../../lib/host/discovery.js";
import { buildIndex, lookupModel, parseModelsDev, parseOpenRouter } from "../../lib/host/model-info.js";

export const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

/** The day the fixtures were recorded; staleness and end dates are relative to it. */
export const RECORDED = Date.parse("2026-11-11T00:00:00Z");

/** Parsed and merged catalog of a recorded server (`server-a`, `server-b`). */
export function catalog(name) {
  const f = read(`catalog-${name}.json`);
  const models = mergeListing(parseCatalog(f.enriched), new Map(parseCatalog(f.listing).map((m) => [m.id, m])));
  return { models, chat: models.filter((m) => (m.detectedKind ?? "chat") === "chat") };
}

export const modelsDevPayload = () => read("models-dev.json");
export const openRouterPayload = () => read("openrouter.json");

/** A lookup over both recorded online sources. */
export function onlineLookup() {
  const indexes = {
    modelsDev: buildIndex(parseModelsDev(modelsDevPayload())),
    openRouter: buildIndex(parseOpenRouter(openRouterPayload())),
  };
  return (model) => lookupModel(indexes, model);
}

/**
 * A fetch serving recorded CPA catalogs by host (`{ "b.test": "server-b" }`):
 * `?client_version=pi` gets the enriched catalog, plain `/v1/models` the listing.
 */
export function recordedFetch(hosts) {
  return async (url) => {
    const u = new URL(String(url));
    const name = hosts[u.host];
    if (name === undefined) throw new Error(`connect ECONNREFUSED ${u.host}`);
    const f = read(`catalog-${name}.json`);
    const body = u.searchParams.get("client_version") === "pi" ? f.enriched : f.listing;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}
