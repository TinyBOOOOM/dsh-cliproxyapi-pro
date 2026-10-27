// Update error type: page-facing codes plus log-only details.

export class UpdateError extends Error {
  /** `detail` is a short diagnostic for logs only; the UI shows `code`. */
  constructor(code, detail) { super(code); this.code = code; if (detail) this.detail = detail; }
}
export const fail = (code, detail) => { throw new UpdateError(code, detail); };
export const printable = (value) => String(value).replace(/[^\x20-\x7e]/g, "?").slice(0, 160);
