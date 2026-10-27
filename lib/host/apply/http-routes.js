// Ordered account/update/quota/media HTTP route registration and media file serving.

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { UpdateError } from "../../updater.js";
import { MediaError, validCommandId, validSessionId, EDIT_SOURCE_MAX_SECONDS, EXTEND_SOURCE_SECONDS, VIDEO_UPLOAD_MAX_BYTES } from "../../media.js";
import { plainObject } from "../accounts.js";
import { accountPatchFromInput } from "../apply-utils.js";
import { GLOBAL_FIELDS } from "../config.js";
import { ROUTES, sendJson, admitRequest, admitUpdateRequest, readJsonBody } from "../http-gate.js";

export function createHttpRoutes(shared) {
  const { ctx, updater, controller, quota, mediaStatus, saveMedia, mediaSessions, mediaChoicesFor, sessionView, saveSessionPick, MEDIA_FILE_TYPES, byteRange, mediaFailureText, mediaJobs, videoLive, VIDEO_SOURCE_TTL_MS, usableSource, unsupportedRoutes, pendingConfirms, syncAgentTool } = shared;
  // Register HTTP API Routes on webServer for the Web UI
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => {
      const route = (path, method, run, errorStatus = 500) =>
        webCtx.webServer.register({
          kind: "exact",
          path,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, method)) return;
            try {
              const body = method === "POST" ? (await readJsonBody(req)) ?? {} : {};
              const result = await run(body, req);
              // Account, model and Generation-tab changes may switch the agent tool on or off.
              if (method === "POST") syncAgentTool();
              sendJson(res, 200, result);
            } catch (error) {
              sendJson(res, errorStatus, {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      const updateRoute = (path, method, run) => webCtx.webServer.register({
        kind: "exact", path,
        handler: async (req, res) => {
          if (!admitUpdateRequest(ctx, req, res, method)) return;
          try {
            const body = method === "POST" ? await readJsonBody(req, 8192) : {};
            if (!plainObject(body)) throw new UpdateError("invalid-settings");
            if (path === ROUTES.updateDownload && (Object.keys(body).some((key) => key !== "version") || typeof body.version !== "string")) {
              throw new UpdateError("stale-version");
            }
            if (path === ROUTES.updateCheck && Object.keys(body).length) throw new UpdateError("invalid-settings");
            const update = await run(body);
            sendJson(res, 200, { ok: true, update });
          } catch (error) {
            const errorCode = error instanceof UpdateError ? error.code : "invalid-settings";
            sendJson(res, errorCode === "busy" ? 409 : 400, { ok: false, errorCode, error: errorCode, update: updater.status() });
          }
        },
      });
      const disposers = [
        updateRoute(ROUTES.updateStatus, "GET", () => updater.status()),
        updateRoute(ROUTES.updateCheck, "POST", () => updater.check()),
        updateRoute(ROUTES.updateSave, "POST", (body) => updater.save(body)),
        updateRoute(ROUTES.updateDownload, "POST", (body) => updater.download(body.version)),
        route(ROUTES.status, "GET", () => controller.statusPayload()),
        route(ROUTES.refresh, "POST", (body) => controller.refresh(body.accountId)),
        route(
          ROUTES.save,
          "POST",
          (body) => {
            const patch = accountPatchFromInput(body);
            const hasAccountFields = Object.keys(patch).some((k) => !GLOBAL_FIELDS.includes(k));
            return body.accountId === undefined && !hasAccountFields
              ? controller.updateGlobals(patch)
              : controller.updateAccount(body.accountId, patch);
          },
          400
        ),
        route(ROUTES.addAccount, "POST", (body) => controller.addAccount(accountPatchFromInput(body)), 400),
        route(ROUTES.removeAccount, "POST", (body) => controller.removeAccount(body.accountId), 400),
        route(ROUTES.testAccount, "POST", (body) => controller.testConnection(body.accountId, { baseURL: body.baseURL, apiKey: body.apiKey }), 400),
        route(ROUTES.quotaStatus, "GET", async () => ({ ok: true, quota: await quota.snapshot() })),
        route(ROUTES.quotaRefresh, "POST", async (body) => ({
          ok: true,
          quota: await quota.refresh(typeof body.accountId === "string" && body.accountId !== "" ? body.accountId : undefined, { wait: false }),
        })),
        route(
          ROUTES.quotaSave,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") {
              throw new Error("dsh-cliproxyapi: saving a management key needs accountId");
            }
            const managementKey = typeof body.managementKey === "string" ? body.managementKey.trim() : "";
            return {
              ok: true,
              quota: await quota.saveKey(body.accountId, {
                ...(managementKey === "" ? {} : { managementKey }),
                ...(body.clear === true ? { clear: true } : {}),
              }, { wait: false }),
            };
          },
          400
        ),
        route(ROUTES.mediaStatus, "GET", async () => ({ ok: true, media: mediaStatus() })),
        route(ROUTES.mediaSave, "POST", saveMedia, 400),
        route(
          ROUTES.mediaDiagnose,
          "POST",
          async (body) => {
            if (typeof body.accountId !== "string" || body.accountId === "") throw new MediaError("invalid-account");
            return { ok: true, diagnostic: await controller.diagnoseMedia(body.accountId) };
          },
          400
        ),
        route(
          ROUTES.mediaSession,
          "GET",
          async (_body, req) => {
            const raw = new URL(req.url ?? "/", "http://host").searchParams.get("sessionId");
            const sessionId = raw === null || raw === "" ? undefined : validSessionId(raw);
            if (raw !== null && raw !== "" && sessionId === undefined) throw new MediaError("invalid-session");
            // Right after a start the catalogs may not be read yet; sync once
            // instead of letting the composer button wait for its next retry.
            await mediaChoicesFor("any");
            return { ok: true, session: sessionView(sessionId) };
          },
          400
        ),
        route(ROUTES.mediaSessionSave, "POST", async (body) => saveSessionPick(body), 400),
        // The user's answer to a generate_media confirmation shown in its chat row.
        route(
          ROUTES.mediaConfirm,
          "POST",
          async (body) => {
            const sessionId = validSessionId(body.sessionId);
            const commandId = validCommandId(body.commandId);
            if (sessionId === undefined || commandId === undefined || typeof body.allow !== "boolean") throw new MediaError("invalid-request");
            const waiting = pendingConfirms.get(commandId);
            if (waiting === undefined || waiting.sessionId !== sessionId) throw new MediaError("confirm-expired");
            waiting.settle(body.allow ? "allowed" : "rejected");
            return { ok: true };
          },
          400
        ),
        // One slash-command run's record and files (its chat row shows them).
        // The absolute paths let the page open or reveal a file through DSH's
        // own Session Remote (`session.openWorkspacePath`), which re-verifies
        // them on the Host.
        route(
          ROUTES.mediaCommand,
          "GET",
          async (_body, req) => {
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const commandId = validCommandId(params.get("commandId") ?? "");
            if (sessionId === undefined || commandId === undefined) throw new MediaError("invalid-request");
            const entry = mediaSessions.get(sessionId);
            const files = entry.recent
              .filter((r) => r.commandId === commandId && existsSync(r.file))
              .map((r) => ({ id: r.id, kind: r.kind, name: basename(r.file), path: r.file }));
            let run = entry.runs.find((r) => r.commandId === commandId) ?? null;
            // A run recorded as running that no job of this activation owns was
            // cut off by a reload or a restart.
            if (run?.status === "running" && !mediaJobs.has(commandId)) {
              run = { ...run, status: "error", errorCode: "interrupted", error: mediaFailureText(new MediaError("interrupted"), run.kind) };
            } else if (run?.status === "running" && videoLive.has(commandId)) {
              // A video's phase (submitting / queued / running / downloading) and CPA's progress, if it reports one.
              run = { ...run, ...videoLive.get(commandId) };
            }
            // Which file manager "show in folder" opens, to name the menu item.
            const desktop = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "finder" : "filemanager";
            // Edit / extend this video: by xAI's short-lived link while it is
            // remembered, else by sending its file inline when small enough.
            let actions;
            if (run?.kind === "video" && run.status === "done") {
              const source = usableSource(commandId);
              const video = files.find((f) => f.kind === "video");
              let size;
              try {
                size = video === undefined ? undefined : statSync(video.path).size;
              } catch {
                size = undefined;
              }
              if (source !== undefined || (size !== undefined && size <= VIDEO_UPLOAD_MAX_BYTES)) {
                const seconds = source?.seconds ?? run.seconds;
                const accountId = source?.accountId ?? String(run.model).split("/", 1)[0];
                actions = {
                  edit: seconds === undefined || seconds <= EDIT_SOURCE_MAX_SECONDS,
                  extend:
                    (seconds === undefined || (seconds >= EXTEND_SOURCE_SECONDS.min && seconds <= EXTEND_SOURCE_SECONDS.max)) &&
                    !unsupportedRoutes.has(`${accountId}/extensions`),
                  ...(source === undefined ? {} : { expiresAt: new Date(source.at + VIDEO_SOURCE_TTL_MS).toISOString() }),
                };
              }
            }
            // A generate_media call waiting for the user's confirmation in this row.
            const waiting = pendingConfirms.get(commandId);
            const confirm = waiting !== undefined && waiting.sessionId === sessionId ? { kind: waiting.kind, en: waiting.en, zh: waiting.zh, expiresAt: waiting.expiresAt } : undefined;
            return {
              ok: true,
              run,
              files,
              desktop,
              ...(files.length > 0 ? { folderPath: dirname(files[0].path) } : {}),
              ...(actions === undefined ? {} : { actions }),
              ...(confirm === undefined ? {} : { confirm }),
            };
          },
          400
        ),
        // Serves only files this plugin wrote and recorded for that session.
        webCtx.webServer.register({
          kind: "exact",
          path: ROUTES.mediaFile,
          handler: async (req, res) => {
            if (!admitRequest(ctx, req, res, "GET")) return;
            const params = new URL(req.url ?? "/", "http://host").searchParams;
            const sessionId = validSessionId(params.get("sessionId") ?? "");
            const record = sessionId === undefined ? undefined : mediaSessions.get(sessionId).recent.find((r) => r.id === params.get("id"));
            const type = record === undefined ? undefined : MEDIA_FILE_TYPES[extname(record.file).toLowerCase()];
            if (record === undefined || type === undefined || !existsSync(record.file)) {
              sendJson(res, 404, { ok: false, error: "not-found" });
              return;
            }
            try {
              if (!type.startsWith("video/")) {
                const bytes = readFileSync(record.file);
                res.writeHead(200, {
                  "cache-control": "no-store",
                  "content-type": type,
                  "content-length": String(bytes.byteLength),
                  "x-content-type-options": "nosniff",
                });
                res.end(bytes);
                return;
              }
              // Videos are streamed, with single byte ranges so <video> can seek.
              const size = statSync(record.file).size;
              const range = byteRange(req.headers?.range, size);
              if (range === null) {
                res.writeHead(416, { "content-range": `bytes */${size}` });
                res.end();
                return;
              }
              const [start, end] = range ?? [0, size - 1];
              res.writeHead(range === undefined ? 200 : 206, {
                "cache-control": "no-store",
                "content-type": type,
                "accept-ranges": "bytes",
                "content-length": String(size === 0 ? 0 : end - start + 1),
                ...(range === undefined ? {} : { "content-range": `bytes ${start}-${end}/${size}` }),
                "x-content-type-options": "nosniff",
              });
              if (size === 0) {
                res.end();
                return;
              }
              const stream = createReadStream(record.file, { start, end });
              stream.on("error", () => res.destroy?.());
              res.on?.("close", () => stream.destroy());
              stream.pipe(res);
            } catch {
              sendJson(res, 404, { ok: false, error: "not-found" });
            }
          },
        }),
      ];
      return () => {
        for (const dispose of disposers) dispose?.();
      };
    }, "cpa: webserver routes");
  });

  return {};
}
