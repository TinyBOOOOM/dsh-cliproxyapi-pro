import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyMediaPatch,
  chooseMediaModel,
  createMediaSessionStore,
  generateImages,
  matchMediaModel,
  mediaOptions,
  normalizeRun,
  parseVideoCommand,
  submitVideo,
  retrieveVideo,
  downloadVideo,
  sniffVideoType,
  createMediaJobStore,
  normalizeJob,
  videoState,
  outputDirectory,
  outputStem,
  parseImageCommand,
  recentEntry,
  sniffImageType,
  upstreamMessage,
  writeOutputFiles,
  defaultMediaSettings,
  detectMediaKind,
  diagnoseMedia,
  effectiveKind,
  loadMediaSettings,
  mediaAliasTarget,
  MediaError,
  mediaModelEnabled,
  normalizeMediaSettings,
  saveMediaSettings,
  summarizeCatalogForMedia,
} from "../lib/media.js";

describe("media classification", () => {
  it("uses catalog type and output modalities before CPA's model families", () => {
    assert.equal(detectMediaKind({ id: "anything", catalogType: "openai-image" }), "image");
    assert.equal(detectMediaKind({ id: "anything", outputModalities: ["video"] }), "video");
    assert.equal(detectMediaKind({ id: "anything", outputModalities: ["image"] }), "image");
    // A chat model that can also emit images stays a chat model.
    assert.equal(detectMediaKind({ id: "gemini-4-argon", outputModalities: ["text", "image"] }), "chat");
    assert.equal(detectMediaKind({ id: "grok-imagine-image" }), "image");
    assert.equal(detectMediaKind({ id: "xai/grok-imagine-image-quality" }), "image");
    assert.equal(detectMediaKind({ id: "gpt-image-2.5-flare" }), "image");
    assert.equal(detectMediaKind({ id: "grok-imagine-video-1.5" }), "video");
    // Real BCPA catalog: a variant CPA's video handler does not accept yet is still no chat model.
    assert.equal(detectMediaKind({ id: "grok-imagine-video-1.5-lite" }), "video");
    assert.equal(detectMediaKind({ id: "gpt-image-3" }), "image");
    // Gemini image models answer through chat on CPA; they stay chat models.
    assert.equal(detectMediaKind({ id: "gemini-3.1-flash-image" }), "chat");
    assert.equal(detectMediaKind({ id: "sora-2-pro" }), "video");
    assert.equal(detectMediaKind({ id: "grok-4.6" }), "chat");
    assert.equal(detectMediaKind({ id: "gpt-6-astra" }), "chat");
    assert.equal(detectMediaKind({ id: "sora-20" }), "chat");
  });

  it("reports the Sora alias and lets a valid override win", () => {
    assert.equal(mediaAliasTarget("sora-2"), "grok-imagine-video");
    assert.equal(mediaAliasTarget("grok-imagine-video"), undefined);
    const model = { id: "grok-imagine-image", detectedKind: "image" };
    assert.equal(effectiveKind(model, {}), "image");
    assert.equal(effectiveKind(model, { "grok-imagine-image": "chat" }), "chat");
    assert.equal(effectiveKind(model, { "grok-imagine-image": "audio" }), "image");
  });
});

