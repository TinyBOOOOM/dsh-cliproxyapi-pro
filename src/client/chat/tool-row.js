// @client-source Durable media conversation folding and tool/command row adapters.
    const MEDIA_NODE_KIND = "dsh-cliproxyapi-media";

    // Fold the actual durable tool lifecycle, not an invented user command.
    // A tool result carries no tool name, so unrelated result-only contexts
    // intentionally remain invisible until a matching start is loaded.
    const mediaEventResult = (event) => event.type === "tool/result" ? event.data : event.type === "tool/ptc-dispatch" ? {
      message: { content: event.data.content ?? [], isError: event.data.isError === true },
      meta: event.data.meta,
    } : null;
    const mediaDispatchMatch = (event) => event.data?.name === "generate_media" && typeof event.data.subCallId === "string"
      ? { id: event.data.subCallId, role: "start" } : null;
    const mediaConversationDefinition = {
      kind: MEDIA_NODE_KIND,
      target: "chat",
      match: {
        "tool/call": (event) => event.data?.name === "generate_media" && typeof event.data.callId === "string"
          ? { id: event.data.callId, role: "start" } : null,
        "tool/result": (event) => event.surfaceOp === "append" && typeof event.data?.message?.source?.callId === "string"
          ? { id: event.data.message.source.callId, role: "update" } : null,
        "tool/ptc-dispatch-start": mediaDispatchMatch,
        "tool/ptc-dispatch": mediaDispatchMatch,
      },
      start: (_context, match) => ({
        callId: match.event.data.callId ?? match.event.data.subCallId,
        argsRaw: typeof match.event.data.arguments === "string" ? match.event.data.arguments : JSON.stringify(match.event.data.arguments ?? {}),
        result: mediaEventResult(match.event),
      }),
      update: (context, match) => {
        if (context.state == null) return null;
        const result = mediaEventResult(match.event);
        return result === null ? context.state : { ...context.state, result };
      },
      buildViewNode: (context) => {
        if (context.state == null || context.start === undefined) return null;
        const { callId, argsRaw, result } = context.state;
        const location = context.start.location;
        const interrupted = result === null && (
          location?.kind === "step" && location.step.status === "closed" ||
          (location?.kind === "step" || location?.kind === "turn") && location.turn.status === "closed"
        );
        const done = result !== null || interrupted;
        const block = done ? {
          kind: "tool-result", callId,
          call: { name: "generate_media", argsRaw },
          content: result?.message?.content ?? [],
          isError: interrupted || result?.message?.isError === true,
          ...(interrupted ? { error: { code: "interrupted" } } : {}),
          meta: result?.meta,
        } : { callId, phase: "start", argsRaw };
        return {
          key: context.key, id: context.id, kind: MEDIA_NODE_KIND, target: "chat",
          anchorSeq: context.start.event.seq, location,
          visibility: "visible",
          // Explicitly outside process. Keeping the source step location alone
          // (as the old synthetic command did) leaves it inside thinking.
          groupTree: "turn",
          data: { callId, phase: done ? "result" : "start", block },
        };
      },
    };

    /** Read only the typed, wrapped chat nodes, never flat legacy payloads. */
    function hasMediaNode(snapshot, runId) {
      return runId !== null && Array.isArray(snapshot?.order) && typeof snapshot.nodes?.get === "function" &&
        snapshot.order.some((key) => {
          const node = snapshot.nodes.get(key);
          return node?.kind === MEDIA_NODE_KIND && toolRunId(node.data?.callId) === runId;
        });
    }

    /**
     * The agent tool's call row, drawn like the matching slash command's row:
     * the request as a bubble, then progress and the result (polled through
     * `media/command` with the run id derived from the call id).
     * Owner props from DSH: `{ callId, phase, block }`.
     */
    function MediaToolRow({ t, owner = {}, sessionId = null, fileActions = null, runCommand = null, useChat = null, standalone = false }) {
      const block = owner.block ?? null;
      const done = block !== null && typeof block === "object" && "kind" in block;
      const runId = toolRunId(owner.callId ?? block?.callId);
      // New calls are mirrored as a top-level command row by the host. If that
      // row exists, drawing the full card here as well showed the same run
      // twice: once inside the folded process group and once as the command
      // row. Older calls have no mirrored row, so they keep their card.
      const mirrored = typeof useChat === "function"
        ? useChat((snapshot) => {
            return hasMediaNode(snapshot, runId);
          })
        : false;
      if (!standalone && mirrored) return null;
      let args = null;
      try {
        const raw = done ? block.call?.argsRaw : block?.argsRaw;
        const parsed = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : null;
        args = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        args = null;
      }
      const video = args?.kind === "video";
      const name = !video ? "cpa-image" : args.mode === "edit" ? "cpa-video-edit" : args.mode === "extend" ? "cpa-video-extend" : "cpa-video";
      const errorText = done && block.isError
        ? (Array.isArray(block.content) ? block.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "").replace(/^Error:\s*/, "") || t("mediaCardFailed")
        : null;
      const outcome = errorText !== null ? { kind: "error", text: errorText } : done ? { kind: "success" } : owner.phase === "preparing" || args === null ? null : { kind: "success" };
      const node = { name, commandId: toolRunId(owner.callId ?? block?.callId), args: typeof args?.prompt === "string" ? `-- ${args.prompt}` : "", outcome };
      return h(ImageCommandCard, { t, node, sessionId, fileActions, runCommand, pending: !done, label: "generate_media", showCopy: false, showConfirm: false });
    }

    function MediaCommandRow({ useChat = null, node = null, ...props }) {
      const mirrored = typeof useChat === "function" ? useChat((snapshot) => hasMediaNode(snapshot, node?.commandId ?? null)) : false;
      return mirrored ? null : h(ImageCommandCard, { ...props, node, showConfirm: false });
    }

    // #endregion

