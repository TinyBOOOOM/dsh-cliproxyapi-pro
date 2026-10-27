// reference-images media behavior tests.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePng, encodeJpeg, fitReferenceImage } from "../../lib/media/index.js";

describe("reference image fitting", () => {
  const deflateSync = (b) => import("node:zlib").then((z) => z.deflateSync(b));
  const chunk = (name, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(name, "latin1"), data, Buffer.alloc(4)]);
  };
  const makePng = async (width, height, colorType, channels, pixel, filter = 0) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    const rows = [];
    for (let y = 0; y < height; y += 1) {
      const row = Buffer.alloc(1 + width * channels);
      row[0] = filter;
      for (let x = 0; x < width; x += 1) pixel(x, y).forEach((v, c) => (row[1 + x * channels + c] = v));
      if (filter === 1) for (let i = row.length - 1; i > channels; i -= 1) row[i] = (row[i] - row[i - channels]) & 0xff;
      rows.push(row);
    }
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", await deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  };

  it("decodes RGBA / RGB / gray PNGs, including filtered rows", async () => {
    const rgba = decodePng(await makePng(3, 2, 6, 4, (x, y) => [x * 10, y * 20, 30, x === 0 ? 0 : 255], 1));
    assert.equal(rgba.width, 3);
    assert.deepEqual([...rgba.rgba.subarray(0, 8)], [0, 0, 30, 0, 10, 0, 30, 255]);
    const gray = decodePng(await makePng(2, 1, 0, 1, (x) => [x * 200]));
    assert.deepEqual([...gray.rgba], [0, 0, 0, 255, 200, 200, 200, 255]);
    assert.equal(decodePng(Buffer.from("not a png")), undefined);
  });

  it("keeps small images, re-encodes a large PNG as JPEG on white, and gives up on other large formats", async () => {
    const small = { mediaType: "image/png", data: await makePng(4, 4, 2, 3, () => [1, 2, 3]) };
    assert.equal(fitReferenceImage(small, 10_000).resized, false);
    // Noise does not compress: about 1.4 MB as PNG.
    const { randomBytes } = await import("node:crypto");
    const pool = randomBytes(700 * 500 * 3);
    let i = 0;
    const big = await makePng(700, 500, 6, 4, () => [pool[i++], pool[i++], pool[i++], 255]);
    assert.ok(big.length > 1_000_000);
    const fitted = fitReferenceImage({ mediaType: "image/png", data: big }, 1_000_000);
    assert.equal(fitted.mediaType, "image/jpeg");
    assert.equal(fitted.resized, true);
    assert.ok(fitted.data.byteLength <= 1_000_000);
    assert.deepEqual([...fitted.data.subarray(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...fitted.data.subarray(-2)], [0xff, 0xd9]);
    assert.equal(fitReferenceImage({ mediaType: "image/jpeg", data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50_000)]) }, 10_000), undefined);
    // A fully transparent pixel becomes white.
    const white = encodeJpeg({ width: 8, height: 8, rgb: new Uint8Array(8 * 8 * 3).fill(255) }, 90);
    assert.ok(white.byteLength < 1000);
  });
});
