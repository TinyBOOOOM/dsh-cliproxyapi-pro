// @client-source Activation resources, slot registrations and public client exports.
    const inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-cliproxyapi: dictionaries");
      const t = ctx.locale.bind(NS);

      // Open / reveal generated files through DSH's own Session Remote (the
      // same calls the document preview uses); the Host re-verifies each path.
      // Desktop availability is asked once per activation.
      let desktopAvailable = null;
      // The generated Remote namespace is its own service, "remote.session".
      const sessionRemote = () => {
        try {
          return ctx.get?.("remote.session") ?? ctx.get?.("remote")?.session;
        } catch {
          return undefined;
        }
      };
      // Run a follow-up slash command (edit / extend a video) in the session,
      // the way the composer does; its row appears in the conversation.
      const runCommand = async (sessionId, line) => {
        try {
          const commands = ctx.get?.("remote.commands") ?? ctx.get?.("remote")?.commands;
          if (typeof commands?.execute !== "function" || typeof sessionId !== "string") return { ok: false };
          const result = await commands.execute(sessionId, line, []);
          if (result?.ok !== true || result.value === undefined) return { ok: false, text: result?.error?.message };
          const outcome = result.value.result;
          return outcome?.kind === "error" ? { ok: false, text: outcome.text } : { ok: true };
        } catch (error) {
          return { ok: false, text: error instanceof Error ? error.message : String(error) };
        }
      };
      const fileActions = {
        available() {
          if (desktopAvailable !== null) return desktopAvailable;
          const remote = sessionRemote();
          // Not mounted yet: answer no for now and ask again next time.
          if (typeof remote?.canOpenWorkspacePath !== "function") return Promise.resolve(false);
          desktopAvailable = (async () => {
            try {
              const result = await remote.canOpenWorkspacePath();
              return result?.ok === true && result.value === true;
            } catch {
              desktopAvailable = null;
              return false;
            }
          })();
          return desktopAvailable;
        },
        async applications(path) {
          try {
            const result = await sessionRemote()?.workspacePathApplications?.({ path });
            return result?.ok === true && Array.isArray(result.value)
              ? result.value.filter((app) => app && typeof app.id === "string" && typeof app.name === "string")
              : null;
          } catch {
            return null;
          }
        },
        async open(path, action, application) {
          try {
            const result = await sessionRemote()?.openWorkspacePath?.(
              action === "reveal" ? { path, action } : application === undefined ? { path } : { path, application }
            );
            return result?.ok === true;
          } catch {
            return false;
          }
        },
      };

      // Each activation owns its stylesheet. A hot reload can start the new
      // activation before the old one is disposed; sharing one element would
      // let the old disposal remove the new activation's styles.
      if (typeof document !== "undefined") {
        ctx.effect(() => {
          const styleEl = document.createElement("style");
          styleEl.dataset.plugin = MODULE_ID;
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
          return () => styleEl.remove();
        }, "dsh-cliproxyapi: styles");
      }

      // List and keyed slots reject a second entry with the same id/key at the
      // same priority. During a hot reload the previous activation may still
      // hold it, so register one priority lower instead of losing the entry:
      // the lowest priority renders, and this entry takes over once the old
      // activation is disposed. The id/key itself stays stable.
      const registerListEntry = (slots, options, render) => {
        let priority = options.priority ?? 0;
        for (let attempt = 0; ; attempt++) {
          try {
            return slots.register(priority === 0 ? options : { ...options, priority }, render);
          } catch (error) {
            if (attempt >= 4 || !/already has an? (entry|registration)/.test(String(error?.message ?? error))) throw error;
            priority += 1;
          }
        }
      };

      // dshmarket installation client, shared by the card and the opt-in
      // background auto-install runner. No DOM writes; timers and requests
      // are disposed with this activation (HMR/unmount).
      ctx.effect(() => {
        const market = createMarketUpdater();
        sharedMarket = market;
        const stopAutoInstall = startAutoInstall(market);
        return () => {
          stopAutoInstall();
          market.dispose();
          if (sharedMarket === market) sharedMarket = null;
        };
      }, "dsh-cliproxyapi: market updates");

      // Quota client shared by the "额度" tab and every composer badge; it
      // polls only while something is subscribed and aborts on dispose.
      ctx.effect(() => {
        const store = createQuotaStore();
        sharedQuota = store;
        return () => {
          store.dispose();
          if (sharedQuota === store) sharedQuota = null;
        };
      }, "dsh-cliproxyapi: quota");

      // Composer: the badge sits in conversation.input.right, which the
      // composer renders immediately before the model selector. The session's
      // model directory (ui-model-selection) tells it the selected route/model.
      // The composer renders that list only once the session is bound, so a
      // New Session hero (model selector already visible) gets a second entry
      // in conversation.hero.options; it steps aside while the composer badge
      // of the same session is mounted (see createBadgePresence).
      if (typeof ctx.inject === "function") {
        ctx.inject(["slots", "modelDirectories"], (scope) => {
          const models = scope.modelDirectories;
          // Never resolve the directory here: DSH caches this result per
          // session binding, so an early miss would hide the badge for good.
          const injectDirectory = (sessionId) => ({
            resolveDirectory: () => models.directoryFor(sessionId).store,
            sessionId: typeof sessionId === "string" ? sessionId : null,
          });
          const badgeEntry = (name, id, placement) =>
            scope.slots.inject(name, () =>
              registerListEntry(
                scope.slots,
                {
                  name,
                  id,
                  order: 10000,
                  label: () => t("tabQuota"),
                  locale: NS,
                  inject: injectDirectory,
                },
                (props = {}) =>
                  h(QuotaBadge, {
                    t,
                    directory: props.directory ?? null,
                    resolveDirectory: typeof props.resolveDirectory === "function" ? props.resolveDirectory : null,
                    sessionId: props.sessionId ?? null,
                    placement,
                    store: sharedQuota,
                  })
              )
            );
          badgeEntry("conversation.input.right", `${NS}:quota`, "composer");
          badgeEntry("conversation.hero.options", `${NS}:quota-hero`, "hero");
        });
      }

      // Generation-model button, left of the quota badge. It only needs the
      // session id; like the badge, the hero copy steps aside while the
      // composer copy of the same session is mounted.
      const mediaEntry = (name, id, placement) =>
        ctx.slots.inject(name, () =>
          registerListEntry(
            ctx.slots,
            {
              name,
              id,
              order: 9990,
              label: () => t("tabMedia"),
              locale: NS,
              inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
            },
            (props = {}) => h(MediaChip, { t, sessionId: props.sessionId ?? null, placement })
          )
        );
      mediaEntry("conversation.input.right", `${NS}:media`, "composer");
      mediaEntry("conversation.hero.options", `${NS}:media-hero`, "hero");

      // A real Conversation node explicitly escapes both process folds. Its
      // definition is replayed by DSH; no session rescans or synthetic events.
      if (typeof ctx.inject === "function") {
        ctx.inject(["uiConversation"], (scope) => {
          if (typeof scope.uiConversation?.events?.register !== "function") return;
          scope.effect(() => scope.uiConversation.events.register(mediaConversationDefinition), "cpa: media conversation");
          scope.slots.inject("conversation.chat.node", () => registerListEntry(scope.slots, {
            name: "conversation.chat.node", key: MEDIA_NODE_KIND, locale: NS,
            inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
          }, (props = {}) => h(MediaToolRow, {
            t, owner: props.node?.data ?? {}, sessionId: props.sessionId ?? null,
            fileActions, runCommand, standalone: true,
          })));
        });
      }

      ctx.slots.inject("conversation.composer.dock", () => registerListEntry(ctx.slots, {
        name: "conversation.composer.dock", id: `${NS}:media-confirmation`, order: -10, locale: NS,
        inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
      }, (props = {}) => h(MediaConfirmationDock, { t, sessionId: props.sessionId ?? null })));

      // The /cpa-image and /cpa-video chat rows, keyed by command name; other
      // commands keep the generic row.
      for (const key of ["cpa-image", "cpa-video", "cpa-video-edit", "cpa-video-extend"]) {
        ctx.slots.inject("conversation.chat.commandview", () =>
          registerListEntry(
            ctx.slots,
            {
              name: "conversation.chat.commandview",
              key,
              locale: NS,
              inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
            },
            (props = {}) => h(MediaCommandRow, { t, node: props.node ?? null, sessionId: props.sessionId ?? null, fileActions, runCommand, useChat: props.useChat ?? null })
          )
        );
      }

      // The generate_media agent tool's call row (replaces DSH's generic tool row).
      ctx.slots.inject("tool.call.toolview", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "tool.call.toolview",
            key: "generate_media",
            locale: NS,
            inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
          },
          (props = {}) => h(MediaToolRow, { t, owner: props, sessionId: props.sessionId ?? null, fileActions, runCommand, useChat: props.useChat ?? null })
        )
      );

      // 1. Accounts and models: a page of its own in the Settings dialog's left
      //    navigation (like dshmarket's "Market" section). The slot owner gives
      //    unregistered ids the default nav glyph; no DOM is touched here.
      ctx.slots.inject("settings.section", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "settings.section",
            id: SETTINGS_SECTION_ID,
            order: 45,
            label: () => t("nav"),
            locale: NS,
          },
          () => h(CpaSectionPage, { t })
        )
      );

      // 2. Plugin updates only, on the bundle page in Sidebar -> Plugins.
      ctx.slots.inject("plugins.bundle.config", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "plugins.bundle.config",
            key: MODULE_ID,
            locale: NS,
          },
          (ownerProps = {}) => (ownerProps.view === "summary" ? null : h(PluginUpdatePage, { t }))
        )
      );

      // 3. Plugin updates only, as a tab in Settings -> Plugins.
      ctx.slots.inject("settings.plugins.tab", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "settings.plugins.tab",
            id: NS,
            order: 50,
            label: () => t("nav"),
            locale: NS,
          },
          () => h(PluginUpdatePage, { t })
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = MODULE_ID;
