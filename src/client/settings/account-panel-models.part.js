// @client-source Contiguous AccountPanel continuation: models tab and account rendering.
      const modelsTab = h(
        "div",
        { className: "dcpa-tabbody dcpa-models" },
        h("p", { className: "dcpa-q-sub" }, t("modelsEmptyRule")),
          // Search + Segmented Filter + Batch Actions
          h(
            "div",
            { className: "dcpa-toolbar" },
            h(
              "div",
              { className: "dcpa-seg" },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "all" ? "true" : "false",
                  onClick: () => setTabFilter("all"),
                },
                `${t("filterAll")} (${allModels.length})`
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "selected" ? "true" : "false",
                  onClick: () => setTabFilter("selected"),
                },
                `${t("filterSelected")} (${selectedChatCount})`
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "unselected" ? "true" : "false",
                  onClick: () => setTabFilter("unselected"),
                },
                `${t("filterUnselected")} (${Math.max(0, allModels.length - selectedChatCount)})`
              )
            ),
            h(
              "div",
              { className: "dcpa-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  onClick: checkVisible,
                },
                t("selectAllVisibleBtn")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  onClick: uncheckVisible,
                },
                t("deselectAllVisibleBtn")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  disabled: recommended.length === 0,
                  onClick: resetRecommended,
                },
                `${t("selectRecommendedBtn")} (${recommended.length})`
              ),
              h(InfoTip, { t, text: t("selectRecommendedHint") })
            )
          ),

          // Family Quick Chips
          families.length > 1
            ? h(
                "div",
                { className: "dcpa-family-chips" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-chip",
                    "data-active": familyFilter === "all" ? "true" : "false",
                    onClick: () => setFamilyFilter("all"),
                  },
                  t("familyAll")
                ),
                families.map(([fam, count]) =>
                  h(
                    "button",
                    {
                      key: fam,
                      type: "button",
                      className: "dcpa-chip",
                      "data-active": familyFilter === fam ? "true" : "false",
                      onClick: () => setFamilyFilter(familyFilter === fam ? "all" : fam),
                    },
                    `${fam.toUpperCase()} (${count})`
                  )
                )
              )
            : null,

          h("input", {
            type: "text",
            className: "dcpa-input",
            value: search,
            placeholder: t("searchModelsPlaceholder"),
            onChange: (e) => setSearch(e.target.value),
          }),

          visibleModels.length === 0
            ? h("p", { className: "dcpa-hint" }, t("noModelsText"))
            : h(
                "div",
                { className: "dcpa-model-list" },
                visibleModels.map((m) => {
                  const checked = selectedIds.has(m.id);
                  const editing = editingId === m.id;
                  const hasOverride = modelOverrides[m.id] !== undefined;
                  const discovered = m.discovered ?? {};
                  const draft = {
                    contextWindow: discovered.contextWindow ?? m.contextWindow,
                    maxTokens: discovered.maxTokens ?? m.maxTokens,
                    image: discovered.image === true,
                    reasoningLevels: Array.isArray(discovered.reasoningLevels) ? discovered.reasoningLevels : [],
                    ...(modelOverrides[m.id] ?? {}),
                  };
                  return h(
                    "div",
                    {
                      key: m.id,
                      className: "dcpa-model-row",
                      "data-checked": checked ? "true" : "false",
                    },
                    h(
                      "div",
                      { className: "dcpa-model-main" },
                      h(
                        "div",
                        {
                          className: "dcpa-model-left",
                          role: "checkbox",
                          "aria-checked": checked,
                          tabIndex: 0,
                          onClick: () => toggleModel(m.id),
                          onKeyDown: (e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleModel(m.id);
                            }
                          },
                        },
                        h("span", { className: "dcpa-checkbox" }, checked ? "✓" : ""),
                        h(
                          "div",
                          null,
                          h("span", { className: "dcpa-model-id" }, m.id),
                          m.name && m.name !== m.id
                            ? h("span", { className: "dcpa-model-name" }, `(${m.name})`)
                            : null
                        )
                      ),
                      h(
                        "div",
                        { className: "dcpa-model-tags" },
                        hasOverride
                          ? h("span", { className: "dcpa-badge dcpa-badge-warn" }, t("customParamsBadge"))
                          : null,
                        checked
                          ? h("span", { className: "dcpa-badge" }, protocolName(effectiveProtocol(m)))
                          : null,
                        m.image
                          ? h("span", { className: "dcpa-badge dcpa-badge-ok" }, t("badgeVision"))
                          : null,
                        m.reasoning
                          ? h(
                              "span",
                              { className: "dcpa-badge" },
                              `${t("badgeReasoning")}${
                                Array.isArray(m.reasoningLevels) && m.reasoningLevels.length > 0
                                  ? `: ${m.reasoningLevels.join("/")}`
                                  : ""
                              }`
                            )
                          : null,
                        m.contextWindow
                          ? h(
                              "span",
                              { className: "dcpa-badge" },
                              `${t("contextWindowTag")} ${formatTokens(m.contextWindow)}`
                            )
                          : null,
                        checked
                          ? h(
                              "button",
                              {
                                type: "button",
                                className: "dcpa-edit-btn",
                                "data-active": editing ? "true" : "false",
                                onClick: () => setEditingId(editing ? null : m.id),
                              },
                              editing ? t("editingParamsBtn") : t("editParamsBtn")
                            )
                          : null
                      )
                    ),
                    checked && editing
                      ? h(
                          "div",
                          { className: "dcpa-editor" },
                          h(
                            "div",
                            { className: "dcpa-grid" },
                            h(
                              "div",
                              { className: "dcpa-field" },
                              h("label", { className: "dcpa-label" }, t("contextWindowLabel")),
                              h("input", {
                                type: "number",
                                min: "1",
                                className: "dcpa-input",
                                value: draft.contextWindow ?? "",
                                onChange: (e) => {
                                  const value = Number(e.target.value);
                                  if (Number.isInteger(value) && value > 0) {
                                    updateOverride(m, { contextWindow: value });
                                  }
                                },
                              }),
                              h(
                                "p",
                                { className: "dcpa-hint" },
                                `${t("discoveredValue")}: ${formatTokens(m.discovered?.contextWindow)}`
                              )
                            ),
                            h(
                              "div",
                              { className: "dcpa-field" },
                              h("label", { className: "dcpa-label" }, t("maxTokensLabel")),
                              h("input", {
                                type: "number",
                                min: "1",
                                className: "dcpa-input",
                                value: draft.maxTokens ?? "",
                                onChange: (e) => {
                                  const value = Number(e.target.value);
                                  if (Number.isInteger(value) && value > 0) {
                                    updateOverride(m, { maxTokens: value });
                                  }
                                },
                              }),
                              h(
                                "p",
                                { className: "dcpa-hint" },
                                `${t("discoveredValue")}: ${formatTokens(m.discovered?.maxTokens)}`
                              )
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-switch-row" },
                            h("div", { className: "dcpa-label" }, t("imageInputLabel")),
                            h(
                              "button",
                              {
                                type: "button",
                                role: "switch",
                                className: "dcpa-switch",
                                "aria-checked": draft.image === true,
                                "aria-label": t("imageInputLabel"),
                                onClick: () => updateOverride(m, { image: draft.image !== true }),
                              },
                              h("span", { className: "dcpa-switch-thumb" })
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-field" },
                            h("label", { className: "dcpa-label" }, t("reasoningLevelsLabel")),
                            h(
                              "div",
                              { className: "dcpa-level-list" },
                              REASONING_LEVELS.map((level) => {
                                const active = draft.reasoningLevels.includes(level);
                                return h(
                                  "label",
                                  { key: level, className: "dcpa-level" },
                                  h("input", {
                                    type: "checkbox",
                                    checked: active,
                                    onChange: () => {
                                      const current = draft.reasoningLevels;
                                      const next = active
                                        ? current.filter((item) => item !== level)
                                        : [...current, level];
                                      updateOverride(m, {
                                        reasoningLevels: REASONING_LEVELS.filter((item) => next.includes(item)),
                                      });
                                    },
                                  }),
                                  level
                                );
                              })
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-field" },
                            h("label", { className: "dcpa-label" }, t("modelProtocolLabel")),
                            h(
                              "select",
                              {
                                className: "dcpa-select",
                                value: modelOverrides[m.id]?.protocol ?? "",
                                onChange: (e) => updateOverride(m, { protocol: e.target.value || undefined }),
                              },
                              h("option", { value: "" }, t("modelProtocolDefault")),
                              PROTOCOLS.map((p) => h("option", { key: p, value: p }, protocolName(p)))
                            ),
                            h(
                              "p",
                              { className: "dcpa-hint" },
                              `${t("modelProtocolHint")}${protocolName(m.nativeProtocol ?? "openai-completions")}`
                            )
                          ),
                          h("div", { className: "dcpa-q-sub" }, t("paramsHintShort"), h(InfoTip, { t, text: t("paramsHint") })),
                          hasOverride
                            ? h(
                                "div",
                                null,
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    className: "dcpa-btn dcpa-btn-sm",
                                    onClick: () => resetOverride(m.id),
                                  },
                                  t("resetParamsBtn")
                                )
                              )
                            : null
                        )
                      : null
                  );
                })
              )
      );

      return h(
        "div",
        { className: "dcpa-account" },
        h(
          "div",
          { className: "dcpa-acct-head" },
          h(
            "div",
            { className: "dcpa-q-row-main" },
            h("h3", { className: "dcpa-q-h" }, account.config?.displayName || account.id),
            h(
              "div",
              { className: "dcpa-q-sub dcpa-status-line" },
              h("span", { className: stateDotClass(enabled ? st.state : "idle") }),
              statusParts.join(" · ")
            )
          ),
          h(
            "div",
            { className: "dcpa-q-actions" },
            h("span", { className: "dcpa-q-sub" }, t("enableShort")),
            h(InfoTip, { t, text: t("enabledHint") }),
            h(
              "button",
              {
                type: "button",
                role: "switch",
                className: "dcpa-switch",
                "aria-checked": enabled,
                "aria-label": t("enabledLabel"),
                disabled: busy !== null,
                onClick: () => void actions.patch(account.id, { enabled: !enabled }, enabled ? t("disabledToast") : t("enabledToast")),
              },
              h("span", { className: "dcpa-switch-thumb" })
            ),
            h(
              "span",
              { className: "dcpa-menu", ref: menuRef },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-q-btn dcpa-menu-btn",
                  "aria-label": t("moreActions"),
                  "aria-haspopup": "menu",
                  "aria-expanded": menuOpen,
                  onClick: () => setMenuOpen((v) => !v),
                },
                "⋯"
              ),
              menuOpen
                ? h(
                    "div",
                    { className: "dcpa-menu-pop", role: "menu" },
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        className: "dcpa-menu-item",
                        disabled: busy !== null,
                        onClick: () => {
                          setMenuOpen(false);
                          void actions.refresh(account.id);
                        },
                      },
                      syncing ? t("refreshingBtn") : t("refreshBtn")
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        className: "dcpa-menu-item",
                        "data-variant": "danger",
                        disabled: busy !== null,
                        onClick: () => {
                          setMenuOpen(false);
                          actions.remove(account);
                        },
                      },
                      t("removeAccountBtn")
                    )
                  )
                : null
            )
          )
        ),
        !enabled ? h("p", { className: "dcpa-q-msg" }, t("disabledHint")) : null,
        st.error ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, st.error) : null,
        h(
          "div",
          { className: "dcpa-q-seg dcpa-acct-tabs", role: "tablist", "aria-label": t("tabsLabel") },
          tabs.map(([id, label]) =>
            h(
              "button",
              {
                key: id,
                id: `dcpa-tab-${account.id}-${id}`,
                type: "button",
                role: "tab",
                className: "dcpa-q-seg-tab",
                "aria-selected": tab === id,
                "aria-controls": `dcpa-tabpanel-${account.id}-${id}`,
                onClick: () => setTab(id),
              },
              label
            )
          )
        ),
        h(
          "div",
          { id: `dcpa-tabpanel-${account.id}-${tab}`, role: "tabpanel", "aria-labelledby": `dcpa-tab-${account.id}-${tab}` },
          tab === "connection"
            ? connectionTab
            : tab === "models"
            ? modelsTab
            : tab === "media"
            ? h(MediaPanel, { t, account, onStatus: actions.adopt })
            : h(QuotaPanel, { t, store: sharedQuota, accountId: account.id })
        ),
        dirty || notice
          ? h(
              "div",
              { className: "dcpa-savebar", role: "region", "aria-label": t("saveBarLabel") },
              h(
                "span",
                { className: "dcpa-savebar-text", "data-tone": notice && !dirty ? notice.tone : undefined, role: notice ? "status" : undefined },
                dirty ? (notice?.tone === "error" ? notice.text : t("unsavedChanges")) : notice?.text
              ),
              dirty
                ? h(
                    "div",
                    { className: "dcpa-q-actions" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dcpa-q-btn",
                        disabled: busy !== null,
                        onClick: discard,
                      },
                      t("discardBtn")
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dcpa-q-btn",
                        "data-variant": "primary",
                        disabled: busy !== null,
                        onClick: () => void actions.save(account.id, payload()),
                      },
                      saving ? t("savingBtn") : t("saveBtn")
                    )
                  )
                : null
            )
          : null
      );
    }
