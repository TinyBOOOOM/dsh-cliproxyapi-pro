// Registry metadata validation and bounded fetches with validated tarball redirects.
import { UPDATE_PACKAGE, UPDATE_TAGS } from "./constants.js";
import { fail } from "./errors.js";
import { parseUpdateVersion } from "./version.js";

export function integrityDigest(integrity) {
  if (typeof integrity !== "string") fail("invalid-metadata");
  const token = integrity.split(/\s+/).find((part) => /^sha512-[A-Za-z0-9+/]{86}==$/.test(part));
  if (!token) fail("invalid-metadata");
  const digest = Buffer.from(token.slice(7), "base64");
  if (digest.length !== 64) fail("invalid-metadata");
  return digest;
}

export function validateUpdateMetadata(raw, channel) {
  if (!Object.hasOwn(UPDATE_TAGS, channel)) fail("invalid-metadata");
  const parsed = parseUpdateVersion(raw?.version);
  if (raw?.name !== UPDATE_PACKAGE || !parsed || channel === "stable" && parsed.pre.length) fail("invalid-metadata");
  // Keep channels honest even if an upstream dist-tag is accidentally moved.
  if (channel !== "stable" && parsed.pre.length && !parsed.pre.some((p) => p === channel)) fail("invalid-metadata");
  let url;
  try { url = new URL(raw?.dist?.tarball); } catch { fail("invalid-metadata"); }
  const hosts = ["registry.npmjs.org", "registry.npmmirror.com"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) fail("invalid-metadata");
  if (url.pathname !== `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${raw.version}.tgz`) fail("invalid-metadata");
  integrityDigest(raw.dist.integrity);
  return { version: raw.version, integrity: raw.dist.integrity };
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); fail("invalid-package"); }
  const chunks = [];
  let length = 0;
  if (!response.body) fail("network-error");
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxBytes) { await reader.cancel(); fail("invalid-package"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

function allowedDownloadUrl(value, version, region) {
  let url;
  try { url = new URL(value); } catch { fail("invalid-package"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) fail("invalid-package");
  const registryPath = `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${version}.tgz`;
  const cdnPath = `/packages/${UPDATE_PACKAGE}/${version}/${UPDATE_PACKAGE}-${version}.tgz`;
  if (region === "global") {
    if (url.hostname !== "registry.npmjs.org" || url.pathname !== registryPath) fail("invalid-package");
  } else if (!(url.hostname === "registry.npmmirror.com" && url.pathname === registryPath ||
               url.hostname === "cdn.npmmirror.com" && url.pathname === cdnPath)) fail("invalid-package");
  return url.href;
}

export async function fetchBytes(fetcher, url, signal, limit, download = null) {
  // npmmirror redirects tarballs to its official CDN. Follow only bounded,
  // exact package/version URLs; never let fetch follow an unvalidated location.
  for (let redirects = 0; ; redirects++) {
    const response = await fetcher(url, {
      signal, redirect: download ? "manual" : "error", credentials: "omit",
      headers: { accept: "application/json, application/octet-stream" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!download || redirects >= 3 || !location) fail("invalid-package");
      let next;
      try { next = new URL(location, url).href; } catch { fail("invalid-package"); }
      url = allowedDownloadUrl(next, download.version, download.region);
      continue;
    }
    if (response.status === 404) { await response.body?.cancel(); fail("channel-unavailable"); }
    if (!response.ok) { await response.body?.cancel(); fail("network-error"); }
    return readBounded(response, limit);
  }
}
