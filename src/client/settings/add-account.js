// @client-source Test-before-add account form.
    /** Add an account: name, address, key → test, then create enabled (or disabled on request). */
    function AddAccountForm({ t, busy, notice, canCancel, onCancel, onTest, onAdd }) {
      const [displayName, setDisplayName] = useState("");
      const [baseURL, setBaseURL] = useState("");
      const [apiKey, setApiKey] = useState("");
      const [failure, setFailure] = useState(null);

      const draft = () => ({
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        baseURL: baseURL.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      const connect = async () => {
        setFailure(null);
        const result = await onTest({ baseURL: baseURL.trim(), apiKey: apiKey.trim() });
        if (result === undefined) return;
        if (result.ok) await onAdd(draft(), true);
        else setFailure(result.error || t("statusError"));
      };

      return h(
        "div",
        { className: "dcpa-panel" },
        h("h3", { className: "dcpa-q-h" }, t("addTitle")),
        h(
          FieldRow,
          { t, label: t("displayNameLabel"), help: t("displayNameHint"), htmlFor: "dcpa-add-name" },
          h("input", {
            id: "dcpa-add-name",
            className: "dcpa-q-input",
            value: displayName,
            placeholder: t("addNamePlaceholder"),
            onChange: (e) => setDisplayName(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("baseUrlLabel"), htmlFor: "dcpa-add-url" },
          h("input", {
            id: "dcpa-add-url",
            className: "dcpa-q-input",
            value: baseURL,
            placeholder: t("baseUrlPlaceholder"),
            onChange: (e) => setBaseURL(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("apiKeyLabel"), help: t("apiKeyHint"), htmlFor: "dcpa-add-key" },
          h("input", {
            id: "dcpa-add-key",
            className: "dcpa-q-input",
            type: "password",
            autoComplete: "new-password",
            value: apiKey,
            placeholder: t("apiKeyUnsetPlaceholder"),
            onChange: (e) => setApiKey(e.target.value),
          })
        ),
        failure ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "testFail", { error: failure })) : null,
        notice?.tone === "error" ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, notice.text) : null,
        h(
          "div",
          { className: "dcpa-form-actions" },
          canCancel ? h("button", { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: onCancel }, t("cancelBtn")) : null,
          failure
            ? h(
                "button",
                { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void onAdd(draft(), false) },
                t("addAnywayBtn")
              )
            : null,
          h(
            "button",
            { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy !== null, onClick: () => void connect() },
            busy === "test" || busy === "add" ? t("connectingBtn") : t("connectBtn")
          )
        )
      );
    }

