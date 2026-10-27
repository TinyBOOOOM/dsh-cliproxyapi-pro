// classification media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectMediaKind, effectiveKind, mediaAliasTarget } from "../../lib/media/index.js";

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
