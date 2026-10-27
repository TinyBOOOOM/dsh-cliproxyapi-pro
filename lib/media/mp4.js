// Local ISO media identification and MP4 duration inspection.
const asBuffer = (bytes) => (Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));

/** Whether the bytes start like an ISO base media file (MP4 / MOV: an `ftyp` box first). */
export function isMp4(bytes) {
  return bytes instanceof Uint8Array && bytes.byteLength >= 12 && asBuffer(bytes).toString("latin1", 4, 8) === "ftyp";
}

/**
 * A video's length from its `moov/mvhd` box, in seconds (two decimals), or
 * undefined when the file does not carry one this parser understands.
 */
export function mp4Duration(bytes) {
  if (!isMp4(bytes)) return undefined;
  const buf = asBuffer(bytes);
  const find = (start, end, type) => {
    let at = start;
    while (at + 8 <= end) {
      let size = buf.readUInt32BE(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return undefined;
        const large = buf.readBigUInt64BE(at + 8);
        if (large > BigInt(end - at)) return undefined;
        size = Number(large);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) return undefined;
      if (buf.toString("latin1", at + 4, at + 8) === type) return [at + header, at + size];
      at += size;
    }
    return undefined;
  };
  const moov = find(0, buf.length, "moov");
  const mvhd = moov === undefined ? undefined : find(moov[0], moov[1], "mvhd");
  if (mvhd === undefined) return undefined;
  const [c, end] = mvhd;
  const v1 = buf[c] === 1;
  if (c + (v1 ? 32 : 20) > end) return undefined;
  const timescale = buf.readUInt32BE(c + (v1 ? 20 : 12));
  const duration = v1 ? Number(buf.readBigUInt64BE(c + 24)) : buf.readUInt32BE(c + 16);
  if (timescale === 0 || !Number.isFinite(duration) || duration <= 0) return undefined;
  return Math.round((duration / timescale) * 100) / 100;
}
