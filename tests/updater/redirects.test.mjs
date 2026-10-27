// Bounded, validated tarball redirects with immutable metadata integrity.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  UPDATE_PACKAGE, UPDATE_REGISTRIES,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, integrity, deferred, manifest, packageEntries, fixture, goodPackage, metadata, jsonResponse, bytesResponse, pendingFetch, harness, assertSafeRequest,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

describe("bounded validated tarball redirects with immutable metadata integrity", () => {
  const registryPath = `/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`;
  const cnUrl = `${UPDATE_REGISTRIES.cn}${registryPath}`;
  const globalUrl = `${UPDATE_REGISTRIES.global}${registryPath}`;
  const cdnPath = `/packages/${UPDATE_PACKAGE}/${VERSION}/${UPDATE_PACKAGE}-${VERSION}.tgz`;
  const cdnUrl = `https://cdn.npmmirror.com${cdnPath}`;
  const redirectResponse = (location, status = 302, extraHeaders = {}) => new Response("discard redirect body", {
    status, headers: { ...(location === undefined ? {} : { location }), ...extraHeaders },
  });

  for (const code of [301, 302, 303, 307, 308]) test(`CN ${code} follows only the exact official CDN package URL`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    let cancelled = 0;
    h.setFetch((url) => {
      if (url === cnUrl) return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: code, headers: { location: cdnUrl } });
      assert.equal(url, cdnUrl);
      return bytesResponse(goodPackage.bytes);
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, null); assert.equal(status.downloadedVersion, VERSION);
    assert.equal(status.effectiveRegion, "cn"); assert.equal(h.stored.length, 1);
    assert.deepEqual(h.stored[0].bytes, goodPackage.bytes); assert.equal(cancelled, 1);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl]);
    h.calls.forEach(assertSafeRequest);
    assert.equal(h.calls[1].init.signal, h.calls[2].init.signal);
  });

  for (const [name, location] of [
    ["HTTP downgrade", `http://cdn.npmmirror.com${cdnPath}`],
    ["external host", `https://evil.invalid${cdnPath}`],
    ["CDN hostname suffix spoof", `https://cdn.npmmirror.com.evil.invalid${cdnPath}`],
    ["loopback IPv4", `https://127.0.0.1${cdnPath}`],
    ["localhost", `https://localhost${cdnPath}`],
    ["loopback IPv6", `https://[::1]${cdnPath}`],
    ["local file URL", "file:///tmp/never-read.tgz"],
    ["cross-region npmjs", globalUrl],
    ["credentials", `https://user:password@cdn.npmmirror.com${cdnPath}`],
    ["unexpected port", `https://cdn.npmmirror.com:8443${cdnPath}`],
    ["query string", `${cdnUrl}?token=not-forwarded`],
    ["fragment", `${cdnUrl}#untrusted`],
    ["wrong package", cdnUrl.replaceAll(UPDATE_PACKAGE, "other-package")],
    ["wrong version", cdnUrl.replaceAll(VERSION, "9.9.9")],
    ["wrong CDN layout", `https://cdn.npmmirror.com${registryPath}`],
    ["wrong registry layout", `${UPDATE_REGISTRIES.cn}${cdnPath}`],
    ["wrong relative path", "/packages/other/wrong.tgz"],
    ["encoded path segment", cdnUrl.replace("/packages/", "/%70ackages/")],
    ["missing Location", undefined],
    ["malformed URL", "https://[invalid-host"],
  ]) test(`CN redirect rejects ${name} before a second fetch`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    const response = redirectResponse(location);
    h.setFetch(() => response);
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.calls.length, 2);
    assert.equal(h.stored.length, 0); assert.equal(status.downloadPath, null); assert.equal(status.upgradeCommand, null);
    assert.equal(response.bodyUsed, true, "rejected redirect body is cancelled");
    assertSafeRequest(h.calls[1]);
  });

  for (const target of [cnUrl, cdnUrl]) test(`global source refuses cross-region redirect to ${new URL(target).hostname}`, async (t) => {
    const h = harness(t); await h.updater.check(); h.setFetch(() => redirectResponse(target));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.calls.length, 2); assert.equal(h.stored.length, 0);
    assert.equal(h.calls[1].url, globalUrl);
  });

  test("metadata always uses redirect:error and never follows even an allowed registry Location", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => redirectResponse(`${UPDATE_REGISTRIES.cn}/${UPDATE_PACKAGE}/latest`) });
    const status = await h.updater.check();
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.redirect, "error");
    assert.equal(status.errorCode, "invalid-package"); assert.equal(h.stored.length, 0);
  });

  test("exactly three validated redirect hops succeed, including same-region relative Location", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    let requests = 0;
    h.setFetch(() => {
      requests++;
      if (requests === 1) return redirectResponse(cdnUrl);
      if (requests === 2) return redirectResponse(cnUrl, 307);
      if (requests === 3) return redirectResponse(registryPath, 308);
      return bytesResponse(goodPackage.bytes);
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, null); assert.equal(status.downloadedVersion, VERSION);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl, cnUrl, cnUrl]);
    assert.equal(requests, 4); assert.equal(h.stored.length, 1);
    h.calls.forEach(assertSafeRequest);
  });

  test("redirect loops stop after three hops and cancel every redirect response", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    const responses = [];
    h.setFetch((url) => {
      const response = redirectResponse(url === cnUrl ? cdnUrl : cnUrl);
      responses.push(response); return response;
    });
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "invalid-package"); assert.equal(responses.length, 4);
    assert.ok(responses.every((response) => response.bodyUsed));
    assert.equal(h.calls.length, 5); assert.equal(h.stored.length, 0); assert.equal(status.downloadPath, null);
  });

  test("CDN redirect headers cannot replace the original metadata SHA-512", async (t) => {
    const attacker = fixture({ entries: packageEntries().map((entry) => entry.name === "package/lib/index.js" ? { ...entry, data: "different archive with the same manifest" } : entry) });
    assert.notEqual(attacker.expected.integrity, goodPackage.expected.integrity);
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl
      ? redirectResponse(cdnUrl, 302, { integrity: attacker.expected.integrity, "x-integrity": attacker.expected.integrity })
      : bytesResponse(attacker.bytes, { headers: { integrity: attacker.expected.integrity } }));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, "integrity-error"); assert.equal(h.stored.length, 0);
    assert.equal(status.downloadPath, null); assert.equal(status.upgradeCommand, null);
    assert.deepEqual(h.calls.slice(1).map((call) => call.url), [cnUrl, cdnUrl]);
  });

  for (const [code, expected] of [[404, "channel-unavailable"], [500, "network-error"]]) test(`CDN final HTTP ${code} is sanitized and never stored`, async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl ? redirectResponse(cdnUrl) : bytesResponse("fake failure", { status: code }));
    const status = await h.updater.download(VERSION);
    assert.equal(status.errorCode, expected); assert.equal(h.stored.length, 0); assert.equal(h.calls.length, 3);
  });

  test("CDN final response retains the download byte bound", async (t) => {
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url) => url === cnUrl ? redirectResponse(cdnUrl) : bytesResponse("small", { headers: { "content-length": String(8 * 1024 * 1024 + 1) } }));
    assert.equal((await h.updater.download(VERSION)).errorCode, "invalid-package");
    assert.equal(h.stored.length, 0);
  });

  test("dispose aborts the CDN follow-up request using the same signal", async (t) => {
    const entered = deferred(), gate = deferred();
    const h = harness(t, { settings: { region: "cn" }, fetch: () => jsonResponse(metadata(VERSION, { region: "cn" })) });
    await h.updater.check();
    h.setFetch((url, { signal }) => {
      if (url === cnUrl) return redirectResponse(cdnUrl);
      entered.resolve(); return pendingFetch(signal, gate);
    });
    const pending = h.updater.download(VERSION); await entered.promise; h.updater.dispose(); await pending;
    assert.equal(h.calls[1].init.signal, h.calls[2].init.signal); assert.ok(h.calls[2].init.signal.aborted);
    assert.equal(h.stored.length, 0); assert.equal(h.updater.status().upgradeCommand, null);
  });
});
