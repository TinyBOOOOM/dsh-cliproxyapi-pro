// diagnose media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseMedia, summarizeCatalogForMedia } from "../../lib/media/index.js";

describe("media diagnostic", () => {
  it("summarizes media-looking catalog entries with fixed fields only", () => {
    const summary = summarizeCatalogForMedia({
      data: [
        { id: "grok-4.6", object: "model" },
        { id: "grok-imagine-image", object: "model", type: "openai-image", owned_by: "xai", secret: "do-not-copy" },
        { id: "custom-video-x", object: "model" },
      ],
    });
    assert.equal(summary.count, 3);
    assert.deepEqual(summary.media.map((m) => [m.id, m.kind]), [["grok-imagine-image", "image"], ["custom-video-x", "chat"]]);
    assert.deepEqual(summary.media[0].fields, { type: "openai-image", object: "model", owned_by: "xai" });
    assert.ok(summary.media[0].keys.includes("secret"), "field names are listed");
    assert.ok(!JSON.stringify(summary).includes("do-not-copy"), "other values are not copied");
    assert.equal(summarizeCatalogForMedia({ nope: [] }), undefined);
  });

  it("sends only GET requests, probes routes without the key and never returns it", async () => {
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push({ url: String(url), method: init.method, auth: init.headers?.Authorization });
      const path = new URL(String(url)).pathname;
      if (path === "/v1/models") {
        if (init.headers?.Authorization !== "Bearer sk-secret") return new Response("{}", { status: 401 });
        return new Response(JSON.stringify({ data: [{ id: "grok-imagine-video", object: "model" }] }), { status: 200 });
      }
      if (path.startsWith("/v1/videos/")) return new Response('{"error":"Missing API key"}', { status: 401 });
      return new Response("404 page not found", { status: 404 });
    };
    const result = await diagnoseMedia({ fetch: fakeFetch, rootURL: "http://cpa.test", apiKey: "sk-secret" });
    assert.ok(calls.every((c) => c.method === "GET"));
    const probes = calls.filter((c) => c.url.includes("dsh-diagnostic-probe"));
    assert.equal(probes.length, 2);
    assert.ok(probes.every((c) => c.auth === undefined), "route probes carry no key");
    assert.equal(result.catalogs.enriched.ok, true);
    assert.equal(result.catalogs.listing.media[0].kind, "video");
    assert.deepEqual(result.routes.map((r) => r.verdict), ["present", "missing"]);
    assert.ok(!JSON.stringify(result).includes("sk-secret"));
  });
});
