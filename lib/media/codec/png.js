// Dependency-free non-interlaced PNG decoding.
import { inflateSync } from "node:zlib";
import { sniffImageType } from "../images.js";

/** Decode a non-interlaced PNG (any color type, 1–16-bit) to RGBA8, or undefined when unsupported. */
export function decodePng(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 33 || sniffImageType(b) !== "image/png") return undefined;
  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  let palette;
  let trns;
  const idat = [];
  while (offset + 8 <= b.length) {
    const length = b.readUInt32BE(offset);
    const name = b.toString("latin1", offset + 4, offset + 8);
    const data = b.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (name === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
  }
  if (width === 0 || height === 0 || interlace !== 0 || width * height > 40_000_000) return undefined;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (channels === undefined || ![1, 2, 4, 8, 16].includes(depth) || (type === 3 && palette === undefined)) return undefined;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((width * channels * depth) / 8);
  if (raw.length < height * (stride + 1)) return undefined;
  const lines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? lines[dst + x - bpp] : 0;
      const up = y > 0 ? lines[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? lines[dst - stride + x - bpp] : 0;
      let value = raw[src + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (a + up) >> 1;
      else if (filter === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      } else if (filter !== 0) return undefined;
      lines[dst + x] = value & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  const sample = (row, index) => {
    if (depth === 8) return lines[row + index];
    if (depth === 16) return lines[row + index * 2];
    const perByte = 8 / depth;
    const byte = lines[row + Math.floor(index / perByte)];
    const shift = 8 - depth * ((index % perByte) + 1);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const scale = depth < 8 && type !== 3 ? 255 / ((1 << depth) - 1) : 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (type === 3) {
        const i = sample(row, x);
        rgba[o] = palette[i * 3] ?? 0;
        rgba[o + 1] = palette[i * 3 + 1] ?? 0;
        rgba[o + 2] = palette[i * 3 + 2] ?? 0;
        rgba[o + 3] = trns !== undefined && i < trns.length ? trns[i] : 255;
      } else if (type === 0 || type === 4) {
        const g = Math.round(sample(row, x * channels) * scale);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = type === 4 ? sample(row, x * channels + 1) : 255;
      } else {
        rgba[o] = sample(row, x * channels);
        rgba[o + 1] = sample(row, x * channels + 1);
        rgba[o + 2] = sample(row, x * channels + 2);
        rgba[o + 3] = type === 6 ? sample(row, x * channels + 3) : 255;
      }
    }
  }
  return { width, height, rgba };
}
