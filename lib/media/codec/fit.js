// Reference-image flattening, area downscaling and JPEG size fitting.
import { REFERENCE_MAX_EDGE } from "../constants.js";
import { sniffImageType } from "../images.js";
import { decodePng } from "./png.js";
import { encodeJpeg } from "./jpeg.js";

// #region Reference images (size fitting without dependencies)
//
// Upstreams cap the request body (xAI answers "Failed to read request body:
// length limit exceeded" near 2 MiB), and references travel base64-encoded
// inside the JSON. A reference over the byte budget is shrunk here: PNG is
// decoded with node:zlib, flattened onto white, scaled to fit, and encoded as
// baseline JPEG. Other formats over the budget are left to the caller (DSH's
// attachment store can derive a smaller version).

/** Flatten onto white and scale down (area average) so the long edge is at most `maxEdge`; returns RGB8. */
export function fitRgb({ width, height, rgba }, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const rgb = new Uint8Array(w * h * 3);
  const fx = width / w;
  const fy = height / h;
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * fy)));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * fx)));
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const o = (yy * width + xx) * 4;
          const a = rgba[o + 3] / 255;
          r += rgba[o] * a + 255 * (1 - a);
          g += rgba[o + 1] * a + 255 * (1 - a);
          bl += rgba[o + 2] * a + 255 * (1 - a);
          n += 1;
        }
      }
      const d = (y * w + x) * 3;
      rgb[d] = Math.round(r / n);
      rgb[d + 1] = Math.round(g / n);
      rgb[d + 2] = Math.round(bl / n);
    }
  }
  return { width: w, height: h, rgb };
}

/**
 * A reference image within `maxBytes`: unchanged when it already fits; a PNG
 * over the budget is re-encoded as JPEG (flattened onto white, long edge at
 * most `maxEdge`, lower quality / size until it fits). Returns undefined for
 * other formats over the budget (the caller may ask DSH for a smaller version).
 * @param image - `{ mediaType, data }`.
 * @returns `{ mediaType, data, resized }` or undefined.
 */
export function fitReferenceImage(image, maxBytes, maxEdge = REFERENCE_MAX_EDGE) {
  const data = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data);
  if (data.byteLength <= maxBytes) return { mediaType: image.mediaType ?? sniffImageType(data) ?? "image/png", data, resized: false };
  const decoded = sniffImageType(data) === "image/png" ? decodePng(data) : undefined;
  if (decoded === undefined) return undefined;
  for (const edge of [maxEdge, Math.round(maxEdge * 0.75), Math.round(maxEdge * 0.5), Math.round(maxEdge * 0.375)]) {
    const fitted = fitRgb(decoded, edge);
    for (const quality of [88, 78, 65]) {
      const jpeg = encodeJpeg(fitted, quality);
      if (jpeg.byteLength <= maxBytes) return { mediaType: "image/jpeg", data: jpeg, resized: true };
    }
  }
  return undefined;
}

// #endregion
