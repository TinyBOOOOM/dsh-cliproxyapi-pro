// image-input media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseImageCommand } from "../../lib/media/index.js";

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
