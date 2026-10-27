// Strict SemVer parsing and precedence for update candidates.
import { fail } from "./errors.js";

// Strict SemVer, including prerelease precedence. Never reuse model-name sorting.
export function parseUpdateVersion(value) {
  if (typeof value !== "string" || value.length > 128) return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n))) return null;
  const pre = match[4]?.split(".") ?? [];
  if (pre.some((p) => /^\d+$/.test(p) && (p.length > 1 && p.startsWith("0") || !Number.isSafeInteger(Number(p))))) return null;
  return { parts, pre };
}

export function compareUpdateVersions(a, b) {
  const x = parseUpdateVersion(a), y = parseUpdateVersion(b);
  if (!x || !y) fail("invalid-metadata");
  for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
  if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined || y.pre[i] === undefined) return x.pre[i] === undefined ? -1 : 1;
    const p = x.pre[i], q = y.pre[i];
    if (p === q) continue;
    const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) > Number(q) ? 1 : -1;
    if (pn !== qn) return pn ? -1 : 1;
    return p > q ? 1 : -1;
  }
  return 0;
}
