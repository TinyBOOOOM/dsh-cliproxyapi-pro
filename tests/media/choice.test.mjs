// choice media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseMediaModel, matchMediaModel, mediaOptions } from "../../lib/media/index.js";

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
