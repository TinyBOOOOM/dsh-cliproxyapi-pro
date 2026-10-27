// images media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateImages, sniffImageType, upstreamMessage } from "../../lib/media/index.js";
import { PNG, JPEG } from "../helpers/media-images.mjs";

describe("image generation", () => {
  const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

  it("asks for b64_json, maps the aspect and returns sniffed images", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      return ok({ data: [{ b64_json: Buffer.from(PNG).toString("base64"), revised_prompt: "a fox" }, { b64_json: Buffer.from(JPEG).toString("base64") }] });
    };
    const images = await generateImages({ fetch: fetchImpl, rootURL: "http://cpa.test", apiKey: "sk-x", model: "grok-imagine-image", prompt: "fox", aspect: "3:2", count: 2 });
    assert.equal(calls[0].url, "http://cpa.test/v1/images/generations");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk-x");
    assert.deepEqual(JSON.parse(calls[0].init.body), { model: "grok-imagine-image", prompt: "fox", n: 2, response_format: "b64_json", aspect_ratio: "3:2", size: "1536x1024" });
    assert.deepEqual(images.map((i) => [i.mediaType, i.ext]), [["image/png", "png"], ["image/jpeg", "jpg"]]);
    assert.equal(images[0].revisedPrompt, "a fox");
  });

  it("edits with data-URL references and downloads URL results without the key", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith("https://img.test/")) return new Response(PNG, { status: 200 });
      return ok({ data: [{ url: "https://img.test/a.png" }, { url: `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}` }] });
    };
    const images = await generateImages({
      fetch: fetchImpl,
      rootURL: "http://cpa.test",
      apiKey: "sk-x",
      model: "gpt-image-2",
      prompt: "make it blue",
      aspect: "16:9",
      references: [{ mediaType: "image/png", data: PNG }],
    });
    assert.equal(calls[0].url, "http://cpa.test/v1/images/edits");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.aspect_ratio, "16:9");
    assert.equal(body.size, undefined, "no gpt-image size for 16:9");
    assert.match(body.images[0].image_url, /^data:image\/png;base64,/);
    assert.equal(calls[1].init.headers.Authorization, undefined, "result downloads carry no key");
    assert.deepEqual(images.map((i) => i.mediaType), ["image/png", "image/jpeg"]);
  });

  it("reports short, URL-free failures", async () => {
    const failing = async () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded, see https://x.ai/billing?key=1" } }), { status: 429 });
    await assert.rejects(
      generateImages({ fetch: failing, rootURL: "http://cpa.test", model: "m", prompt: "p" }),
      (e) => e.code === "upstream-error" && e.detail === "HTTP 429: quota exceeded, see [url]"
    );
    const notImage = async () => ok({ data: [{ b64_json: Buffer.from("hello").toString("base64") }] });
    await assert.rejects(generateImages({ fetch: notImage, rootURL: "http://cpa.test", model: "m", prompt: "p" }), (e) => e.code === "invalid-image");
    const httpUrl = async () => ok({ data: [{ url: "http://img.test/a.png" }] });
    await assert.rejects(generateImages({ fetch: httpUrl, rootURL: "http://cpa.test", model: "m", prompt: "p" }), (e) => e.code === "invalid-image");
    const empty = async () => ok({ data: [] });
    await assert.rejects(generateImages({ fetch: empty, rootURL: "http://cpa.test", model: "m", prompt: "p" }), (e) => e.code === "no-image");
    assert.equal(upstreamMessage("", 502), "HTTP 502");
    assert.equal(sniffImageType(Uint8Array.from([1, 2, 3])), undefined);
  });

  it("stops at once when the caller aborts", async () => {
    const controller = new AbortController();
    const hanging = (_url, init) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    const run = generateImages({ fetch: hanging, rootURL: "http://cpa.test", model: "m", prompt: "p", signal: controller.signal });
    controller.abort(new Error("stop"));
    await assert.rejects(run, /stop/);
  });
});
