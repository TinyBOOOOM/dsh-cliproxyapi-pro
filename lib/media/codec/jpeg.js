// Baseline JPEG encoding with standard quantization and Huffman tables.
const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const STD_LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
// Annex K standard Huffman tables: code counts per length 1..16, then symbols.
const HUFF = {
  dcL: [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  dcC: [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  acL: [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ]],
  acC: [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
    0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
    0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
    0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ]],
};

function huffmanCodes([counts, symbols]) {
  const codes = new Array(256);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < counts[length - 1]; i += 1) codes[symbols[k++]] = [code++, length];
    code <<= 1;
  }
  return codes;
}

const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C0 = 1 / Math.SQRT2;

/** Baseline JPEG (4:4:4, standard tables) from RGB8. */
export function encodeJpeg({ width, height, rgb }, quality = 85) {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const factor = q < 50 ? 5000 / q : 200 - q * 2;
  const table = (base) => base.map((v) => Math.min(255, Math.max(1, Math.floor((v * factor + 50) / 100))));
  const qL = table(STD_LUMA_Q);
  const qC = table(STD_CHROMA_Q);
  const codes = { dcL: huffmanCodes(HUFF.dcL), dcC: huffmanCodes(HUFF.dcC), acL: huffmanCodes(HUFF.acL), acC: huffmanCodes(HUFF.acC) };
  const out = [];
  const bytes = (...values) => out.push(...values);
  const marker = (code, payload) => {
    bytes(0xff, code, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff);
    for (const v of payload) out.push(v);
  };
  bytes(0xff, 0xd8);
  marker(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  marker(0xdb, [0, ...ZIGZAG.map((i) => qL[i]), 1, ...ZIGZAG.map((i) => qC[i])]);
  marker(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const dht = [];
  for (const [id, key] of [[0x00, "dcL"], [0x10, "acL"], [0x01, "dcC"], [0x11, "acC"]]) dht.push(id, ...HUFF[key][0], ...HUFF[key][1]);
  marker(0xc4, dht);
  marker(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  let buffer = 0;
  let bits = 0;
  const writeBits = (value, length) => {
    buffer = (buffer << length) | (value & ((1 << length) - 1));
    bits += length;
    while (bits >= 8) {
      const byte = (buffer >> (bits - 8)) & 0xff;
      out.push(byte);
      if (byte === 0xff) out.push(0);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  };
  const category = (v) => {
    let a = Math.abs(v);
    let n = 0;
    while (a > 0) {
      n += 1;
      a >>= 1;
    }
    return n;
  };
  const encodeValue = (v, n) => writeBits(v < 0 ? v + (1 << n) - 1 : v, n);
  const block = new Float64Array(64);
  const tmp = new Float64Array(64);
  const coef = new Int32Array(64);
  const prev = [0, 0, 0];
  const encodeBlock = (component, quant, dcCodes, acCodes) => {
    // Separable 2-D DCT-II.
    for (let y = 0; y < 8; y += 1) {
      for (let u = 0; u < 8; u += 1) {
        let sum = 0;
        for (let x = 0; x < 8; x += 1) sum += block[y * 8 + x] * COS[x][u];
        tmp[y * 8 + u] = sum * (u === 0 ? C0 : 1) / 2;
      }
    }
    for (let u = 0; u < 8; u += 1) {
      for (let v = 0; v < 8; v += 1) {
        let sum = 0;
        for (let y = 0; y < 8; y += 1) sum += tmp[y * 8 + u] * COS[y][v];
        coef[v * 8 + u] = Math.round((sum * (v === 0 ? C0 : 1)) / 2 / quant[v * 8 + u]);
      }
    }
    const dc = coef[0] - prev[component];
    prev[component] = coef[0];
    const dn = category(dc);
    writeBits(dcCodes[dn][0], dcCodes[dn][1]);
    if (dn > 0) encodeValue(dc, dn);
    let run = 0;
    for (let k = 1; k < 64; k += 1) {
      const value = coef[ZIGZAG[k]];
      if (value === 0) {
        run += 1;
        continue;
      }
      while (run > 15) {
        writeBits(acCodes[0xf0][0], acCodes[0xf0][1]);
        run -= 16;
      }
      const n = category(value);
      const symbol = (run << 4) | n;
      writeBits(acCodes[symbol][0], acCodes[symbol][1]);
      encodeValue(value, n);
      run = 0;
    }
    if (run > 0) writeBits(acCodes[0][0], acCodes[0][1]);
  };
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      for (let component = 0; component < 3; component += 1) {
        for (let y = 0; y < 8; y += 1) {
          const sy = Math.min(height - 1, by + y);
          for (let x = 0; x < 8; x += 1) {
            const o = (sy * width + Math.min(width - 1, bx + x)) * 3;
            const r = rgb[o];
            const g = rgb[o + 1];
            const b = rgb[o + 2];
            const value =
              component === 0 ? 0.299 * r + 0.587 * g + 0.114 * b
              : component === 1 ? -0.168736 * r - 0.331264 * g + 0.5 * b + 128
              : 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
            block[y * 8 + x] = value - 128;
          }
        }
        if (component === 0) encodeBlock(0, qL, codes.dcL, codes.acL);
        else encodeBlock(component, qC, codes.dcC, codes.acC);
      }
    }
  }
  if (bits > 0) writeBits(0x7f, 8 - bits);
  bytes(0xff, 0xd9);
  return new Uint8Array(out);
}
