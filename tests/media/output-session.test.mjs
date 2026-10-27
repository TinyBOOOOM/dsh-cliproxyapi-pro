// output-session media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaSessionStore, normalizeRun, outputDirectory, outputStem, recentEntry, writeOutputFiles } from "../../lib/media/index.js";
import { PNG, JPEG } from "../helpers/media-images.mjs";

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
