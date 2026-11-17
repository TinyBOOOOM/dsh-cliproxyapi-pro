// Prompt sanitizing: phrase replacement, assembly copying and per-account routing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SANITIZE_REPLACEMENT,
  sanitizeReplacement,
  sanitizePromptText,
  sanitizeAssembly,
  patchAccount,
  resolveConfig,
} from "../../lib/index.js";
import { accountPatchFromInput } from "../../lib/host/apply-utils.js";
import { harness } from "../helpers/host-harness.mjs";

describe("prompt sanitize", () => {
  it("replaces every phrase occurrence with the default neutral text", () => {
    assert.equal(
      sanitizePromptText("You are an AI agent powered by DeepSeek Harness."),
      "You are an AI agent powered by Custom Harness."
    );
    assert.equal(
      sanitizePromptText("The runtime context names the DeepSeek Harness implementation checkout."),
      "The runtime context names the Custom Harness implementation checkout."
    );
    assert.equal(
      sanitizePromptText("You are interacting with the user through the DeepSeek Harness Web GUI."),
      "You are interacting with the user through the Custom Harness Web GUI."
    );
    assert.equal(
      sanitizePromptText("DeepSeek Harness and deepseek\n harness"),
      `${DEFAULT_SANITIZE_REPLACEMENT} and ${DEFAULT_SANITIZE_REPLACEMENT}`
    );
  });

  it("removes the context-triggered browser sentence from the real web-surface paragraph", () => {
    const guidance =
      'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. ' +
      "The browser provides no implicit DOM, route, or screenshot context. " +
      "The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while";
    const paragraph = `You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names. ${guidance}`;
    assert.equal(
      sanitizePromptText(paragraph),
      "You are interacting with the user through the Custom Harness Web GUI whose URL the runtime context names. " +
        'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. ' +
        "The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while"
    );
    // Line boundaries leave no dangling spaces; whitespace/case variants still match.
    assert.equal(
      sanitizePromptText("A.\nThe browser provides no implicit DOM, route, or screenshot context.\nB."),
      "A.\n\nB."
    );
    assert.equal(sanitizePromptText("the  BROWSER provides no implicit DOM, route,\nor screenshot context."), "");
    // Only the whole sentence is removed; fragments survive.
    assert.equal(sanitizePromptText("The browser provides no implicit DOM."), "The browser provides no implicit DOM.");
  });

  it("honors a custom replacement verbatim, including $-sequences", () => {
    assert.equal(
      sanitizePromptText("powered by DeepSeek Harness.", "Codex"),
      "powered by Codex."
    );
    assert.equal(
      sanitizePromptText("powered by DeepSeek Harness.", "$&-tool"),
      "powered by $&-tool."
    );
    assert.equal(
      sanitizePromptText("You are an AI agent powered by DeepSeek Harness.", "You are a helpful assistant"),
      "You are an AI agent powered by You are a helpful assistant."
    );
    assert.equal(sanitizePromptText("powered by DeepSeek", "Codex"), "powered by DeepSeek");
    assert.equal(sanitizePromptText("powered by Harness"), "powered by Harness");
    assert.equal(sanitizePromptText("You are Claude Code"), "You are Claude Code");
  });

  it("resolves blank or missing replacements to the default", () => {
    assert.equal(sanitizeReplacement(undefined), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(sanitizeReplacement(""), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(sanitizeReplacement("   "), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(sanitizeReplacement(" Codex "), "Codex");
    assert.equal(sanitizeReplacement(7), DEFAULT_SANITIZE_REPLACEMENT);
  });

  it("sanitizes sections, contexts and variables without mutating a frozen assembly", () => {
    const assembly = Object.freeze({
      sections: Object.freeze([
        Object.freeze({ name: "harness:identity", order: -1000, text: "You are an AI agent powered by DeepSeek Harness." }),
        Object.freeze({ name: "other", order: 0, text: "plain text" }),
      ]),
      contexts: Object.freeze([
        Object.freeze({ name: "harness:source", order: 200, text: "The DeepSeek Harness implementation checkout." }),
      ]),
      variables: Object.freeze({ provider: "cli-proxy", path: "D:\\DeepSeek Harness\\app.asar" }),
      tools: Object.freeze([{ name: "read" }]),
    });
    const sanitized = sanitizeAssembly(assembly, "Codex");
    assert.notEqual(sanitized, assembly);
    assert.equal(sanitized.sections[0].text, "You are an AI agent powered by Codex.");
    assert.equal(sanitized.sections[0].name, "harness:identity");
    assert.equal(sanitized.contexts[0].text, "The Codex implementation checkout.");
    assert.equal(sanitized.variables.path, "D:\\Codex\\app.asar");
    assert.equal(sanitized.variables.provider, "cli-proxy");
    assert.equal(sanitized.tools, assembly.tools);
    // Input untouched.
    assert.equal(assembly.sections[0].text, "You are an AI agent powered by DeepSeek Harness.");
    // Blank custom replacement falls back to the default inside the assembly too.
    const fallback = sanitizeAssembly(assembly, "   ");
    assert.equal(fallback.sections[0].text, `You are an AI agent powered by ${DEFAULT_SANITIZE_REPLACEMENT}.`);
  });

  it("returns the identical assembly when nothing matches", () => {
    const assembly = {
      sections: [{ name: "a", order: 0, text: "plain" }],
      contexts: [],
      variables: { provider: "cli-proxy" },
    };
    assert.equal(sanitizeAssembly(assembly), assembly);
    const malformed = { sections: "not-an-array" };
    assert.equal(sanitizeAssembly(malformed), malformed);
    assert.equal(sanitizeAssembly(null), null);
  });

  it("maps sanitize-enabled accounts to all their managed route keys and replacements", () => {
    const { controller } = harness({
      accounts: [
        { id: "a", provider: "cli-proxy", sanitizePrompt: true },
        { id: "b", provider: "cli-proxy-2", sanitizePrompt: true, sanitizePromptReplacement: "Codex" },
        { id: "c", provider: "cli-proxy-3", sanitizePrompt: false, sanitizePromptReplacement: "Codex" },
      ],
    });
    const routes = controller.sanitizePromptRoutes();
    assert.equal(routes.size, 6);
    assert.equal(routes.get("cli-proxy"), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(routes.get("cli-proxy-responses"), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(routes.get("cli-proxy-2-messages"), "Codex");
    assert.equal(routes.has("cli-proxy-3"), false);
  });

  it("keeps the flag and replacement through account patching and HTTP input", () => {
    const base = { id: "default", provider: "cli-proxy", apiKeyEnv: "CLI_PROXY_API_KEY" };
    const patched = patchAccount(base, { sanitizePrompt: true, sanitizePromptReplacement: " Codex " });
    assert.equal(patched.sanitizePrompt, true);
    assert.equal(patched.sanitizePromptReplacement, "Codex");
    // Clearing the replacement removes the field so the default applies again.
    const cleared = patchAccount(patched, { sanitizePromptReplacement: "" });
    assert.equal(cleared.sanitizePromptReplacement, undefined);
    const input = accountPatchFromInput({ sanitizePrompt: true, sanitizePromptReplacement: "Codex" });
    assert.equal(input.sanitizePrompt, true);
    assert.equal(input.sanitizePromptReplacement, "Codex");
    assert.equal(accountPatchFromInput({ sanitizePromptReplacement: 7 }).sanitizePromptReplacement, undefined);
  });

  it("is on by default and stays off once an account switches it off", () => {
    assert.equal(resolveConfig({}).sanitizePrompt, true);
    assert.equal(resolveConfig({ sanitizePrompt: false }).sanitizePrompt, false);
    assert.equal(patchAccount({ id: "default", provider: "cli-proxy" }, {}).sanitizePrompt, true);
    const { controller } = harness({ accounts: [{ id: "a", provider: "cli-proxy" }, { id: "b", provider: "cli-proxy-2", sanitizePrompt: false }] });
    const routes = controller.sanitizePromptRoutes();
    assert.equal(routes.get("cli-proxy"), DEFAULT_SANITIZE_REPLACEMENT);
    assert.equal(routes.has("cli-proxy-2"), false);
  });
});
