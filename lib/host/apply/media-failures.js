// Plain-English media failure summaries for commands and persisted run records.

import { join } from "node:path";
import { IMAGE_ASPECTS, MAX_REFERENCE_IMAGES, MediaError, MAX_VIDEO_BYTES, VIDEO_ASPECTS, EDIT_SOURCE_MAX_SECONDS, EXTEND_SOURCE_SECONDS, VIDEO_UPLOAD_MAX_BYTES } from "../../media.js";
import { name } from "../config.js";

export function createMediaFailures(shared) {
  const { ctx, source } = shared;
  /** Plain-English host text for a media failure (slash command output and run records). */
  const mediaFailureText = (error, kind = "image") => {
    if (!(error instanceof MediaError)) return error instanceof Error ? error.message : String(error);
    const detail = error.detail;
    const video = kind === "video";
    const noun = video ? "video" : "image";
    switch (error.code) {
      case "missing-prompt": return video ? "add a prompt, for example: /cpa-video waves rolling onto a beach at sunset" : "add a prompt, for example: /cpa-image a red fox in the snow";
      case "invalid-option": return video
        ? `unknown option ${detail}; use -m <model>, --aspect <ratio>, -s <1-15>, -r <480p|720p>`
        : `unknown option ${detail}; use -m <model>, --aspect <ratio>, -n <1-4>`;
      case "invalid-aspect": return `--aspect must be one of ${(video ? VIDEO_ASPECTS : IMAGE_ASPECTS).join(", ")}`;
      case "invalid-count": return "-n must be 1 to 4";
      case "invalid-video-seconds": return "-s / --seconds must be a whole number from 1 to 15";
      case "invalid-video-resolution": return "-r / --resolution must be 480p or 720p";
      case "no-media-model": return `no ${noun} model is available (${detail || "no account"}); check Settings → CLIProxyAPI → Generation, or run /cpa-refresh if a catalog has not been read yet`;
      case "choose-model": return `several ${noun} models are available (${detail}); pick one with the button next to the composer or pass -m <model>`;
      case "model-not-found": return `no enabled ${noun} model matches; available: ${detail || "none"}`;
      case "model-ambiguous": return `several ${noun} models match (${detail}); be more specific`;
      case "workspace-not-local": return `the session's working directory is not a local folder, so the ${noun} cannot be saved`;
      case "unsupported-attachment": return detail === "edit"
        ? "attach one MP4 video as the source (images cannot be used here)"
        : video ? "only image attachments can be used for /cpa-video (first frame, references, first / last frames)" : "only image attachments can be used as references";
      case "too-many-references": return video ? `attach at most ${detail ?? "14"} images for this mode (more than 2 images are references)` : `attach at most ${MAX_REFERENCE_IMAGES} reference images`;
      case "frames-need-images": return "--ref / --last / --first-last need attached images: one for a reference or a last frame, two for first and last frame";
      case "needs-video-15": return "pinned first / last frames need grok-imagine-video-1.5; pick it with -m or the model button";
      case "invalid-extend-seconds": return "an extension adds 2 to 10 seconds (-s 2-10)";
      case "no-video-source": return "no source video: attach an MP4, or pass --video <path>, --url <public URL> or --from <command id>";
      case "video-source-expired": return "that video's file is gone and its short-lived xAI link has expired; attach the MP4 or pass --video <path>";
      case "one-video-source": return "use one source video: an attachment, --video, --url or --from";
      case "invalid-video-url": return "--url must be a public http(s) address without a user name or password";
      case "video-not-found": return `no video file at ${detail}`;
      case "video-not-mp4": return "the source video must be an MP4 file (H.264, H.265 or AV1)";
      case "source-too-large": return `the source video is ${detail} MiB; videos up to ${Math.round(VIDEO_UPLOAD_MAX_BYTES / 1024 / 1024)} MiB can be sent inline — shorten or compress it, or pass a public link with --url`;
      case "request-too-large": return video
        ? `the request is too large for this server (${detail ? `${Math.round(Number(detail) / 1024)} KB` : "body limit"}); attach smaller or fewer images`
        : "the request is too large for this server";
      case "route-unsupported": return `this server's upstream does not offer ${detail === "extensions" ? "video extension" : detail === "edits" ? "video editing" : detail} (HTTP 405); CPA may pause the credential for this model for about a minute`;
      case "edit-source-too-long": return `xAI edits videos of at most ${EDIT_SOURCE_MAX_SECONDS} seconds (this one has ${detail} s); extend it instead`;
      case "extend-source-length": return `xAI extends videos of ${EXTEND_SOURCE_SECONDS.min} to ${EXTEND_SOURCE_SECONDS.max} seconds (this one has ${detail} s)`;
      case "reference-too-large": return `an attached image could not be made smaller than ${detail ?? "1000"} KB; attach a smaller image`;
      case "upstream-error": return `CPA rejected the request (${detail})`;
      case "timeout": return video ? "CPA did not answer in time" : "CPA did not answer within 3 minutes";
      case "network": return "could not reach CPA";
      case "no-image": return "CPA returned no image";
      case "invalid-image":
      case "invalid-response": return video ? "CPA returned an answer this plugin does not understand" : "CPA returned data that is not a PNG, JPEG, WebP or GIF image";
      case "image-too-large": return "an image is larger than 32 MiB";
      case "video-too-large": return `the video is larger than ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MiB`;
      case "invalid-video": return "CPA returned data that is not an MP4, MOV or WebM video";
      case "video-failed": return `the video could not be generated${detail ? ` (${detail})` : ""}`;
      case "expired": return "CPA no longer knows this video: more than 3 hours have passed since it was submitted";
      case "download-failed": return `could not download the generated ${noun}`;
      case "write-failed": return `could not write the ${noun} file${detail ? ` (${detail})` : ""}`;
      case "no-endpoint": return "this account has no usable server address yet";
      case "invalid-account": return "the model's account no longer exists";
      case "interrupted": return "stopped because the plugin was reloaded or DSH closed";
      default: return error.code;
    }
  };

  return { mediaFailureText };
}
