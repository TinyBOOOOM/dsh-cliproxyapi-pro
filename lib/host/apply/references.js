// Bounded attachment references and optional request-image resizing.

import { MediaError, fitReferenceImage, REFERENCE_MAX_EDGE } from "../../media/index.js";

export function createReferences(shared) {
  // Request bodies carry references base64-encoded and upstreams cap the body
  // (xAI: "Failed to read request body: length limit exceeded"). Video
  // requests use the measured `videoImageBudget()`; image edits keep this
  // unmeasured share.
  const FIRST_FRAME_MAX_BYTES = 1_000_000;
  const REFERENCES_MAX_BYTES = 1_400_000;

  /**
   * One attached image within `maxBytes`: as stored when it fits; a PNG is
   * re-encoded here (JPEG on white, long edge ≤ 1280); another format asks
   * DSH's attachment store for a smaller request version.
   * @throws MediaError `reference-too-large`.
   */
  const readReference = async (store, block, maxBytes, signal) => {
    const stored = await store.readImage(block.attachment, signal);
    const image = { mediaType: stored.ref?.mediaType ?? block.attachment?.mediaType, data: stored.data };
    const fitted = fitReferenceImage(image, maxBytes);
    if (fitted !== undefined) return { mediaType: fitted.mediaType, data: fitted.data };
    const width = Number(stored.ref?.width ?? block.attachment?.width);
    const height = Number(stored.ref?.height ?? block.attachment?.height);
    if (typeof store.readImageRequest === "function" && width > 0 && height > 0) {
      const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(width, height));
      try {
        const smaller = await store.readImageRequest(
          block.attachment,
          { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), maxBytes },
          signal
        );
        if (smaller?.data?.byteLength <= maxBytes) return { mediaType: smaller.mediaType, data: smaller.data };
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    throw new MediaError("reference-too-large", String(Math.round(maxBytes / 1000)));
  };

  return { FIRST_FRAME_MAX_BYTES, REFERENCES_MAX_BYTES, readReference };
}
