// @client-source Command argument tags, run errors, clipboard and file icon helpers.
    // #region /cpa-image and /cpa-video chat rows (conversation.chat.commandview, keys "cpa-image" / "cpa-video")

    /** Leading `/cpa-image` / `/cpa-video` options of a recorded command line, then the prompt (mirrors the host parsers, never throws). */
    function splitImageArgs(raw) {
      let rest = String(raw ?? "").trim();
      const out = { prompt: "" };
      for (;;) {
        if (rest.startsWith("-- ") || rest === "--") {
          rest = rest.slice(2).trim();
          break;
        }
        const match = rest.match(/^(-m|--model|--aspect|-n|--count|-s|--seconds|-r|--resolution)(?:=|\s+)(\S+)(?:\s+|$)/);
        if (match === null) break;
        if (match[1] === "-m" || match[1] === "--model") out.model = match[2];
        else if (match[1] === "--aspect") out.aspect = match[2];
        else if (match[1] === "-s" || match[1] === "--seconds") out.seconds = Number(match[2]) || undefined;
        else if (match[1] === "-r" || match[1] === "--resolution") out.resolution = match[2].toLowerCase();
        else out.count = Number(match[2]) || undefined;
        rest = rest.slice(match[0].length);
      }
      out.prompt = rest;
      return out;
    }

    const RUN_ERROR_KEYS = {
      interrupted: "mediaRunErrInterrupted",
      timeout: "mediaRunErrTimeout",
      network: "mediaRunErrNetwork",
      "no-image": "mediaRunErrNoImage",
      "invalid-image": "mediaRunErrInvalid",
      "invalid-response": "mediaRunErrInvalid",
      "write-failed": "mediaRunErrWrite",
      expired: "mediaRunErrExpired",
      "invalid-video": "mediaRunErrInvalidVideo",
      "video-too-large": "mediaRunErrVideoTooLarge",
    };

    /** "9 秒" / "1 分 23 秒" (zh), "9 s" / "1 min 23 s" (en). */
    const elapsedText = (t, seconds) => {
      const s = Math.max(0, Math.round(seconds));
      return s < 60 ? fmt(t, "mediaDurationS", { s }) : fmt(t, "mediaDurationMS", { m: Math.floor(s / 60), s: s % 60 });
    };

    const secondsBetween = (from, to) => {
      const start = Date.parse(from ?? "");
      return Number.isFinite(start) ? Math.max(0, Math.round((to - start) / 1000)) : 0;
    };

    const REVEAL_KEYS = { explorer: "mediaActRevealExplorer", finder: "mediaActRevealFinder", filemanager: "mediaActRevealFiles" };

    /** An application icon the Host reported: images by data URL or same-origin path only. */
    function safeIconSource(value) {
      if (typeof value !== "string" || value === "" || value.length > 200000) return null;
      if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);/i.test(value)) return value;
      return /^(\/|\.{0,2}\/|[a-z0-9-]+\/)/i.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : null;
    }

    /** Copy one generated image as PNG (the clipboard takes PNG only, so other types are re-encoded). */
    async function copyImageToClipboard(url) {
      if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("clipboard unavailable");
      const png = (async () => {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.type === "image/png") return blob;
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
      })();
      // A pending blob keeps the click's user activation for the write.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    }

    async function copyTextToClipboard(text) {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
    }

