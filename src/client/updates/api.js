// @client-source Update errors and isolated update requests.
    const SERVICE_UNAVAILABLE_STATUS = new Set([404, 405, 501]);
    const UPDATE_ERROR_KEYS = {
      "network-error": "updateNetworkError",
      "invalid-metadata": "updateMetadataError",
      "invalid-response": "updateMetadataError",
      "service-unavailable": "updateServiceUnavailableError",
      "forbidden-origin": "updateOriginError",
      "channel-unavailable": "updateChannelUnavailable",
      "unavailable-channel": "updateChannelUnavailable",
      "integrity-error": "updateIntegrityError",
      "invalid-package": "updateInvalidPackage",
      "storage-error": "updateStorageError",
      busy: "updateBusyError",
      "stale-version": "updateStaleVersion",
      disposed: "updateDisposedError",
      "linked-install": "updateLinkedHint",
      "unsupported-host": "updateUnsupportedHint",
      "not-installed": "updateNotInstalledHint",
    };

    function updateErrorText(t, failure, fallback) {
      const code = failure?.updateCode;
      if (typeof code === "string" && Object.prototype.hasOwnProperty.call(UPDATE_ERROR_KEYS, code)) {
        return t(UPDATE_ERROR_KEYS[code]);
      }
      if (failure?.httpStatus) {
        return t("updateHttpError").replace("{status}", String(failure.httpStatus));
      }
      // Server messages may be English or contain internal paths. Do not expose them.
      return t(fallback);
    }

    async function requestPluginUpdate(url, payload, signal) {
      let res;
      try {
        res = await fetch(url, {
          signal,
          cache: "no-store",
          ...(payload === undefined
            ? {}
            : {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              }),
        });
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        const failure = new Error("Update network request failed");
        failure.updateCode = "network-error";
        throw failure;
      }
      let body;
      try {
        body = await res.json();
      } catch {
        const failure = new Error("Invalid update response");
        // A missing route (host plugin not reloaded) answers 404/405 with no
        // update payload; that is "service unavailable", not bad metadata.
        failure.updateCode = !res.ok && SERVICE_UNAVAILABLE_STATUS.has(res.status) ? "service-unavailable" : "invalid-response";
        if (!res.ok) failure.httpStatus = res.status;
        throw failure;
      }
      const validState = body?.update && typeof body.update === "object" && !Array.isArray(body.update);
      if (!res.ok || body?.ok === false || !validState ||
          payload !== undefined && (body.update.error || body.update.errorCode)) {
        const failure = new Error("Update request failed");
        failure.updateCode = body?.errorCode || body?.update?.errorCode ||
          (!validState ? (!res.ok && SERVICE_UNAVAILABLE_STATUS.has(res.status) ? "service-unavailable" : "invalid-response") : null);
        failure.httpStatus = !res.ok ? res.status : null;
        failure.updateState = validState ? body.update : null;
        throw failure;
      }
      return body.update;
    }
