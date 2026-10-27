// @client-source Image/video command exchange, progress, previews and file actions.
    /**
     * Replaces the generic command row of `/cpa-image` with a short exchange:
     * the request as a user bubble, then the result as a reply — progress while
     * the background job runs (polled through `media/command`), the images
     * when done (click to enlarge, right-click for open / show in folder /
     * copy), or the reason it failed. `fileActions` opens and reveals paths
     * through DSH's Session Remote; without it those items are hidden.
     * Hook order: slot 0 = data ({ run, files, folderPath }), slot 1 = loading (test harness).
     */
    // `pending`: an agent tool call still executing (its run record may not exist yet);
    // `label` replaces the command tag; `showCopy` hides "Copy original input" for tool rows.
    function ImageCommandCard({ t, node = null, sessionId = null, fileActions = null, runCommand = null, pending = false, label = null, showCopy = true, showConfirm = false }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [expanded, setExpanded] = useState(null);
      const [now, setNow] = useState(() => Date.now());
      const [menu, setMenu] = useState(null);
      const [notice, setNotice] = useState(null);
      const [canOpen, setCanOpen] = useState(false);
      // path → Host applications for it (array), "loading", or null after a failure.
      const [apps, setApps] = useState({});
      // Inline "edit / extend this video" form: null | "edit" | "extend".
      const [editMode, setEditMode] = useState(null);
      const [editDraft, setEditDraft] = useState("");
      const [editSeconds, setEditSeconds] = useState(6);
      const [editBusy, setEditBusy] = useState(false);
      const [confirmBusy, setConfirmBusy] = useState(false);
      const menuRef = useRef(null);
      const mounted = useRef(true);
      const outcome = node?.outcome ?? null;
      const commandId = typeof node?.commandId === "string" ? node.commandId : null;
      const admitted = outcome?.kind === "success";
      const canLoad = admitted && typeof sessionId === "string" && sessionId !== "" && commandId !== null;
      const run = data?.run ?? null;
      const kind = String(node?.name ?? "").startsWith("cpa-video") || run?.kind === "video" ? "video" : "image";
      const video = kind === "video";
      const running = outcome === null || (admitted && (run === null ? pending || (canLoad && loading) : run.status === "running"));
      const files = Array.isArray(data?.files) ? data.files : [];
      // The generated files this row shows (images, or the one video).
      const images = files.filter((f) => f.kind === kind);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      // Load once; while the run is still going, look again every 2 s.
      useEffect(() => {
        if (!canLoad) return undefined;
        const controller = new AbortController();
        let timer = null;
        let failures = 0;
        const load = async () => {
          let again = false;
          try {
            const url = `${API.mediaCommand}?sessionId=${encodeURIComponent(sessionId)}&commandId=${encodeURIComponent(commandId)}`;
            const res = await fetch(url, { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (res.ok && body.ok !== false) {
              setData({
                run: body.run ?? null,
                files: Array.isArray(body.files) ? body.files : [],
                folderPath: typeof body.folderPath === "string" ? body.folderPath : null,
                desktop: typeof body.desktop === "string" ? body.desktop : null,
                ...(body.confirm && typeof body.confirm === "object" ? { confirm: body.confirm } : {}),
                ...(body.actions && typeof body.actions === "object" ? { actions: body.actions } : {}),
              });
              again = body.run?.status === "running" || (pending && (body.run ?? null) === null);
            }
          } catch {
            if (controller.signal.aborted) return;
            again = ++failures < 5;
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
          if (again && !controller.signal.aborted) timer = setTimeout(load, video ? 3000 : 2000);
        };
        void load();
        return () => {
          controller.abort();
          if (timer !== null) clearTimeout(timer);
        };
      }, [canLoad, sessionId, commandId, video, pending]);

      // The elapsed-time clock, only while running.
      useEffect(() => {
        if (!running) return undefined;
        const timer = setTimeout(() => setNow(Date.now()), 1000);
        return () => clearTimeout(timer);
      }, [running, now]);

      // Whether the Host desktop can open paths (asked once per page by fileActions).
      const hasFiles = images.length > 0;
      useEffect(() => {
        if (!hasFiles || fileActions === null) return undefined;
        let live = true;
        fileActions.available().then((value) => {
          if (live) setCanOpen(value === true);
        }, () => {});
        return () => {
          live = false;
        };
      }, [hasFiles, fileActions]);

      // A transient notice ("Copied", a failure) under the images.
      useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), 2500);
        return () => clearTimeout(timer);
      }, [notice]);

      // The context menu closes on an outside press, Escape, scroll or resize.
      useEffect(() => {
        if (menu === null || typeof document === "undefined") return undefined;
        const close = () => setMenu(null);
        const onDown = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) close();
        };
        const onKey = (e) => {
          if (e.key === "Escape") close();
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", close);
          window.removeEventListener("scroll", close, true);
        };
      }, [menu]);

      const say = (tone, text) => {
        if (mounted.current) setNotice({ tone, text });
      };
      const act = async (action, file, application) => {
        setMenu(null);
        try {
          if (action === "copy-image") {
            await copyImageToClipboard(mediaFileURL(sessionId, file.id));
            say("ok", t("mediaActCopied"));
          } else if (action === "copy-path") {
            await copyTextToClipboard(file.path);
            say("ok", t("mediaActCopied"));
          } else if (fileActions !== null) {
            const ok = await fileActions.open(file.path, action === "reveal" ? "reveal" : "open", action === "app" ? application : undefined);
            if (!ok) say("error", t("mediaActOpenFailed"));
          }
        } catch (err) {
          say("error", fmt(t, "mediaActCopyFailed", { error: err instanceof Error ? err.message : String(err) }));
        }
      };
      // The Host desktop's file manager names the reveal item (Explorer / Finder / Files).
      const revealLabel = t(REVEAL_KEYS[data?.desktop] ?? "mediaActReveal");
      /** The always-available actions: the buttons under an enlarged image. */
      const baseEntries = (file) => [
        ...(canOpen && file.path
          ? [
              { key: "open", label: t("mediaActOpen"), run: () => act("open", file) },
              { key: "reveal", label: revealLabel, run: () => act("reveal", file) },
            ]
          : []),
        ...(file.kind === "image" ? [{ key: "copy-image", label: t("mediaActCopyImage"), run: () => act("copy-image", file) }] : []),
        ...(file.path ? [{ key: "copy-path", label: t("mediaActCopyPath"), run: () => act("copy-path", file) }] : []),
      ];
      /**
       * The context menu: the Host's applications for this file (default
       * first, as DSH's document preview lists them), the file manager, then
       * the copy actions. While the list loads or when it is empty or failed,
       * a single "open with the default app" item stands in.
       */
      const menuEntries = (file) => {
        const out = [];
        if (canOpen && file.path) {
          const list = Array.isArray(apps[file.path]) ? apps[file.path] : [];
          const sorted = [...list.filter((app) => app.default), ...list.filter((app) => !app.default)];
          if (sorted.length > 0) {
            for (const app of sorted) {
              out.push({
                key: `app:${app.id}`,
                label: fmt(t, app.default ? "mediaActOpenWithDefault" : "mediaActOpenWith", { app: app.name }),
                icon: safeIconSource(app.icon),
                run: () => act("app", file, app.id),
              });
            }
          } else {
            out.push({ key: "open", label: t("mediaActOpen"), run: () => act("open", file) });
          }
          out.push({ key: "reveal", label: revealLabel, separated: true, run: () => act("reveal", file) });
        }
        if (file.kind === "image") out.push({ key: "copy-image", label: t("mediaActCopyImage"), separated: out.length > 0, run: () => act("copy-image", file) });
        if (file.path) out.push({ key: "copy-path", label: t("mediaActCopyPath"), separated: file.kind !== "image" && out.length > 0, run: () => act("copy-path", file) });
        return out;
      };
      const openMenu = (file) => (e) => {
        e.preventDefault?.();
        // Ask the Host which applications open this file (once per path).
        if (canOpen && file.path && fileActions?.applications && apps[file.path] === undefined) {
          setApps((current) => ({ ...current, [file.path]: "loading" }));
          fileActions.applications(file.path).then(
            (list) => {
              if (mounted.current) setApps((current) => ({ ...current, [file.path]: Array.isArray(list) ? list.slice(0, 12) : null }));
            },
            () => {
              if (mounted.current) setApps((current) => ({ ...current, [file.path]: null }));
            }
          );
        }
        const width = 240;
        const height = 64 + 32 * (6 + (Array.isArray(apps[file.path]) ? apps[file.path].length : 1));
        const vw = (typeof window === "undefined" ? 0 : window.innerWidth) || 1024;
        const vh = (typeof window === "undefined" ? 0 : window.innerHeight) || 768;
        setMenu({ id: file.id, left: Math.max(8, Math.min(e.clientX ?? 0, vw - width - 8)), top: Math.max(8, Math.min(e.clientY ?? 0, vh - height - 8)) });
      };
      const parsed = splitImageArgs(node?.args);
      const rawArgs = typeof node?.args === "string" ? node.args.trim() : "";
      const rawLine = showCopy && rawArgs !== "" ? `/${node?.name ?? "cpa-image"} ${rawArgs}` : null;
      const prompt = run?.prompt || parsed.prompt;
      const aspect = run?.aspect ?? parsed.aspect;
      const count = video ? 1 : run?.count ?? parsed.count ?? 1;
      const seconds = run?.seconds ?? parsed.seconds;
      const resolution = run?.resolution ?? parsed.resolution;
      const references = run?.references ?? 0;
      const modelName = run?.modelName || parsed.model || node?.name || "cpa-image";
      const shown = expanded ? images.find((f) => f.id === expanded) : undefined;
      const menuFile = menu ? images.find((f) => f.id === menu.id) : undefined;

      let errorText = null;
      if (outcome?.kind === "error") errorText = String(outcome.text ?? "").replace(/^\/cpa-image:\s*/, "") || t("mediaCardFailed");
      else if (run?.status === "error") errorText = RUN_ERROR_KEYS[run.errorCode] ? t(RUN_ERROR_KEYS[run.errorCode]) : run.error || t("mediaCardFailed");

      let status;
      if (errorText !== null) status = t("mediaCardFailed");
      else if (run === null && data?.confirm) status = t("mediaConfirmWaiting");
      else if (outcome === null || (run === null && (pending || (canLoad && loading)))) status = t("mediaCardSubmitting");
      else if (run?.status === "running") {
        const time = elapsedText(t, secondsBetween(run.startedAt, now));
        if (run.phase === "interpreting") status = fmt(t, "mediaCardInterpreting", { time });
        else if (!video) status = fmt(t, references > 0 ? "mediaCardEditing" : "mediaCardRunning", { time });
        else if (run.phase === "submitting") status = t("mediaCardSubmitting");
        else if (run.phase === "downloading") status = fmt(t, "mediaCardVideoSaving", { time });
        else if (run.phase === "queued") status = fmt(t, "mediaCardVideoQueued", { time });
        else status = run.progress !== undefined ? fmt(t, "mediaCardVideoProgress", { time, progress: run.progress }) : fmt(t, "mediaCardRunning", { time });
      } else if (run?.status === "done" && run.folder) {
        status = fmt(t, "mediaCardDone", { time: elapsedText(t, secondsBetween(run.startedAt, Date.parse(run.finishedAt ?? "") || now)), folder: run.folder });
      }
      else status = t("mediaCardDoneShort");
      const tone = errorText !== null ? "error" : running ? "running" : "done";

      const mode = run?.mode ?? (node?.name === "cpa-video-edit" ? "edit" : node?.name === "cpa-video-extend" ? "extend" : undefined);
      // What was actually sent, stated in the reply: the mode the host chose
      // (from the images and flags) and, for edits / extensions, the source.
      // Runs recorded before modes existed: an attached image was the first frame.
      const sentMode = video ? mode ?? (references > 0 ? "first-frame" : "text") : references > 0 ? "image-edit" : "image-text";
      const sourceName = typeof run?.sourceName === "string" && run.sourceName !== "" ? run.sourceName : null;
      const sourceText =
        run?.sourceKind === "upload" ? fmt(t, "mediaSourceUpload", { name: sourceName ?? "" })
        : run?.sourceKind === "url" ? fmt(t, "mediaSourceUrl", { name: sourceName ?? "" })
        : run?.sourceKind === "link" ? t("mediaSourceLink")
        : sourceName !== null ? fmt(t, "mediaSourceTag", { name: sourceName })
        : null;
      const modeLine = run === null
        ? null
        : sentMode === "reference" ? fmt(t, "mediaSentReference", { n: references })
        : sentMode === "edit" || sentMode === "extend"
          ? fmt(t, sentMode === "edit" ? "mediaSentEdit" : "mediaSentExtend", { n: seconds ?? 6, source: sourceText ?? t("mediaSourceSession") })
        : sentMode === "image-edit" ? fmt(t, "mediaSentImageEdit", { n: references })
        : t({ text: "mediaSentText", "first-frame": "mediaSentFirstFrame", "first-last": "mediaSentFirstLast", "last-frame": "mediaSentLastFrame", "image-text": "mediaSentImageText" }[sentMode] ?? "mediaSentText");
      // A generate_media call waiting for the user's confirmation in this row.
      const confirm = showConfirm && run === null && data?.confirm ? data.confirm : null;
      const answerConfirm = async (allow) => {
        if (confirm === null || commandId === null || confirmBusy) return;
        setConfirmBusy(true);
        try {
          await postJson(API.mediaConfirm, { sessionId, commandId, allow });
          if (mounted.current) setData((current) => (current ? { ...current, confirm: undefined } : current));
          if (mounted.current) setNotice({ tone: "ok", text: t(allow ? "mediaConfirmAllowed" : "mediaConfirmDeclined") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: fmt(t, "mediaConfirmFailed", { error: err instanceof Error ? err.message : String(err) }) });
        } finally {
          if (mounted.current) setConfirmBusy(false);
        }
      };
      const confirmBox =
        confirm !== null
          ? h(
              "div",
              { className: "dcpa-chat-confirm", role: "group", "aria-label": t("mediaConfirmTitle") },
              h("p", { className: "dcpa-chat-confirm-title" }, t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle")),
              h("p", { className: "dcpa-chat-confirm-text" }, t("mediaLocale") === "zh" ? confirm.zh : confirm.en),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: confirmBusy, onClick: () => void answerConfirm(true) }, t("mediaConfirmAllow")),
                h("button", { type: "button", className: "dcpa-q-btn", disabled: confirmBusy, onClick: () => void answerConfirm(false) }, t("mediaConfirmDecline"))
              ),
              h("p", { className: "dcpa-chat-note" }, t("mediaConfirmNote"))
            )
          : null;
      // Which parameters the session's chat model read from the prompt.
      const interp = run?.interpreted ?? null;
      const interpretLine = interp === null || typeof interp.by !== "string"
        ? null
        : interp.failed ? fmt(t, "mediaInterpretFailed", { by: interp.by })
        : (Array.isArray(interp.items) && interp.items.length > 0 ? fmt(t, "mediaInterpreted", { by: interp.by, items: interp.items.join(" · ") }) : fmt(t, "mediaInterpretedNone", { by: interp.by }))
          + (interp.prompt ? t("mediaInterpretedPrompt") : "");
      const tags = [
        label ?? "/" + (node?.name ?? "cpa-image"),
        ...(aspect ? [aspect] : []),
        ...(video && seconds && mode !== "edit" && mode !== "extend" ? [fmt(t, "mediaSecondsOption", { n: seconds })] : []),
        ...(video && resolution ? [resolution] : []),
        ...(count > 1 ? [fmt(t, "mediaCardCount", { n: count })] : []),
        ...(video && Array.isArray(run?.ignored) && run.ignored.length > 0 ? [fmt(t, "mediaIgnoredTag", { words: run.ignored.join(" ") })] : []),
      ];

      const ratio = /^(\d+):(\d+)$/.exec(aspect ?? (video ? "16:9" : ""));
      const skeletons = running && errorText === null
        ? h(
            "div",
            { className: "dcpa-chat-grid", "data-count": String(count), "aria-hidden": "true" },
            Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, index) =>
              h("div", { key: index, className: "dcpa-chat-skeleton", style: { aspectRatio: ratio ? `${ratio[1]} / ${ratio[2]}` : "1 / 1" } })
            )
          )
        : null;

      const actionButtons = (file) =>
        baseEntries(file).map((entry) => h("button", { key: entry.key, type: "button", className: "dcpa-q-btn", onClick: () => void entry.run() }, entry.label));

      const gallery = video
        ? images.length > 0
          ? h(
              "div",
              { className: "dcpa-chat-videos" },
              images.map((file) =>
                h("video", {
                  key: file.id,
                  className: "dcpa-chat-video",
                  src: mediaFileURL(sessionId, file.id),
                  controls: true,
                  preload: "metadata",
                  playsInline: true,
                  "aria-label": file.name,
                  onContextMenu: openMenu(file),
                })
              )
            )
          : null
        : shown
        ? h(
            "div",
            { className: "dcpa-chat-full" },
            h(
              "button",
              { type: "button", className: "dcpa-chat-full-btn", "aria-label": t("mediaClosePreview"), onClick: () => setExpanded(null), onContextMenu: openMenu(shown) },
              h("img", { src: mediaFileURL(sessionId, shown.id), alt: shown.name })
            ),
            h(
              "div",
              { className: "dcpa-q-actions" },
              actionButtons(shown),
              h("button", { type: "button", className: "dcpa-q-btn", onClick: () => setExpanded(null) }, t("mediaClosePreview"))
            )
          )
        : images.length > 0
        ? h(
            "div",
            { className: "dcpa-chat-grid", "data-count": String(images.length) },
            images.map((file, index) =>
              h(
                "button",
                {
                  key: file.id,
                  type: "button",
                  className: "dcpa-chat-thumb",
                  "aria-label": fmt(t, "mediaCardImage", { n: index + 1 }),
                  onClick: () => setExpanded(file.id),
                  onContextMenu: openMenu(file),
                },
                h("img", { src: mediaFileURL(sessionId, file.id), alt: file.name, loading: "lazy" })
              )
            )
          )
        : null;

      const contextMenu = menuFile
        ? h(
            "div",
            { ref: menuRef, className: "dcpa-q-pop dcpa-chat-menu", role: "menu", "aria-label": t("mediaActMenu"), style: { left: `${menu.left}px`, top: `${menu.top}px` } },
            menuEntries(menuFile).flatMap((entry) => [
              entry.separated ? h("div", { key: `${entry.key}-sep`, role: "separator", className: "dcpa-chat-menu-sep" }) : null,
              h(
                "button",
                { key: entry.key, type: "button", role: "menuitem", className: "dcpa-menu-item dcpa-chat-menu-item", onClick: () => void entry.run() },
                entry.icon ? h("img", { className: "dcpa-chat-menu-icon", src: entry.icon, alt: "", "aria-hidden": "true" }) : h("span", { className: "dcpa-chat-menu-icon", "aria-hidden": "true" }),
                h("span", { className: "dcpa-chat-menu-label" }, entry.label)
              ),
            ]),
            menuFile.path && canOpen && apps[menuFile.path] === "loading" ? h("div", { key: "loading", className: "dcpa-chat-menu-hint", role: "status" }, t("mediaActAppsLoading")) : null
          )
        : null;

      const pathLink = (path, label, action) =>
        canOpen
          ? h("button", { type: "button", className: "dcpa-chat-link", onClick: () => void act(action, { path }) }, label)
          : h("span", null, label);

      const finished = admitted && !running && errorText === null;
      const actions = finished && video ? data?.actions ?? null : null;
      const submitEdit = async () => {
        const prompt = editDraft.trim();
        if (prompt === "" || runCommand === null || commandId === null) return;
        setEditBusy(true);
        const line = `/cpa-video-${editMode} --from ${commandId} ${editMode === "extend" ? `-s ${editSeconds} ` : ""}-- ${prompt}`;
        const outcome = await runCommand(sessionId, line);
        if (!mounted.current) return;
        setEditBusy(false);
        if (outcome.ok) {
          setEditMode(null);
          setEditDraft("");
          say("ok", t("mediaEditSubmitted"));
        } else {
          say("error", outcome.text || t("mediaEditFailed"));
        }
      };
      const editForm =
        editMode !== null
          ? h(
              "div",
              { className: "dcpa-chat-edit" },
              h("textarea", {
                className: "dcpa-q-input dcpa-chat-edit-input",
                rows: 2,
                value: editDraft,
                placeholder: t(editMode === "extend" ? "mediaExtendPlaceholder" : "mediaEditPlaceholder"),
                "aria-label": t(editMode === "extend" ? "mediaExtendPlaceholder" : "mediaEditPlaceholder"),
                disabled: editBusy,
                onChange: (e) => setEditDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault?.();
                    void submitEdit();
                  }
                },
              }),
              h(
                "div",
                { className: "dcpa-q-actions" },
                editMode === "extend"
                  ? h(
                      "select",
                      {
                        className: "dcpa-q-input dcpa-media-select",
                        "aria-label": t("mediaExtendSeconds"),
                        value: String(editSeconds),
                        disabled: editBusy,
                        onChange: (e) => setEditSeconds(Number(e.target.value)),
                      },
                      Array.from({ length: 9 }, (_, i) => h("option", { key: i + 2, value: String(i + 2) }, fmt(t, "mediaModeExtend", { n: i + 2 })))
                    )
                  : null,
                h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: editBusy || editDraft.trim() === "", onClick: () => void submitEdit() }, t(editMode === "extend" ? "mediaExtendSubmit" : "mediaEditSubmit")),
                h("button", { type: "button", className: "dcpa-q-btn", disabled: editBusy, onClick: () => setEditMode(null) }, t("mediaEditCancel"))
              ),
              h("p", { className: "dcpa-chat-note" }, t("mediaEditNote"))
            )
          : null;
      const editButtons =
        actions !== null && runCommand !== null && editMode === null && (actions.edit || actions.extend)
          ? [
              actions.edit ? h("button", { key: "edit", type: "button", className: "dcpa-q-btn", onClick: () => setEditMode("edit") }, t("mediaEditOpen")) : null,
              actions.extend ? h("button", { key: "extend", type: "button", className: "dcpa-q-btn", onClick: () => setEditMode("extend") }, t("mediaExtendOpen")) : null,
            ]
          : [];
      const folderPath = typeof data?.folderPath === "string" ? data.folderPath : null;
      const details = finished && (images.length > 0 || run?.revisedPrompt)
        ? h(
            "details",
            { className: "dcpa-chat-details" },
            h("summary", null, t("mediaCardDetails")),
            h(
              "dl",
              null,
              folderPath ? [h("dt", { key: "dt" }, t("mediaCardFolder")), h("dd", { key: "dd" }, pathLink(folderPath, folderPath, "open"))] : null,
              images.length > 0
                ? [
                    h("dt", { key: "ft" }, t("mediaCardFiles")),
                    h("dd", { key: "fd", className: "dcpa-chat-files" }, images.map((f) => h("span", { key: f.id }, f.path ? pathLink(f.path, f.name, "open") : f.name))),
                  ]
                : null,
              run?.revisedPrompt ? [h("dt", { key: "rt" }, t("mediaCardRevised")), h("dd", { key: "rd" }, run.revisedPrompt)] : null
            )
          )
        : null;

      return h(
        "div",
        { className: "dcpa-chat", "data-dsh-plugin": MODULE_ID, "data-state": tone, "data-kind": kind },
        h(
          "div",
          { className: "dcpa-chat-user" },
          prompt !== "" ? h("div", { className: "dcpa-chat-bubble" }, prompt) : null,
          h(
            "div",
            { className: "dcpa-chat-tags" },
            tags.map((tag, index) => h("span", { key: index }, tag)),
            // The command line exactly as typed (the bubble shows the parsed prompt).
            rawLine !== null
              ? h(
                  "button",
                  {
                    key: "copy",
                    type: "button",
                    className: "dcpa-chat-copy",
                    onClick: () => {
                      copyTextToClipboard(rawLine).then(
                        () => say("ok", t("mediaCopiedInput")),
                        (err) => say("error", fmt(t, "mediaActCopyFailed", { error: err instanceof Error ? err.message : String(err) }))
                      );
                    },
                  },
                  t("mediaCopyInput")
                )
              : null
          )
        ),
        h(
          "div",
          { className: "dcpa-chat-reply" },
          h(
            "div",
            { className: "dcpa-chat-head" },
            h(IMAGE_ICON),
            h("span", { className: "dcpa-chat-model" }, run?.accountName ? `${modelName} · ${run.accountName}` : modelName),
            h("span", { className: "dcpa-chat-sep", "aria-hidden": "true" }),
            h("span", { className: "dcpa-chat-status", "data-tone": tone, role: running ? "status" : undefined }, status)
          ),
          modeLine !== null ? h("p", { className: "dcpa-chat-mode", "data-mode": sentMode }, modeLine) : null,
          interpretLine !== null ? h("p", { className: "dcpa-chat-mode", "data-interpreted": interp.failed ? "failed" : "ok" }, interpretLine) : null,
          confirmBox,
          errorText !== null ? h("p", { className: "dcpa-chat-error", role: "alert" }, errorText) : null,
          skeletons,
          running && errorText === null && admitted && run !== null ? h("p", { className: "dcpa-chat-note" }, t(video ? "mediaCardVideoNoStop" : "mediaCardNoStop")) : null,
          video && finished && images.length > 0 ? h("div", { className: "dcpa-q-actions" }, actionButtons(images[0]), editButtons) : null,
          editForm,
          gallery,
          notice ? h("p", { className: "dcpa-chat-note", role: "status", "data-tone": notice.tone }, notice.text) : null,
          finished && !loading && data !== null && images.length === 0 ? h("p", { className: "dcpa-chat-note" }, t("mediaCardMissing")) : null,
          details
        ),
        contextMenu
      );
    }
    // #endregion
