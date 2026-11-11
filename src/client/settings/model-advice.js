// @client-source Models tab: online model-info switch, recommendation reasons and selection suggestions.
    /** Why a model is recommended, from the Host's `recommendations` detail. */
    function recommendationReason(t, detail) {
      if (!detail) return "";
      const source = t(detail.source === "online" ? "recommendSourceOnline" : detail.source === "catalog" ? "recommendSourceCatalog" : "recommendSourceName");
      if (detail.via === "channel") {
        return fmt(t, "recommendReasonChannel", { channel: detail.channel ?? "", line: detail.line, source });
      }
      const base = detail.released
        ? fmt(t, "recommendReasonDated", { line: detail.line, date: detail.released, source })
        : fmt(t, "recommendReason", { line: detail.line, source });
      return typeof detail.score === "number" ? `${base}${fmt(t, "recommendReasonScore", { score: detail.score })}` : base;
    }

    function modelInfoStatusText(t, info) {
      if (!info || info.enabled === false || info.state === "off") return t("onlineInfoOff");
      if (info.state === "loading") return t("onlineInfoLoading");
      const dates = Object.values(info.sources ?? {}).map((s) => s?.fetchedAt).filter(Boolean).sort();
      const latest = dates.length > 0 ? new Date(dates[dates.length - 1]) : null;
      if (latest && !Number.isNaN(latest.getTime())) {
        const when = latest.toLocaleDateString();
        return info.state === "partial" ? fmt(t, "onlineInfoPartial", { date: when }) : fmt(t, "onlineInfoReady", { date: when });
      }
      return info.state === "error" ? t("onlineInfoError") : t("onlineInfoIdle");
    }

    /**
     * Stateless: the online-info switch (a global, saved at once) and advice
     * about the draft selection. Buttons only change the draft; the save bar
     * applies them like any other selection change.
     */
    function ModelAdvice({ t, account, global, selectedIds, busy, onSelection, onToggleOnline }) {
      const on = global?.onlineModelInfo !== false;
      const advice = account.suggestions ?? {};
      const has = (id) => selectedIds.has(id);
      const edit = (fn) => onSelection((prev) => {
        const next = new Set(prev);
        fn(next);
        return next;
      });
      const items = [];
      for (const u of Array.isArray(advice.upgrades) ? advice.upgrades : []) {
        const from = (u.from ?? []).filter(has);
        if (has(u.to) || from.length === 0) continue;
        items.push({
          key: `up:${u.to}`,
          text: fmt(t, u.released ? "adviceUpgradeDated" : "adviceUpgrade", { from: from.join(", "), to: u.to, date: u.released ?? "" }),
          actions: [
            [t("adviceAdd"), () => edit((s) => s.add(u.to))],
            [t("adviceReplace"), () => edit((s) => { s.add(u.to); for (const id of from) s.delete(id); })],
          ],
        });
      }
      const fix = (kind, entry) => {
        if (!has(entry.id)) return;
        const replacement = entry.replacement && !has(entry.replacement) ? entry.replacement : null;
        items.push({
          key: `${kind}:${entry.id}`,
          text: fmt(t, kind === "missing" ? "adviceMissing" : "adviceRetired", { id: entry.id }),
          actions: replacement
            ? [[fmt(t, "adviceSwitchTo", { id: replacement }), () => edit((s) => { s.delete(entry.id); s.add(replacement); })]]
            : [[t("adviceRemove"), () => edit((s) => s.delete(entry.id))]],
        });
      };
      for (const m of Array.isArray(advice.missing) ? advice.missing : []) fix("missing", m);
      for (const r of Array.isArray(advice.retired) ? advice.retired : []) fix("retired", r);

      return h(
        "div",
        { className: "dcpa-advice" },
        h(
          "div",
          { className: "dcpa-switch-row dcpa-advice-online" },
          h(
            "div",
            { className: "dcpa-advice-label" },
            h("span", { className: "dcpa-label" }, t("onlineInfoLabel")),
            h(InfoTip, { t, text: t("onlineInfoHint") }),
            h("span", { className: "dcpa-q-sub", role: "status" }, modelInfoStatusText(t, global?.modelInfo))
          ),
          h(
            "button",
            {
              type: "button",
              role: "switch",
              className: "dcpa-switch",
              "aria-checked": on,
              "aria-label": t("onlineInfoLabel"),
              disabled: busy !== null,
              onClick: () => onToggleOnline(!on),
            },
            h("span", { className: "dcpa-switch-thumb" })
          )
        ),
        items.length > 0
          ? h(
              "div",
              { className: "dcpa-advice-list", role: "region", "aria-label": t("adviceTitle") },
              h("div", { className: "dcpa-q-sub" }, t("adviceTitle"), h(InfoTip, { t, text: t("adviceHint") })),
              items.map((item) =>
                h(
                  "div",
                  { key: item.key, className: "dcpa-advice-item" },
                  h("span", { className: "dcpa-advice-text" }, item.text),
                  h(
                    "span",
                    { className: "dcpa-actions" },
                    item.actions.map(([label, run]) =>
                      h("button", { key: label, type: "button", className: "dcpa-btn dcpa-btn-sm", onClick: run }, label)
                    )
                  )
                )
              )
            )
          : null
      );
    }
