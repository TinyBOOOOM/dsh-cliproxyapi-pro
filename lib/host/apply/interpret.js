// Session chat-target lookup and non-blocking generation-parameter interpretation.

import { interpretationLabels, interpretationRequest, parseInterpretation } from "../../media.js";

export function createInterpret(shared) {
  const { ctx } = shared;
  // #region Parameter interpretation (the session's chat model)
  const INTERPRET_TIMEOUT_MS = 30_000;
  const INTERPRET_MAX_TOKENS = 2000;

  /** The provider / model the session's agent last used (else its options, else the default model). */
  const sessionChatTarget = (agent) => {
    const valid = (t) => (t && typeof t.provider === "string" && t.provider !== "" && typeof t.model === "string" && t.model !== "" ? { provider: t.provider, model: t.model } : undefined);
    try {
      const header = valid(agent?.session?.requestHeader?.()?.config);
      if (header !== undefined) return header;
    } catch {
      // fall through
    }
    return valid(agent?.options) ?? valid(ctx.get?.("agentDefaultModel")?.currentSelection?.());
  };

  /**
   * Ask the session's chat model which parameters the prompt states.
   * Never throws: without an `llm` service or a model it returns undefined;
   * a failed call returns `{ failed: true, by }`.
   * @param fixed - fields the rule parser already set (they win).
   * @returns `{ by, values, prompt, items, failed? }` or undefined.
   */
  const interpretParams = async ({ agent, command, text, images = 0, fixed = [], signal }) => {
    const llm = ctx.get?.("llm");
    const target = sessionChatTarget(agent);
    if (typeof llm?.stream !== "function" || target === undefined) return undefined;
    const by = `${target.provider}/${target.model}`;
    const request = interpretationRequest({ command, text, images, fixed });
    const timeout = AbortSignal.timeout(INTERPRET_TIMEOUT_MS);
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    try {
      const parts = new Map();
      for await (const chunk of llm.stream({
        provider: target.provider,
        model: target.model,
        system: request.system,
        messages: [{ role: "user", content: [{ type: "text", text: request.user }] }],
        maxTokens: INTERPRET_MAX_TOKENS,
        ...(agent?.session?.id === undefined ? {} : { sessionId: agent.session.id }),
        purpose: "cpa-media-params",
        signal: combined,
      })) {
        if (chunk?.type === "text-delta") parts.set(chunk.index, (parts.get(chunk.index) ?? "") + chunk.text);
        else if (chunk?.type === "block-end" && chunk.block?.type === "text") parts.set(chunk.index, chunk.block.text);
      }
      const answer = [...parts.values()].join("");
      const parsed = parseInterpretation(answer, { command, text, fields: request.fields, images });
      if (parsed === undefined) throw new Error("no JSON in the answer");
      return { by, ...parsed, items: interpretationLabels(parsed.values) };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      ctx.logger?.warn?.(`cpa: parameter interpretation with ${by} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { by, failed: true, values: {}, prompt: text, items: [] };
    }
  };

  /** The run-record field describing an interpretation. */
  const interpretedRecord = (result, original) =>
    result === undefined
      ? {}
      : { interpreted: { by: result.by, items: result.items, ...(result.failed ? { failed: true } : {}), ...(result.prompt !== original ? { prompt: true } : {}) } };
  // #endregion

  return { sessionChatTarget, interpretParams, interpretedRecord };
}
