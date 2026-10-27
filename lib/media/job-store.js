// Durable, URL-free video jobs and finished-job retention.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { REQUEST_ID_PATTERN, ACCOUNT_ID_PATTERN, MAX_OUTPUT_DIR, VIDEO_SECONDS } from "./constants.js";
import { validSessionId, validCommandId } from "./session-store.js";
import { plain, clip, intIn } from "./util.js";

// #region Video job store (media-jobs.json)

export const MEDIA_JOBS_VERSION = 1;
const JOB_STATES = ["submitted", "done", "failed", "expired"];
const MAX_JOBS = 200;
const FINISHED_JOB_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One submitted video, enough to resume polling and saving after a reload or
 * restart: CPA's request id, the account and model, where to save, and the
 * chat row it belongs to. Never keys or upstream URLs.
 */
export function normalizeJob(value) {
  const job = plain(value);
  if (job === undefined || typeof job.id !== "string" || !REQUEST_ID_PATTERN.test(job.id)) return undefined;
  if (!JOB_STATES.includes(job.state) || typeof job.accountId !== "string" || !ACCOUNT_ID_PATTERN.test(job.accountId)) return undefined;
  if (typeof job.modelId !== "string" || job.modelId === "" || typeof job.cwd !== "string" || !isAbsolute(job.cwd)) return undefined;
  if (typeof job.submittedAt !== "string" || !Number.isFinite(Date.parse(job.submittedAt))) return undefined;
  return {
    id: job.id,
    state: job.state,
    accountId: job.accountId,
    modelId: job.modelId.slice(0, 300),
    ref: clip(job.ref, 400),
    ...(validSessionId(job.sessionId) === undefined ? {} : { sessionId: job.sessionId }),
    ...(validCommandId(job.commandId) === undefined ? {} : { commandId: job.commandId }),
    cwd: job.cwd,
    outputDir: typeof job.outputDir === "string" && job.outputDir !== "" ? job.outputDir.slice(0, MAX_OUTPUT_DIR) : "generated",
    prompt: clip(job.prompt, 4000),
    seconds: intIn(job.seconds, VIDEO_SECONDS) ?? 6,
    submittedAt: job.submittedAt.slice(0, 40),
    ...(typeof job.finishedAt === "string" ? { finishedAt: job.finishedAt.slice(0, 40) } : {}),
  };
}

export function normalizeMediaJobs(raw, now = Date.now()) {
  const jobs = [];
  const seen = new Set();
  for (const item of Array.isArray(plain(raw)?.jobs) ? raw.jobs : []) {
    const job = normalizeJob(item);
    if (job === undefined || seen.has(job.id)) continue;
    if (job.state !== "submitted" && now - Date.parse(job.finishedAt ?? job.submittedAt) > FINISHED_JOB_KEEP_MS) continue;
    seen.add(job.id);
    jobs.push(job);
    if (jobs.length >= MAX_JOBS) break;
  }
  return { version: MEDIA_JOBS_VERSION, jobs };
}

/**
 * Video jobs in their own file, re-read on every access; atomic writes; a
 * damaged file loads as empty and is kept as `*.corrupt-*.json` by the next write.
 */
export function createMediaJobStore(filePath, { now = () => Date.now() } = {}) {
  const read = () => {
    if (!existsSync(filePath)) return { data: normalizeMediaJobs({}, now()) };
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      if (plain(raw) === undefined) return { data: normalizeMediaJobs({}, now()), damaged: true };
      return { data: normalizeMediaJobs(raw, now()) };
    } catch {
      return { data: normalizeMediaJobs({}, now()), damaged: true };
    }
  };
  const write = (data, damaged) => {
    const next = normalizeMediaJobs(data, now());
    mkdirSync(dirname(filePath), { recursive: true });
    if (damaged && existsSync(filePath)) renameSync(filePath, filePath.replace(/\.json$/, `.corrupt-${Date.now().toString(36)}.json`));
    const tmp = `${filePath}.${Date.now().toString(36)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tmp, filePath);
    return next;
  };
  return {
    list() {
      return read().data.jobs;
    },
    get(id) {
      return read().data.jobs.find((job) => job.id === id);
    },
    /** Insert or merge one job (newest first). */
    put(job) {
      const { data, damaged } = read();
      const index = data.jobs.findIndex((j) => j.id === job.id);
      if (index >= 0) data.jobs[index] = { ...data.jobs[index], ...job };
      else data.jobs.unshift(job);
      return write(data, damaged).jobs.find((j) => j.id === job.id);
    },
  };
}

// #endregion