describe("media settings", () => {
  it("normalizes tolerantly with the agreed defaults", () => {
    const defaults = defaultMediaSettings();
    assert.equal(defaults.agentTool, false);
    assert.equal(defaults.videoConfirm, "ask");
    assert.equal(defaults.imageConfirm, "auto");
    assert.deepEqual(defaults.videoBudget, { mode: "limited", seconds: 60 });
    assert.equal(defaults.defaultVideoSeconds, 6);
    assert.equal(defaults.defaultVideoResolution, "720p");
    assert.equal(defaults.outputDir, "generated");
    const odd = normalizeMediaSettings({
      agentTool: "yes",
      defaultVideoSeconds: 30,
      defaultVideoResolution: "1080p",
      videoBudget: { mode: "limited", seconds: 0 },
      lastSelection: { image: "default/grok-imagine-image", video: "no-slash" },
      accounts: { "bad id": {}, default: { disabledModels: ["a", "a", 3], kindOverrides: { x: "video", y: "audio" } } },
      extra: true,
    });
    assert.equal(odd.agentTool, false);
    assert.equal(odd.defaultVideoSeconds, 6);
    assert.equal(odd.defaultVideoResolution, "720p");
    assert.deepEqual(odd.videoBudget, { mode: "limited", seconds: 60 });
    assert.deepEqual(odd.lastSelection, { image: "default/grok-imagine-image" });
    assert.deepEqual(Object.keys(odd.accounts), ["default"]);
    assert.deepEqual(odd.accounts.default, { disabledModels: ["a"], kindOverrides: { x: "video" } });
    assert.equal("extra" in odd, false);
    assert.deepEqual(normalizeMediaSettings(odd), odd);
  });

  it("rejects invalid patch values with stable codes and reports kind changes", () => {
    const base = defaultMediaSettings();
    const code = (patch) => {
      try {
        applyMediaPatch(base, patch);
        return "ok";
      } catch (error) {
        assert.ok(error instanceof MediaError);
        return error.code;
      }
    };
    assert.equal(code({ defaultVideoSeconds: 16 }), "invalid-video-seconds");
    assert.equal(code({ defaultVideoSeconds: 0 }), "invalid-video-seconds");
    assert.equal(code({ defaultVideoResolution: "1080p" }), "invalid-video-resolution");
    assert.equal(code({ videoConfirm: "never" }), "invalid-confirm-mode");
    assert.equal(code({ videoBudget: { mode: "limited", seconds: 3601 } }), "invalid-video-budget");
    assert.equal(code({ outputDir: "  " }), "invalid-output-dir");
    assert.equal(code({ agentTool: 1 }), "invalid-agent-tool");
    assert.equal(code({ account: { accountId: "bad id" } }), "invalid-account");
    assert.equal(code({ account: { accountId: "default", kindOverrides: { x: "audio" } } }), "invalid-kind");
    assert.equal(code({ account: { accountId: "default", disabledModels: "x" } }), "invalid-model-list");
    assert.equal(code({ surprise: 1 }), "invalid-request");
    assert.equal(code({ videoBudget: { mode: "unlimited" }, defaultVideoSeconds: 15, defaultVideoResolution: "480p" }), "ok");

    const first = applyMediaPatch(base, { account: { accountId: "default", kindOverrides: { "my-model": "image" } } });
    assert.equal(first.kindsChanged, "default");
    assert.deepEqual(first.settings.accounts.default.kindOverrides, { "my-model": "image" });
    const same = applyMediaPatch(first.settings, { account: { accountId: "default", kindOverrides: { "my-model": "image" } } });
    assert.equal(same.kindsChanged, undefined, "an unchanged override needs no re-sync");
    const removed = applyMediaPatch(first.settings, { account: { accountId: "default", kindOverrides: { "my-model": null } } });
    assert.equal(removed.kindsChanged, "default");
    assert.deepEqual(removed.settings.accounts.default.kindOverrides, {});

    const off = applyMediaPatch(base, { account: { accountId: "default", disabledModels: ["grok-imagine-video"] } });
    assert.equal(off.kindsChanged, undefined);
    assert.equal(mediaModelEnabled(off.settings, "default", "grok-imagine-video"), false);
    assert.equal(mediaModelEnabled(off.settings, "default", "grok-imagine-image"), true, "new models start on");
    assert.equal(mediaModelEnabled(off.settings, "other", "grok-imagine-video"), true);
  });

  it("loads missing files as defaults and keeps a copy of a damaged file on save", () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-media-"));
    const file = join(dir, "media-settings.json");
    assert.deepEqual(loadMediaSettings(file), { settings: defaultMediaSettings() });
    writeFileSync(file, "{ not json");
    const damaged = loadMediaSettings(file);
    assert.equal(damaged.error, "invalid-file");
    assert.deepEqual(damaged.settings, defaultMediaSettings());
    saveMediaSettings(file, { ...defaultMediaSettings(), agentTool: true });
    assert.equal(loadMediaSettings(file).settings.agentTool, true);
    const names = readdirSync(dir);
    assert.ok(names.some((n) => /^media-settings\.corrupt-.+\.json$/.test(n)), names.join(", "));
    assert.equal(readFileSync(join(dir, names.find((n) => n.includes("corrupt"))), "utf8"), "{ not json");
    assert.ok(!names.some((n) => n.endsWith(".tmp")));
  });
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe("model choice", () => {
  const accounts = [
    {
      id: "default",
      displayName: "BCPA",
      enabled: true,
      models: [
        { id: "grok-imagine-image", kind: "image" },
        { id: "grok-imagine-image-quality", kind: "image" },
        { id: "grok-imagine-video", kind: "video" },
      ],
    },
    { id: "account-2", displayName: "ZZ", enabled: true, models: [{ id: "grok-imagine-image", kind: "image" }, { id: "gpt-image-2", kind: "image" }] },
    { id: "account-3", displayName: "Off", enabled: false, models: [{ id: "gpt-image-2.5", kind: "image" }] },
  ];
  const settings = { accounts: { "account-2": { disabledModels: ["gpt-image-2"], kindOverrides: {} } } };

  it("offers enabled image models of enabled accounts only", () => {
    const options = mediaOptions(accounts, settings, "image");
    assert.deepEqual(options.map((o) => o.ref), ["default/grok-imagine-image", "default/grok-imagine-image-quality", "account-2/grok-imagine-image"]);
    assert.equal(options[2].accountName, "ZZ");
    assert.deepEqual(mediaOptions(accounts, settings, "video").map((o) => o.ref), ["default/grok-imagine-video"]);
  });

  it("matches a ref, an exact id or a unique fragment and never guesses", () => {
    const options = mediaOptions(accounts, settings, "image");
    assert.equal(matchMediaModel(options, "account-2/grok-imagine-image").accountId, "account-2");
    assert.equal(matchMediaModel(options, "QUALITY").modelId, "grok-imagine-image-quality");
    assert.throws(() => matchMediaModel(options, "grok-imagine-image"), (e) => e.code === "model-ambiguous" && e.detail.includes("account-2/"));
    assert.throws(() => matchMediaModel(options, "imagine"), (e) => e.code === "model-ambiguous");
    assert.throws(() => matchMediaModel(options, "dall-e"), (e) => e.code === "model-not-found");
  });

  it("prefers the request, then the session, then the last pick, then the only option", () => {
    const options = mediaOptions(accounts, settings, "image");
    const pick = (input) => {
      const { option, source } = chooseMediaModel({ options, ...input });
      return `${source}:${option.ref}`;
    };
    assert.equal(pick({ requested: "quality", sessionRef: "account-2/grok-imagine-image" }), "request:default/grok-imagine-image-quality");
    assert.equal(pick({ sessionRef: "account-2/grok-imagine-image", lastRef: "default/grok-imagine-image" }), "session:account-2/grok-imagine-image");
    assert.equal(pick({ sessionRef: "gone/model", lastRef: "default/grok-imagine-image" }), "last:default/grok-imagine-image");
    assert.throws(() => chooseMediaModel({ options }), (e) => e.code === "choose-model");
    assert.equal(chooseMediaModel({ options: options.slice(0, 1) }).source, "only");
    assert.throws(() => chooseMediaModel({ options: [] }), (e) => e.code === "no-media-model");
  });
});

describe("/cpa-image input", () => {
  it("parses leading options and keeps the prompt verbatim", () => {
    assert.deepEqual(parseImageCommand("  a red fox -n 3 in snow"), { prompt: "a red fox -n 3 in snow" });
    assert.deepEqual(parseImageCommand("-m quality --aspect 16:9 -n 2 一只橘猫"), { model: "quality", aspect: "16:9", count: 2, prompt: "一只橘猫" });
    assert.deepEqual(parseImageCommand("--model=xai/grok-imagine-image -- --not-an-option"), { model: "xai/grok-imagine-image", prompt: "--not-an-option" });
    const code = (input) => {
      try {
        parseImageCommand(input);
        return "ok";
      } catch (error) {
        return error.code;
      }
    };
    assert.equal(code(""), "missing-prompt");
    assert.equal(code("-m quality"), "missing-prompt");
    assert.equal(code("--aspect 5:4 cat"), "invalid-aspect");
    assert.equal(code("-n 5 cat"), "invalid-count");
    assert.equal(code("--size 1024 cat"), "invalid-option");
  });
});

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

describe("output files and session store", () => {
  it("names files safely and never replaces an existing file", () => {
    const date = new Date(2026, 9, 22, 13, 5, 9);
    assert.equal(outputStem("xai/Grok-Imagine-Image", "一只橘猫 在雨夜的霓虹街头 / <test>", date), "20261022-130509-grok-imagine-image-一只橘猫-在雨夜的霓虹街头-test");
    assert.equal(outputStem("m", "???", date), "20261022-130509-m-media");
    const dir = mkdtempSync(join(tmpdir(), "cpa-out-"));
    assert.equal(outputDirectory(dir, "generated"), join(dir, "generated"));
    assert.equal(outputDirectory(dir, dir), dir);
    const target = join(dir, "generated");
    const first = writeOutputFiles(target, "stem", [{ bytes: PNG, ext: "png" }]);
    const second = writeOutputFiles(target, "stem", [{ bytes: JPEG, ext: "png" }]);
    assert.notEqual(first[0], second[0]);
    assert.deepEqual([...readFileSync(first[0])], [...PNG], "the first file is untouched");
    const many = writeOutputFiles(target, "multi", [{ bytes: PNG, ext: "png" }, { bytes: PNG, ext: "png" }]);
    assert.deepEqual(many.map((p) => p.slice(target.length + 1)), ["multi-1.png", "multi-2.png"]);
  });

  it("keeps picks and the newest outputs per session, and survives a damaged file", () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-sessions-"));
    const file = join(dir, "media-sessions.json");
    const store = createMediaSessionStore(file);
    assert.deepEqual(store.get("s-1"), { recent: [], runs: [], updatedAt: "" });
    store.update("s-1", (entry) => {
      entry.image = "default/grok-imagine-image";
      entry.recent = Array.from({ length: 50 }, (_v, i) => recentEntry("image", join(dir, `${i}.png`), "default/m", new Date(), i === 0 ? "cmd-x-1" : "bad id!"));
    });
    const saved = store.get("s-1");
    assert.equal(saved.image, "default/grok-imagine-image");
    assert.equal(saved.recent.length, 48);
    assert.equal(saved.recent[0].file, join(dir, "0.png"), "newest first, oldest dropped");
    assert.equal(saved.recent[0].commandId, "cmd-x-1");
    assert.equal("commandId" in saved.recent[1], false, "an invalid command id is not stored");
    assert.throws(() => store.update("../evil", () => {}), (e) => e.code === "invalid-session");
    writeFileSync(file, "{ broken");
    assert.deepEqual(store.get("s-1").recent, []);
    store.update("s-2", (entry) => {
      entry.video = "default/grok-imagine-video";
    });
    assert.ok(readdirSync(dir).some((n) => n.startsWith("media-sessions.corrupt-")));
    assert.equal(store.get("s-2").video, "default/grok-imagine-video");
  });

  it("keeps generation runs as display records only", () => {
    const run = normalizeRun({
      commandId: "cmd-x-1",
      kind: "image",
      status: "done",
      model: "default/m",
      prompt: "p".repeat(5000),
      aspect: "16:9",
      count: 2,
      references: 1,
      files: 2,
      startedAt: "2026-10-22T07:00:00.000Z",
      folder: "generated",
      errorCode: "Bad Code",
      apiKey: "secret",
      file: "C:\\x\\a.png",
    });
    assert.equal(run.prompt.length, 4000);
    assert.equal(run.aspect, "16:9");
    assert.equal(run.errorCode, undefined, "codes are lowercase words");
    assert.equal("apiKey" in run || "file" in run, false, "unknown fields are dropped");
    assert.equal(normalizeRun({ ...run, status: "weird" }), undefined);
    assert.equal(normalizeRun({ ...run, commandId: "bad id" }), undefined);
    assert.equal(normalizeRun({ ...run, aspect: "7:5", count: 9 }).count, 1);
    const dir = mkdtempSync(join(tmpdir(), "cpa-runs-"));
    const store = createMediaSessionStore(join(dir, "media-sessions.json"));
    store.update("s-1", (entry) => {
      entry.runs = Array.from({ length: 50 }, (_v, i) => ({ ...run, commandId: `cmd-x-${i}` })).concat([{ ...run, commandId: "cmd-x-0" }]);
    });
    const runs = store.get("s-1").runs;
    assert.equal(runs.length, 48);
    assert.equal(runs[0].commandId, "cmd-x-0");
  });
});

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

