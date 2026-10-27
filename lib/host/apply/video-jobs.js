// Persistent video submission/poll/download/resume and in-memory source links.

import { join } from "node:path";
import { MediaError, outputDirectory, outputStem, recentEntry, createMediaJobStore, downloadVideo, retrieveVideo, VIDEO_JOB_TTL_MS } from "../../media.js";

export function createVideoJobs(shared) {
  const { ctx, updateDirectory, controller, mediaFailureText, mediaJobs, settleWith, publishSessionStatus, settleSessionStatus, syncHeartbeat, recordRun, folderLabel } = shared;
  // #region Video jobs (/cpa-video)
  //
  // A video is submitted once and cannot be cancelled (CPA and xAI have no
  // cancel route). The job is stored in media-jobs.json as soon as CPA
  // returns its request id, polled (5 s, then 10 s, then 15 s) and downloaded
  // through CPA into the session's folder. A reload or restart only pauses
  // the polling: the next activation resumes every stored job younger than
  // CPA's 3-hour request binding, and marks older ones expired.

  const mediaJobStore = createMediaJobStore(join(updateDirectory, "media-jobs.json"));
  // commandId → { phase: "submitting" | "queued" | "running" | "downloading", progress? } for the chat row.
  const videoLive = new Map();
  // commandId → { url, accountId, accountName, seconds, sessionId, commandId, at }: the short-lived
  // result URL of a finished video, for /cpa-video-edit and /cpa-video-extend.
  // In memory only (never stored, logged or sent to the page); a reload forgets it.
  const videoSources = new Map();
  // xAI calls its result URLs ephemeral without a number; offer them for an hour.
  const VIDEO_SOURCE_TTL_MS = 60 * 60 * 1000;
  const MAX_VIDEO_SOURCES = 100;
  const rememberSource = (job, status) => {
    if (job.commandId === undefined || status.sourceUrl === undefined) return;
    videoSources.delete(job.commandId);
    videoSources.set(job.commandId, {
      url: status.sourceUrl,
      accountId: job.accountId,
      seconds: status.seconds ?? job.seconds,
      sessionId: job.sessionId,
      commandId: job.commandId,
      at: Date.now(),
    });
    while (videoSources.size > MAX_VIDEO_SOURCES) videoSources.delete(videoSources.keys().next().value);
  };
  const usableSource = (commandId) => {
    const source = videoSources.get(commandId);
    return source !== undefined && Date.now() - source.at <= VIDEO_SOURCE_TTL_MS ? source : undefined;
  };

  const sleep = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      timer.unref?.();
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });

  const pollDelay = (elapsedMs) => (elapsedMs < 60_000 ? 5000 : elapsedMs < 180_000 ? 10_000 : 15_000);
  const MAX_POLL_FAILURES = 12;

  /** Poll, download and record one submitted video; a dispose abort leaves it stored for the next activation. */
  const followVideoJob = async (job, abort) => {
    const live = (patch) => {
      if (job.commandId !== undefined) videoLive.set(job.commandId, { ...(videoLive.get(job.commandId) ?? {}), ...patch });
    };
    const finish = (state, runPatch, recent = []) => {
      mediaJobStore.put({ ...job, state, finishedAt: new Date().toISOString() });
      recordRun(job.sessionId, job.commandId, { ...runPatch, finishedAt: new Date().toISOString() }, recent);
    };
    const fail = (error) => {
      const code = error instanceof MediaError ? error.code : "failed";
      finish(code === "expired" ? "expired" : "failed", { status: "error", errorCode: code, error: mediaFailureText(error, "video") });
      ctx.logger?.warn?.(`cpa: /cpa-video ${job.id} failed: ${mediaFailureText(error, "video")}`);
    };
    const submitted = Date.parse(job.submittedAt);
    let failures = 0;
    live({ phase: "queued" });
    try {
      for (;;) {
        if (Date.now() - submitted > VIDEO_JOB_TTL_MS) throw new MediaError("expired");
        let endpoint;
        let status;
        try {
          endpoint = await controller.mediaEndpoint(job.accountId);
          status = await retrieveVideo({ rootURL: endpoint.rootURL, apiKey: endpoint.apiKey, requestId: job.id, signal: abort.signal });
          failures = 0;
        } catch (error) {
          if (abort.signal.aborted) throw error;
          // A missing account or a refusal that keeps coming back ends the job;
          // network trouble and short CPA hiccups are retried.
          if (error instanceof MediaError && error.code === "invalid-account") throw error;
          failures += 1;
          if (failures >= MAX_POLL_FAILURES) throw error;
          await sleep(pollDelay(Date.now() - submitted), abort.signal);
          continue;
        }
        if (status.state === "failed") throw new MediaError("video-failed", status.error);
        if (status.state === "done") {
          live({ phase: "downloading", progress: 100 });
          const dir = outputDirectory(job.cwd, job.outputDir);
          const path = await downloadVideo({
            rootURL: endpoint.rootURL,
            apiKey: endpoint.apiKey,
            requestId: job.id,
            dir,
            stem: outputStem(job.modelId, job.prompt),
            signal: abort.signal,
          });
          finish("done", { status: "done", files: 1, folder: folderLabel(job.cwd, dir) }, [recentEntry("video", path, job.ref, new Date(), job.commandId)]);
          rememberSource(job, status);
          ctx.logger?.info?.(`cpa: /cpa-video ${job.id} saved after ${Math.round((Date.now() - submitted) / 1000)} s`);
          return;
        }
        live({ phase: status.state, ...(status.progress === undefined ? {} : { progress: status.progress }) });
        await sleep(pollDelay(Date.now() - submitted), abort.signal);
      }
    } catch (error) {
      if (abort.signal.aborted) return; // paused by a reload; resumed by the next activation
      fail(error);
    }
  };

  /** Track one job in the session's running state until it settles. */
  const trackVideoJob = (key, sessionId, run) => {
    const abort = new AbortController();
    mediaJobs.set(key, { sessionId, abort });
    syncHeartbeat();
    if (sessionId !== undefined) publishSessionStatus(sessionId, true);
    return settleWith(key, (async () => {
      try {
        await run(abort);
      } finally {
        if (mediaJobs.get(key)?.abort === abort) mediaJobs.delete(key);
        videoLive.delete(key);
        syncHeartbeat();
        settleSessionStatus(sessionId);
      }
    })());
  };

  /**
   * Submit one admitted video through `submit(signal)` (generation, edit or
   * extension), store the job, then follow it.
   */
  const startVideoJob = ({ sessionId, commandId, accountId, modelId, ref, prompt, seconds, cwd, outputDir, submit, label }) => {
    const key = commandId ?? `job-${++shared.mediaJobSeq}`;
    if (commandId !== undefined) videoLive.set(commandId, { phase: "submitting" });
    return trackVideoJob(key, sessionId, async (abort) => {
      let requestId;
      try {
        // `submit` may settle the final prompt / length first (parameter interpretation).
        const submitted = await submit(abort.signal);
        requestId = submitted.requestId;
        if (typeof submitted.prompt === "string") prompt = submitted.prompt;
        if (Number.isInteger(submitted.seconds)) seconds = submitted.seconds;
      } catch (thrown) {
        // Cut off before CPA answered: whether it was submitted is unknown.
        const error = abort.signal.aborted ? new MediaError("interrupted") : thrown;
        recordRun(sessionId, commandId, {
          status: "error",
          errorCode: error instanceof MediaError ? error.code : "failed",
          error: mediaFailureText(error, "video"),
          finishedAt: new Date().toISOString(),
        });
        ctx.logger?.warn?.(`cpa: ${label} was not submitted: ${mediaFailureText(error, "video")}`);
        return;
      }
      const job = mediaJobStore.put({
        id: requestId,
        state: "submitted",
        accountId,
        modelId,
        ref,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(commandId === undefined ? {} : { commandId }),
        cwd,
        outputDir,
        prompt,
        seconds,
        submittedAt: new Date().toISOString(),
      });
      recordRun(sessionId, commandId, { videoId: requestId });
      ctx.logger?.info?.(`cpa: ${label} submitted ${requestId} (${modelId}, ${seconds} s)`);
      await followVideoJob(job, abort);
    });
  };
  /** Resume every stored job that is still running (after a reload or restart). */
  const resumeVideoJobs = () => {
    let jobs;
    try {
      jobs = mediaJobStore.list().filter((job) => job.state === "submitted");
    } catch (error) {
      ctx.logger?.warn?.(`cpa: could not read media-jobs.json: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    for (const job of jobs) {
      const key = job.commandId ?? `video-${job.id}`;
      if (mediaJobs.has(key)) continue;
      void trackVideoJob(key, job.sessionId, (abort) => followVideoJob(job, abort));
    }
  };

  return { mediaJobStore, videoLive, videoSources, VIDEO_SOURCE_TTL_MS, usableSource, startVideoJob, resumeVideoJobs };
}
