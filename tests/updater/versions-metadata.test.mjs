// Strict SemVer, channels and registry metadata validation.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  UPDATE_PACKAGE, compareUpdateVersions, parseUpdateVersion, validateUpdateMetadata,
} from "../../lib/updater/index.js";
import {
  guardRealFetch, VERSION, hasCode, integrity, goodPackage, metadata,
} from "../helpers/updater-fixtures.mjs";

guardRealFetch();

describe("strict SemVer and registry metadata", () => {
  test("rejects coercion, leading zeroes, unsafe integers, whitespace and shell/path syntax", () => {
    assert.deepEqual(parseUpdateVersion("1.2.3-beta.2+build.004"), { parts: [1, 2, 3], pre: ["beta", "2"] });
    assert.deepEqual(parseUpdateVersion("0.0.0"), { parts: [0, 0, 0], pre: [] });
    for (const value of [null, 123, {}, "", "v1.2.3", "=1.2.3", " 1.2.3", "1.2.3 ", "1.2.3\n", "1.2", "01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3-beta.01", "1.2.3-", "1.2.3+", "1.2.3-a..b", "1.2.3+a..b", "1.2.3_beta", "9007199254740992.0.0", "1.0.0-9007199254740992", "1.0.0/../../x", "1.0.0;echo bad", "1.0.0+" + "a".repeat(128)]) assert.equal(parseUpdateVersion(value), null, JSON.stringify(value));
  });
  test("SemVer prerelease precedence is numeric, not model sorting; builds do not affect precedence", () => {
    const versions = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0", "10.0.0"];
    for (let i = 0; i < versions.length; i++) {
      assert.equal(compareUpdateVersions(versions[i], versions[i]), 0);
      for (let j = i + 1; j < versions.length; j++) {
        assert.equal(compareUpdateVersions(versions[i], versions[j]), -1);
        assert.equal(compareUpdateVersions(versions[j], versions[i]), 1);
      }
    }
    assert.equal(compareUpdateVersions("1.0.0+first", "1.0.0+second"), 0);
    assert.throws(() => compareUpdateVersions("v1.0.0", "1.0.0"), hasCode("invalid-metadata"));
    assert.throws(() => compareUpdateVersions("1.0.0", "bad"), hasCode("invalid-metadata"));
  });
  test("requires the package identity and exact allowlisted HTTPS tarball location", () => {
    for (const region of ["global", "cn"]) assert.deepEqual(validateUpdateMetadata(metadata(VERSION, { region }), "stable"), goodPackage.expected);
    const valid = metadata();
    const urls = [
      `http://registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org.evil.invalid/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://evil.invalid/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org:8443/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://user:password@registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `${valid.dist.tarball}?token=fake`, `${valid.dist.tarball}#fragment`,
      `https://registry.npmjs.org/other/-/${UPDATE_PACKAGE}-${VERSION}.tgz`,
      `https://registry.npmjs.org/${UPDATE_PACKAGE}/-/${UPDATE_PACKAGE}-9.9.9.tgz`,
      `${valid.dist.tarball}/extra`, "file:///tmp/fake.tgz", "not a URL",
    ];
    for (const tarball of urls) assert.throws(() => validateUpdateMetadata({ ...valid, dist: { ...valid.dist, tarball } }, "stable"), hasCode("invalid-metadata"), tarball);
    for (const raw of [null, {}, { ...valid, name: "other" }, { ...valid, version: "v1.5.0" }, { ...valid, dist: null }]) assert.throws(() => validateUpdateMetadata(raw, "stable"), hasCode("invalid-metadata"));
  });
  test("stable/beta/dev reject wrong prerelease tags and unknown channels, allow release promotion", () => {
    for (const channel of ["stable", "beta", "dev"]) assert.equal(validateUpdateMetadata(metadata(), channel).version, VERSION);
    for (const channel of ["beta", "dev"]) assert.equal(validateUpdateMetadata(metadata(`${VERSION}-${channel}.2`), channel).version, `${VERSION}-${channel}.2`);
    for (const [channel, version] of [["stable", `${VERSION}-beta.1`], ["stable", `${VERSION}-dev.1`], ["beta", `${VERSION}-dev.1`], ["dev", `${VERSION}-beta.1`], ["beta", `${VERSION}-alphabetabeta.1`], ["dev", `${VERSION}-rc.1`]]) assert.throws(() => validateUpdateMetadata(metadata(version), channel), hasCode("invalid-metadata"));
    for (const channel of [undefined, null, "latest", "toString", "preview"]) assert.throws(() => validateUpdateMetadata(metadata(), channel), hasCode("invalid-metadata"));
  });
  test("sha512 SRI must be complete; weaker digest alone is not enough", () => {
    const valid = metadata();
    for (const sri of [undefined, null, 123, "", "sha1-ZmFrZQ==", "sha256-" + "A".repeat(44), "sha512-" + "A".repeat(86), "sha512-" + "A".repeat(85) + "==", "sha512-" + "_".repeat(86) + "=="]) assert.throws(() => validateUpdateMetadata({ ...valid, dist: { ...valid.dist, integrity: sri } }, "stable"), hasCode("invalid-metadata"));
    const sri = `sha1-ZmFrZQ== ${goodPackage.expected.integrity}`;
    assert.equal(validateUpdateMetadata({ ...valid, dist: { ...valid.dist, integrity: sri } }, "stable").integrity, sri);
  });
});
