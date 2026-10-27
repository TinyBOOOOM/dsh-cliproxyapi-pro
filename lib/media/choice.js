// Enabled generation options and unambiguous model selection.
import { mediaModelEnabled } from "./settings.js";
import { MediaError } from "./util.js";

// #region Model choice

/**
 * Generation models a user may pick: enabled models of the given kind on
 * enabled accounts. `ref` is `<accountId>/<modelId>` (an account id never
 * contains a slash; a model id may).
 * @param accounts - `controller.mediaAccounts()` entries.
 */
export function mediaOptions(accounts, settings, kind) {
  const out = [];
  for (const account of accounts ?? []) {
    if (account.enabled !== true) continue;
    for (const model of account.models ?? []) {
      if (model.kind !== kind || !mediaModelEnabled(settings, account.id, model.id)) continue;
      out.push({
        ref: `${account.id}/${model.id}`,
        accountId: account.id,
        accountName: account.displayName || account.id,
        modelId: model.id,
        ...(model.name === undefined ? {} : { name: model.name }),
        ...(model.aliasOf === undefined ? {} : { aliasOf: model.aliasOf }),
      });
    }
  }
  return out;
}

/** Split a selection ref at its first slash. */
export function splitMediaRef(ref) {
  const value = typeof ref === "string" ? ref.trim() : "";
  const slash = value.indexOf("/");
  return slash > 0 && slash < value.length - 1
    ? { accountId: value.slice(0, slash), modelId: value.slice(slash + 1) }
    : undefined;
}

/**
 * Match what a user typed (`-m`): a full ref, then an exact model id, then a
 * unique case-insensitive substring of the model id. Never guesses between
 * several candidates.
 * @throws MediaError `model-not-found` / `model-ambiguous` (detail lists refs).
 */
export function matchMediaModel(options, requested) {
  const wanted = String(requested ?? "").trim();
  const lower = wanted.toLowerCase();
  const byRef = options.find((o) => o.ref === wanted);
  if (byRef !== undefined) return byRef;
  const pick = (list) => {
    if (list.length === 1) return list[0];
    if (list.length > 1) throw new MediaError("model-ambiguous", list.map((o) => o.ref).join(", "));
    return undefined;
  };
  const exact = pick(options.filter((o) => o.modelId.toLowerCase() === lower));
  if (exact !== undefined) return exact;
  const partial = pick(lower === "" ? [] : options.filter((o) => o.modelId.toLowerCase().includes(lower)));
  if (partial !== undefined) return partial;
  throw new MediaError("model-not-found", options.map((o) => o.ref).join(", "));
}

/**
 * The model a generation uses: an explicit request, else the session's pick,
 * else the last pick anywhere, else the only option.
 * @returns `{ option, source }` with source `request | session | last | only`.
 * @throws MediaError `no-media-model` or `choose-model` (several, none picked).
 */
export function chooseMediaModel({ options, requested, sessionRef, lastRef }) {
  if (typeof requested === "string" && requested.trim() !== "") {
    return { option: matchMediaModel(options, requested), source: "request" };
  }
  const session = options.find((o) => o.ref === sessionRef);
  if (session !== undefined) return { option: session, source: "session" };
  const last = options.find((o) => o.ref === lastRef);
  if (last !== undefined) return { option: last, source: "last" };
  if (options.length === 1) return { option: options[0], source: "only" };
  if (options.length === 0) throw new MediaError("no-media-model");
  throw new MediaError("choose-model", options.map((o) => o.ref).join(", "));
}

// #endregion
