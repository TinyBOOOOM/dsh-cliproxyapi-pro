[中文](../zh/accounts-and-models.md) | English · [Back to README](../../README.en.md)

# Features in detail

## Discovery and synchronization

- The base URL can be local or remote; suffixes such as `/v1`, `/v1/chat/completions` and `/v1/messages` are stripped.
- With an empty URL, the plugin tries, in order: the existing route's URL, the `CLIPROXYAPI_BASE_URL` environment variable, and local `127.0.0.1:8317`.
- The enriched catalog comes from `/v1/models?client_version=pi` (standard OpenAI `data[]` catalogs work too); `owned_by` from `/v1/models` identifies each model's family and its `type` marks image models.
- Image and video models are never written to chat routes; see [Image and video models](media.md#image-and-video-models-the-generation-tab).
- All accounts refresh on a shared interval (300 s by default); an unchanged catalog writes no settings.

## Model selection

- Search, family chips, All / Checked / Unchecked tabs and bulk selection. **Only checked models appear in the model picker**; an empty selection shows all of them.
- Include / exclude keyword rules filter further.
- An account that has never saved a selection gets the recommended models checked on its first successful probe (see the next section; at most 12), computed from that server's own catalog; **Reset to Recommended** restores that set at any time. Recommended models carry a **Recommended** tag whose ⓘ tip gives the reason.

## Recommendations and suggestions

- **By product line.** A vendor's product lines are judged separately: Claude Opus, Sonnet, Haiku and Fable; GPT sol / terra / luna / astra; Gemini and Gemini Flash; and so on. Each line is represented by its newest model: by release date when one is known, else by the version in the name (`claude-5-fable` and `claude-fable-5` are the same line, and a date suffix is not a version). Among equal versions, a model without suffixes such as `-thinking`, `-fast` or `-1m` and without a prefix such as `devin/` wins.
- **Lines left behind are dropped.** A line whose newest model is more than 180 days older than its family's newest (without dates: whose major version is below the family's newest) is not recommended, for example Gemini 3.1 Pro next to Gemini 4. Models upstream marks as deprecated or past their end date are not recommended either.
- **Flagships only.** With online capability scores (the Artificial Analysis intelligence index as published by OpenRouter), lines are ranked by score and only those reaching 80% of this server's strongest line are kept, at most 12; light lines (such as Haiku, Flash, luna) and unscored niche models fall away. When a line's newest model is not scored yet, the line keeps its best known score. Without scores (online info off, or no download and no cache), the non-light lines of well-known vendors (Claude, GPT, Gemini, Grok, DeepSeek, Qwen, GLM, Kimi, …) are recommended, vendors taking turns, at most 12. Opaque ids such as `model_private_12` are judged by their display name; ids that still name no line are not recommended.
- **At least one per channel.** Every CPA channel the account connects (prefixed models by prefix, such as `devin/`; others by the `owned_by` of `/v1/models`, such as `xai`, `openai`, `antigravity`) that has no model picked yet adds **its own** best model: the highest-scoring line, or without scores the channel's main line (the one with the most models). Other vendors' models relayed by a prefixed channel do not count as its own: the Devin channel's own models are Cognition's SWE series, so `devin/swe-2` is recommended; a Grok channel adds the best Grok. Their ⓘ tip names the channel, and they take places within the 12.
- **Online model info (on by default, shared by all accounts).** When on, the plugin downloads public model data daily from [models.dev](https://models.dev/api.json) and [OpenRouter](https://openrouter.ai/api/v1/models): product lines, release dates, deprecation, end dates, context and output limits, prices and capability scores. **Download only: no account, key, server address or model list is sent**; matching happens locally. The data is cached in `model-info.json`; after a failure the old cache stays in use and the download is retried an hour later; without data, recommendations use the CPA catalog's own dates and versions. Turn it off with the **Online Model Info** switch at the top of the **Models** tab. The first-run selection waits up to about 4 s for online data.
- **Missing limits are filled.** When the CPA catalog gives no context window or max output, the value of an exact online match of the same model is used (max output capped at 128K and at the context window) instead of the fixed 262144 / 64000; values from CPA always win. The **Discovered** value under Edit Parameters notes when it came from online info.
- **Suggestions.** The top of the **Models** tab points out: a checked line has a newer model (**Add** or **Replace**), a checked model is not in the server's catalog (**Use** a same-named prefixed model when there is one), or a checked model is deprecated upstream. Suggestions never change the selection by themselves; after a button, **Save & Apply** still makes it take effect.

## Per-model overrides

**Edit Parameters** on a checked model sets its context window, max output, image input, thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) and request protocol, each resettable to the discovered value.

## Multiple accounts

- Each account writes its own set of routes: the first account uses `cli-proxy` / `cli-proxy-responses` / `cli-proxy-messages`, later ones `cli-proxy-2*`, `cli-proxy-3*`, …; credential refs are `CLI_PROXY_API_KEY`, `CLI_PROXY_API_KEY_2`, …. The model picker groups models by account name.
- **Disabling** an account keeps its settings but removes its routes, so its models leave the picker; other accounts are unaffected.
- **New** accounts: **+ Add Account** first tests the entered URL and key and creates an enabled account only when that works; **Add Anyway (Disabled)** is also offered.
- Each account page has **Connection / Models / Generation / Quota** tabs under one shared account bar. The **Enabled** switch next to the account title applies at once; the **⋯** menu holds **Probe & Refresh** and **Delete Account**.
- Connection and model changes are tracked together; a bar at the bottom shows **Unsaved changes · Discard / Save & Apply**, and switching accounts asks before dropping unsaved changes. **Test Connection** probes the address and key being edited without saving anything.
- Secondary explanations live in ⓘ tips next to the labels (open on hover, keyboard focus or click).
- An account with a base URL **only connects to that URL** and reports an error when it is unreachable; it never silently falls back to local `:8317`, so two accounts cannot end up on the same server.
- Provider route IDs of different accounts must not overlap; conflicting changes are rejected.
- **Deleting** an account removes its routes but keeps its key in the credentials service.

## Protocol routing

CPA serves every model on OpenAI Chat, OpenAI Responses and Anthropic Messages, translating when the entry protocol differs from the upstream one. The default auto mode sends each model over its upstream's own protocol:

| Model family (from `owned_by` and the model id) | Protocol | Route (for `cli-proxy`) |
|---|---|---|
| Claude (including `devin/claude-*`, Antigravity Claude) | Anthropic Messages `/v1/messages` | `cli-proxy-messages` |
| OpenAI / Codex / GPT, xAI Grok | OpenAI Responses `/v1/responses` | `cli-proxy-responses` |
| Gemini, DeepSeek, Kimi, GLM, SWE, gpt-oss, … | OpenAI Chat `/v1/chat/completions` | `cli-proxy` |

- DSH custom routes cannot speak Gemini's native `generateContent`, so Gemini uses OpenAI Chat.
- A DSH route has a single protocol, so models are split across the three routes; a route left without models is removed. When the default model moves to another route, `agent-default-model` follows it.
- Claude 4.6+ / 5.x / Fable use adaptive thinking (`effort`); older Claude models use a token budget.
- Switch to one protocol for every model, or set a protocol per model under **Edit Parameters**.
- Other fields you add to a managed route by hand (such as `retryPolicy`) are kept.