describe("video generation", () => {
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(32, 7)]);

  it("parses /cpa-video options and rejects bad ones", () => {
    assert.deepEqual(parseVideoCommand("-m grok --aspect 9:16 -s 8 -r 480P a cat surfing"), { model: "grok", aspect: "9:16", seconds: 8, resolution: "480p", prompt: "a cat surfing" });
    assert.deepEqual(parseVideoCommand("-- -s is part of the prompt"), { prompt: "-s is part of the prompt" });
    assert.throws(() => parseVideoCommand("-s 16 x"), (e) => e.code === "invalid-video-seconds");
    assert.throws(() => parseVideoCommand("-s 0 x"), (e) => e.code === "invalid-video-seconds");
    assert.throws(() => parseVideoCommand("-r 1080p x"), (e) => e.code === "invalid-video-resolution");
    assert.throws(() => parseVideoCommand("--aspect 9:20 x"), (e) => e.code === "invalid-aspect");
    assert.throws(() => parseVideoCommand("-n 2 x"), (e) => e.code === "invalid-option");
    assert.throws(() => parseVideoCommand("-s 4"), (e) => e.code === "missing-prompt");
  });

  it("submits through the native route with the alias resolved and only the given options", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => (calls.push({ url, init }), new Response(JSON.stringify({ request_id: "req-1" })));
    const result = await submitVideo({ fetch: fetchImpl, rootURL: "http://cpa.test", apiKey: "k", model: "sora-2-pro", prompt: "waves", seconds: 6, resolution: "720p" });
    assert.deepEqual(result, { requestId: "req-1" });
    assert.equal(calls[0].url, "http://cpa.test/v1/videos/generations");
    assert.equal(calls[0].init.headers.Authorization, "Bearer k");
    assert.deepEqual(JSON.parse(calls[0].init.body), { model: "grok-imagine-video", prompt: "waves", duration: 6, resolution: "720p" });
    await submitVideo({ fetch: fetchImpl, rootURL: "http://cpa.test", model: "grok-imagine-video-1.5", prompt: "p", seconds: 4, aspect: "1:1", image: { mediaType: "image/png", data: new Uint8Array([1, 2]) } });
    const body = JSON.parse(calls[1].init.body);
    assert.equal(body.aspect_ratio, "1:1");
    assert.equal(body.image.url, "data:image/png;base64,AQI=");
    assert.equal(calls[1].init.headers.Authorization, undefined, "no key, no header");
    await assert.rejects(
      submitVideo({ fetch: async () => new Response(JSON.stringify({ error: { message: "Model x is not supported, see https://x" } }), { status: 400 }), rootURL: "http://c", model: "x", prompt: "p", seconds: 4 }),
      (e) => e.code === "upstream-error" && e.detail === "HTTP 400: Model x is not supported, see [url]"
    );
    await assert.rejects(submitVideo({ fetch: async () => new Response("{}"), rootURL: "http://c", model: "x", prompt: "p", seconds: 4 }), (e) => e.code === "invalid-response");
  });

  it("maps CPA / xAI states and never returns the video URL", async () => {
    const answer = (payload, status = 200) => async () => new Response(JSON.stringify(payload), { status });
    const base = { rootURL: "http://c", requestId: "req-1" };
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "pending" }) }), { state: "queued" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "processing", progress: 41.6 }) }), { state: "running", progress: 42 });
    const done = await retrieveVideo({ ...base, fetch: answer({ status: "done", video: { url: "https://vidgen.x.ai/secret.mp4", duration: 6 } }) });
    assert.deepEqual(done, { state: "done", seconds: 6 });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ video: { url: "https://v/x.mp4" } }) }), { state: "done" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ status: "expired" }) }), { state: "failed", error: "the video could not be generated" });
    assert.deepEqual(await retrieveVideo({ ...base, fetch: answer({ error: { message: "moderated, see https://x.ai/p" } }) }), { state: "failed", error: "moderated, see [url]" });
    await assert.rejects(retrieveVideo({ ...base, fetch: answer({ error: { message: "gone" } }, 404) }), (e) => e.code === "upstream-error" && e.status === 404);
    assert.equal(videoState("succeeded"), "done");
    assert.equal(videoState("weird"), undefined);
  });

  it("streams the download into a new file, recognizes the container and enforces the size limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-video-"));
    const calls = [];
    const serve = (bytes, headers = {}) => async (url, init) => (calls.push({ url, auth: init.headers.Authorization }), new Response(bytes, { headers }));
    const first = await downloadVideo({ fetch: serve(MP4), rootURL: "http://c", apiKey: "k", requestId: "req 1", dir, stem: "clip" });
    assert.equal(first, join(dir, "clip.mp4"));
    assert.deepEqual([...readFileSync(first)], [...MP4]);
    assert.equal(calls[0].url, "http://c/openai/v1/videos/req%201/content", "downloaded through CPA, never from the upstream host");
    assert.equal(calls[0].auth, "Bearer k");
    const second = await downloadVideo({ fetch: serve(MP4), rootURL: "http://c", requestId: "r", dir, stem: "clip" });
    assert.equal(second, join(dir, "clip-2.mp4"), "never replaces a file");
    await assert.rejects(downloadVideo({ fetch: serve(Buffer.from("<html>nope</html> padding padding")), rootURL: "http://c", requestId: "r", dir, stem: "bad" }), (e) => e.code === "invalid-video");
    await assert.rejects(downloadVideo({ fetch: serve(MP4), rootURL: "http://c", requestId: "r", dir, stem: "big", maxBytes: 20 }), (e) => e.code === "video-too-large");
    await assert.rejects(downloadVideo({ fetch: serve(MP4, { "content-length": "999999999" }), rootURL: "http://c", requestId: "r", dir, stem: "big2" }), (e) => e.code === "video-too-large");
    assert.deepEqual(readdirSync(dir).sort(), ["clip-2.mp4", "clip.mp4"], "nothing partial is left behind");
    await assert.rejects(
      downloadVideo({ fetch: async () => new Response("not ready", { status: 502 }), rootURL: "http://c", requestId: "r", dir, stem: "x" }),
      (e) => e.code === "upstream-error" && e.detail === "HTTP 502: not ready"
    );
    assert.deepEqual(sniffVideoType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0])), { mediaType: "video/webm", ext: "webm" });
  });

  it("keeps video jobs without keys or URLs, merges updates and drops old finished jobs", () => {
    const dir = mkdtempSync(join(tmpdir(), "cpa-jobs-"));
    let clock = Date.parse("2026-10-22T08:00:00Z");
    const store = createMediaJobStore(join(dir, "media-jobs.json"), { now: () => clock });
    const job = { id: "req-1", state: "submitted", accountId: "default", modelId: "grok-imagine-video", ref: "default/grok-imagine-video", sessionId: "s-1", commandId: "cmd-a-1", cwd: dir, outputDir: "generated", prompt: "p", seconds: 6, submittedAt: new Date(clock).toISOString(), apiKey: "secret", url: "https://x" };
    const saved = store.put(job);
    assert.equal("apiKey" in saved || "url" in saved, false);
    assert.equal(store.put({ ...saved, state: "done", finishedAt: new Date(clock).toISOString() }).state, "done");
    assert.equal(store.list().length, 1);
    assert.equal(normalizeJob({ ...job, cwd: "relative" }), undefined);
    assert.equal(normalizeJob({ ...job, id: "bad id" }), undefined);
    clock += 8 * 24 * 60 * 60 * 1000;
    assert.equal(store.list().length, 0, "finished jobs are kept 7 days");
    writeFileSync(join(dir, "media-jobs.json"), "{ broken");
    assert.deepEqual(store.list(), []);
    store.put({ ...job, id: "req-2", submittedAt: new Date(clock).toISOString() });
    assert.ok(readdirSync(dir).some((n) => n.startsWith("media-jobs.corrupt-")));
  });
});