// Activation job tracking, session-status heartbeat and generation run recording.

import { basename, isAbsolute, join, relative, sep } from "node:path";
import { MediaError } from "../../media.js";

export function createSessionStatus(shared) {
  const { ctx, mediaSessions } = shared;
  // #region Background generation jobs and the session's "running" state
  //
  // `/cpa-image` returns as soon as the request is admitted, so the composer
  // clears the draft at once; the generation continues here and its chat row
  // follows it through `media/command`. DSH counts only agent turns as
  // running, so while a job runs this plugin publishes the host's own
  // `api-session/status` event for that session (the workspace list shows it
  // as running, then completed). It is republished every few seconds and
  // after the agent itself goes idle, because those reset it to idle.

  const mediaJobs = new Map(); // job key → { sessionId, abort }
  // job key → the promise of a job of this activation, until it settles (the agent tool waits on it).
  const jobPromises = new Map();
  const settleWith = (key, promise) => {
    jobPromises.set(key, promise);
    void promise.finally(() => {
      if (jobPromises.get(key) === promise) jobPromises.delete(key);
    });
    return promise;
  };
  shared.mediaJobSeq = 0;
  let mediaHeartbeat;
  const MEDIA_HEARTBEAT_MS = 5000;
  const jobSessions = () => new Set([...mediaJobs.values()].map((job) => job.sessionId).filter(Boolean));
  const agentRunning = (sessionId) => {
    try {
      return ctx.get?.("agents")?.get?.(sessionId)?.status === "running";
    } catch {
      return false;
    }
  };
  const publishSessionStatus = (sessionId, running) => {
    if (typeof ctx.emit !== "function") return;
    try {
      ctx.emit("api-session/status", sessionId, running);
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not publish the session status: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const settleSessionStatus = (sessionId) => {
    if (sessionId === undefined || jobSessions().has(sessionId) || agentRunning(sessionId)) return;
    publishSessionStatus(sessionId, false);
  };
  const syncHeartbeat = () => {
    if (mediaJobs.size > 0 && mediaHeartbeat === undefined) {
      mediaHeartbeat = setInterval(() => {
        for (const sessionId of jobSessions()) publishSessionStatus(sessionId, true);
      }, MEDIA_HEARTBEAT_MS);
      mediaHeartbeat.unref?.();
    } else if (mediaJobs.size === 0 && mediaHeartbeat !== undefined) {
      clearInterval(mediaHeartbeat);
      mediaHeartbeat = undefined;
    }
  };
  ctx.on?.("agent/status", (event) => {
    const sessionId = event?.agent?.id;
    if (event?.status === "running" || !jobSessions().has(sessionId)) return;
    // After the host's own idle notice for this transition.
    setTimeout(() => {
      if (jobSessions().has(sessionId)) publishSessionStatus(sessionId, true);
    }, 0);
  });
  ctx.effect(
    () => () => {
      const sessions = jobSessions();
      for (const job of mediaJobs.values()) job.abort.abort(new MediaError("interrupted"));
      mediaJobs.clear();
      syncHeartbeat();
      for (const sessionId of sessions) settleSessionStatus(sessionId);
    },
    "cpa: generation jobs"
  );

  /** Update one run record (and prepend new recent outputs) in the session store; never throws. */
  const recordRun = (sessionId, commandId, patch, recent = []) => {
    if (sessionId === undefined) return;
    try {
      mediaSessions.update(sessionId, (entry) => {
        if (recent.length > 0) entry.recent = [...recent, ...entry.recent];
        if (commandId === undefined) return;
        const index = entry.runs.findIndex((run) => run.commandId === commandId);
        if (index >= 0) entry.runs[index] = { ...entry.runs[index], ...patch };
        else entry.runs = [{ commandId, ...patch }, ...entry.runs];
      });
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not record a generation result: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** How the chat row names the save folder: relative to the working directory when inside it. */
  const folderLabel = (cwd, dir) => {
    const rel = relative(cwd, dir);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : basename(dir);
  };

  return { mediaJobs, jobPromises, settleWith, mediaHeartbeat, MEDIA_HEARTBEAT_MS, jobSessions, agentRunning, publishSessionStatus, settleSessionStatus, syncHeartbeat, recordRun, folderLabel };
}
