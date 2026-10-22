# 设计：通过 CPA 生图 / 生视频

> 状态：**决策已确认，待实现**（2026-10-22）。仅为仓库内设计文档，不随 npm 包发布。
> 目标版本：1.8.0。实现前不修改任何代码、`state.json` 或 AGENTS.md。

## 0. 已拍板的决策

| # | 决策 |
|---|---|
| D1 | 给 agent 提供 `generate_media` 工具，**有开关，默认关闭** |
| D2 | 仓库约定（AGENTS.md「No agent tool」）**要改**，改法见 §13 |
| D3 | agent 调用视频生成**默认需要确认**，保留免确认选项供自动化使用 |
| D4 | 免确认按**全局默认 + 会话单独修改**两级配置 |
| D5 | 安全上限**按视频秒数**计，可设「无限制」或「限制 N 秒」，**默认限制 60 秒** |
| D6 | 上限对 agent 提交的视频**都计数**，但**只在免确认时拦截**；用户手动执行的 `/cpa-video` 不计数 |
| D7 | 生成模型在**输入框旁的切换按钮**里选，**按会话记住**，新会话沿用上一次的选择 |
| D8 | 生图默认不确认，但保留同样的确认选项 |
| D9 | v1 不做延长视频、改视频、费用估算、音频 / TTS |
| D10 | `sora-2*` 在切换按钮里显示，并标注「→ grok-imagine-video」 |
| D11 | **视频分辨率可选**：`480p` / `720p`，全局默认 `720p`；工具和 `/cpa-video` 可以单次指定 |
| D12 | 当前聊天模型能看图时，把生成图片的缩小版回传给它 |
| D13 | 工具被中断或超时后，插件在后台继续轮询并下载 |
| D14 | 子 agent 与根会话共用模型选择、确认方式和秒数上限 |
| D15 | 默认值：视频时长 6 秒；保存到 `<工作目录>/generated/`；切换按钮默认列出全部生成模型；工具最多等待 10 分钟；单次最多生成 4 张图、最多 4 张参考图；视频下载上限 200 MiB；只有 CPA 当场拒绝时才退回秒数；修改上限或重新开启免确认时已用秒数清零；会话记录保留最近 500 个，已结束的任务保留 7 天 |
| D16 | 四个阶段全部完成后一起发布 1.8.0 |
| D17 | 先在 P1 做一个「只读诊断」，用来核对 §15 的第 1–4 项；P2、P3 的真实生成测试每次都先征得用户同意（生图 1 张、视频 1 段 4 秒） |

## 1. 依据

### 1.1 DSH 现状（解析 `app.asar` 内的源码）

- 对话循环的助手输出只有文本和工具调用，**没有生成媒体的服务或包**。pi-ai 1.1.0 的 `generateImages`（只内置了 OpenRouter）DSH 没有接入。
- 能用上的扩展点：
  - `ctx.tools.register`：工具执行时能从 `exec.agent` 拿到当前会话；`read_image` 用 `attachments.saveImage` 存图后返回图片，但要求当前路由的模型支持图片输入。
  - `ctx.commands`：可以声明 `input.attachments` 来接收输入框里的图片；返回结果只能是文本。
  - `ctx.approval.request`：**每次只确认一次**，没有「本会话不再询问」；会话策略为 `never` 时直接拒绝；没有可用的应答方时返回 `unavailable`（同样不放行）；必须在一个进行中的 turn 内调用。
  - `ctx.documentPreviews.register`：右侧预览默认把 mp4 / webm 列为「不可预览」，注册一个渲染器可以覆盖。
  - `present` 工具和回复里的 Markdown 图片：可以展示工作区里的文件。

### 1.2 CPA 接口（`router-for-me/CLIProxyAPI` `dev@9e79552`，2026-10-22）

`internal/api/server_routes.go`：

| 方法 | 路径 | 处理函数 | 说明 |
|---|---|---|---|
| POST | `/v1/images/generations` | `ImagesGenerations` | OpenAI 兼容，可选 SSE |
| POST | `/v1/images/edits` | `ImagesEdits` | 改图 |
| POST | `/v1/videos`、`/v1/videos/generations` | `XAIVideosGenerations` | **xAI 原生**格式 |
| POST | `/v1/videos/edits`、`/v1/videos/extensions` | xAI 原生 | 改视频 / 延长视频 |
| GET | `/v1/videos/:request_id` | `XAIVideosRetrieve` | 查询状态，`status: "done"` 时带 `video.url` |
| POST | `/openai/v1/videos` | `VideosCreate` | OpenAI 格式，内部仍转成 xAI 请求 |
| GET | `/openai/v1/videos/:video_id` | `VideosRetrieve` | |
| GET | `/openai/v1/videos/:video_id/content` | `VideosContent` | 经 CPA 下载视频 |

要点：

- **取消：CPA 和 xAI 上游都没有取消接口。** CPA 路由表里视频相关的路由没有 `DELETE`，也没有 cancel；xAI [Videos API](https://docs.x.ai/developers/rest-api-reference/inference/videos) 只有 generations / edits / extensions 三个提交接口和 `GET /v1/videos/{request_id}`。**视频请求一旦提交就无法撤回。**
- **`sora-2` 只是别名。** `canonicalXAIVideosModel()` 会把 `sora-2*` 改写成 `grok-imagine-video`，所以所有视频最终都走 Grok。
- **任务与凭据的对应关系只存在 CPA 内存里。** 默认保留 3 小时（`defaultVideoAuthBindingTTL`，可通过 CPA 配置 `VideoResultAuthCacheTTL` 修改）。过期或 CPA 重启后，再查询这个任务可能被路由到别的凭据上，从而失败。
- **时长会被静默截断。** OpenAI 格式路径上 `normalizeXAIVideosSeconds()` 会把时长截到 1–15 秒（默认 4 秒）；尺寸只接受 `720x1280`、`1280x720`、`1024x1792`、`1792x1024`。
- **CPA 能识别的模型。** 生图：`grok-imagine-image`、`-quality`、`-2.0`、`gpt-image-1.5` / `-2` / `-2.5*`，以及注册类型为 `openai-image` 的模型；生视频：`grok-imagine-video`、`-1.5`、`-1.5-preview`（以及别名 `sora-2*`）。

## 2. 目标与非目标

**目标**

- 在输入框旁直接选择、切换生成模型（按会话记住）。
- agent 能通过 `generate_media` 生成图片和视频（开关控制，默认关闭）。
- 用户能用 `/cpa-image`、`/cpa-video` 手动生成。
- 视频费用可控：默认每次确认、免确认时按秒设上限、明确告知不可取消。
- 生成的视频能在侧栏直接预览。

**非目标（v1 不做）**

- 延长视频（`/v1/videos/extensions`）和改视频（`/v1/videos/edits`），放到后续版本。
- 估算费用或金额（CPA 和上游都不提供价格信息）。
- 把生成模型放进 DSH 的聊天模型选择器。
- 音频 / TTS（`/v1/audio/speech`、`/v1/tts`）。

## 3. 模型分类

在 `parseCatalog()` 产出的模型上增加 `kind: "chat" | "image" | "video"`，按以下顺序判断：

1. 用户手动指定的分类（`media-settings.json` 里的 `kindOverrides`，见 §11）。
2. 模型目录里的字段：`type === "openai-image"` 判为 image；`supportedOutputModalities` / `output_modalities` 里包含 `video` 判为 video、包含 `image` 且不含 `text` 判为 image。
3. CPA 自己用来分流的模型族（与 §1.2 中 CPA 的判断函数保持一致，带账号前缀时去掉前缀再比较）。
4. 其余都判为 chat。

规则：

- `kind !== "chat"` 的模型**不写入 `llm-pi-ai` 路由**，也不参与 `recommendModels()` 的推荐。
- 账号的 `selectedModels` 仍只管聊天模型。生成模型是否在切换按钮里出现，由 §11 的 `enabledModels` 控制，默认显示全部。
- 别名（`sora-2*`）在切换按钮里标注为「→ grok-imagine-video」。
- 以后 CPA 新增模型族时，参照 CPA 源码中 `isSupportedImagesModel` / `isSupportedVideosModel` 的判断更新第 3 步。

> 兼容性：如果有人已经把媒体模型勾进了 `selectedModels`，升级后这些模型会从聊天路由里移除（本来也调用不通）。`selectedModels` 的值保持不动，这样降级回旧版本时不会丢失。

## 4. 生成模型的选择

### 4.1 输入框切换按钮

- 注册在 `conversation.input.right`，与额度徽章（QuotaBadge）并列；首页的 `conversation.hero.options` 也注册一份。沿用额度徽章已有的去重（`useBadgePlacement`）和延迟解析会话目录（`useDirectory`）机制。
- 平时显示为 `🎨 <生图模型> · 🎬 <生视频模型>`，宽度不够时只显示图标；没有可用生成模型时不显示。
- 弹层（`position: fixed`，不挂到 `document.body`）内容：
  - 生图 / 生视频两列，按账号分组，点一下就切换；
  - 当前会话的「视频确认方式」：跟随全局 / 确认 / 免确认；
  - 当前会话的「视频秒数上限」：跟随全局 / 无限制 / 限制 N 秒，并显示「已用 X / N 秒」；
  - 一行提示：视频提交后无法取消。
- 所有文案放进 `zh` / `en` 词典；开关类控件用 `role="switch"`；样式只用 `--dsw-alias-*` 等主题变量。

### 4.2 优先级

| 调用来源 | 使用的模型 |
|---|---|
| `generate_media` 传了 `model` | 该模型 |
| `generate_media` 没传 `model` | 当前会话（子 agent 用其根会话）在切换按钮里选中的模型 |
| `/cpa-image -m …` | 该模型 |
| `/cpa-image` | 当前会话选中的模型 |
| 会话还没有选择 | 沿用全局「上一次选择」`lastSelection` |
| 以上都没有 | 只有一个可用模型就用它，否则报错并提示去选择 |

`model` / `-m` 的匹配规则：完整 id → `账号id/模型` → 唯一的子串匹配。匹配到多个时报错，并列出候选，不替用户猜。

## 5. `generate_media` 工具

### 5.1 开关

- 设置 → CPA → 新增「生成」标签页，开关「允许 agent 生成图片 / 视频」，**默认关闭**。
- **注册条件：开关打开，且至少有一个已启用账号下有已启用的生成模型。** 条件变化时通过 effect 注册或注销工具；工具列表会变，提示词缓存只在开关切换的那一刻失效。
- 切换按钮、斜杠命令和预览不受这个开关影响。

### 5.2 Schema（固定不变，不列模型）

```text
name: generate_media
description: Generate an image or video with the user's CLIProxyAPI media models and save it
  in the working directory. Omit model to use the one the user picked next to the composer;
  pass model only when the user names one. A submitted video cannot be cancelled and may
  need the user's approval.
parameters:
  kind      "image" | "video"            required
  prompt    string                       required
  model     string                       optional
  images    string[] (≤ 4 paths)         optional — image: edit source; video: first frame / references
  aspect    "1:1"|"16:9"|"9:16"|"4:3"|"3:4"|"3:2"|"2:3"   optional
  seconds   integer 1–15                 optional, video only; default = setting
  resolution "480p" | "720p"             optional, video only; default = setting
  count     integer 1–4                  optional, image only; default 1
  video_id  string                       optional — resume waiting for an earlier video; other fields ignored
```

目标体量：约 250 token。实现时用 `agent-experience` skill 再过一遍措辞。

### 5.3 执行流程

1. 解析模型（§4.2）和账号；校验 `kind` 与模型分类是否一致，`images` 路径能否通过会话文件系统读取。
2. **只针对视频**：按 §7 决定是否确认，按 §8 检查秒数上限。
3. 请求 CPA（只用该模型所属账号的 `baseURL` 和 key，不跨账号重试）。
4. 生图：同步返回。生视频：轮询任务状态，见 §9。
5. 结果写入 §10 指定的目录，并发出 `fs/observed` 事件。
6. 返回给模型的内容：文件路径、模型、实际参数（例如 `seconds: 6`）。生图时，如果当前路由能看图（与 `read_image` 判断方式相同），附一张经 `attachments.saveImage` 缩小的图片。
7. `presentCall` 卡片：标题为「生成图片 / 视频 · <模型>」，生视频时显示进度。

### 5.4 错误文案（给模型看，避免它反复重试）

| 情形 | 文案要点 |
|---|---|
| 用户拒绝 | `the user declined this video; do not retry unless the user asks` |
| 无人应答 / 会话策略为 `never` | `video needs approval but no approver is available; ask the user to allow auto mode for this session` |
| 超出上限 | `this session's video budget (N s) is exhausted (used X s); ask the user to raise it` |
| CPA 拒绝（4xx） | 原样带上 CPA 的 `error.message`，截断到 300 字符，并去掉其中的 URL |

## 6. 斜杠命令

| 命令 | 说明 |
|---|---|
| `/cpa-image [-m 模型] [--aspect 16:9] [--count N] 提示词` | 可附带图片（改图） |
| `/cpa-video [-m 模型] [--aspect 16:9] [--seconds N] [--resolution 480p\|720p] 提示词` | 可附带一张首帧图；**不弹确认、不计入上限**（D6） |
| `/cpa-video-status [video_id]` | 列出或查询本会话的视频任务，已完成的会下载 |

结果以文本返回：文件路径、模型和参数。图片和视频本身通过预览展示。

## 7. 视频确认

实际生效的确认方式 = 会话设置（`ask` / `auto`）?? 全局设置（`ask` 默认 / `auto`）。子 agent 使用其**根会话**的设置。

- `ask`：调用 `ctx.approval.request({ agent, tool: "generate_media", callId, reason, displayReason, signal })`。
  - `displayReason` 包含：账号、模型、时长、比例 / 分辨率、提示词前 80 个字、参考图数量，以及「**提交后无法取消，中断只会停止等待**」。
  - 只有返回 `allowed` 才继续，其他结果都按 §5.4 报错。
- `auto`：不调用 `ctx.approval`，直接提交（仍受 §8 上限约束）。
- 生图有同样的配置项，默认 `auto`（D8）。
- **不会**把会话的 `never` 策略当作「放行」。

## 8. 视频秒数上限

- 只按秒数计，不区分分辨率：选 720p 和选 480p，同样的时长扣同样的秒数。
- 配置：全局 `videoBudget`，默认 `{ mode: "limited", seconds: 60 }`，可选 `unlimited`；`seconds` 允许 1–3600。会话可以覆盖：`inherit` / `unlimited` / `limited N`。
- 计数：agent 每提交一个视频，就在其**根会话**的 `usedSeconds` 上加上本次时长。插件总是显式传 1–15 秒的 `seconds`，CPA 不会再截断，所以计数和实际时长一致。
- 拦截：只在生效方式为 `auto` 时，且 `usedSeconds + seconds > limit` 时拒绝（D6）。确认模式下照常计数，并在确认弹窗里显示「本会话已用 X 秒」。
- 退回：只有 CPA 在提交时直接拒绝（HTTP 4xx/5xx，任务没有建立）才退回秒数。上游生成失败**不退回**，因为查不到 xAI 失败任务是否计费的依据，按保守做法处理。
- 清零：修改上限值，或者会话从「非免确认」切换到「免确认」时，`usedSeconds` 归零。
- 计数存在 Host 端（§11），刷新页面、重载插件都不会清零。

## 9. 视频任务生命周期

```text
submit ──► queued/processing ──► done ──► download ──► saved
   │              │                 └──► failed / expired
   │              └── tool aborted / 10 min timeout ──► continue in background
   └── CPA rejected (budget refunded)
```

- 提交：使用原生接口 `POST /v1/videos/generations`（字段 `duration` / `aspect_ratio` / `resolution` / `image` / `reference_images`，**实现前用真实 BCPA 核对**）。
- 轮询：`GET /v1/videos/{request_id}`，间隔先 5 秒，后退避到 15 秒；工具最多等 10 分钟，期间推送进度。
- **中断 ≠ 取消**：工具被中断或超时后，返回 `video_id` 和「仍在后台生成，会继续计费」；插件的后台任务继续轮询并下载，完成后在原会话里追加一条提示（具体机制见 §15 待验证项）。
- 持久化：未完成的任务写入 `media-jobs.json`；DSH 重启或插件重载后继续轮询；**提交超过 3 小时**仍未完成就标记为 `expired`（CPA 已不记得这个任务对应的凭据），不再请求。
- 下载：优先 `GET /openai/v1/videos/{id}/content`（经 CPA 下载，不直连上游主机）。`video.url` 只在 content 接口不可用时作为后备，并且只接受 `https`、限制大小（默认 200 MiB）、不跟随跨主机跳转。
- 所有定时器通过 `outsideHmrTransaction(ctx, …)` 创建，并通过 `ctx.effect` 释放。

## 10. 文件输出与预览

- 默认保存到 `<会话工作目录>/generated/`，可在「生成」页改为相对路径或绝对路径。
- 文件名：`YYYYMMDD-HHmmss-<模型>-<提示词前 24 个字符，转为安全文件名>[-n].<ext>`，同名时追加序号，从不覆盖已有文件。
- 写文件走会话文件系统（`ctx.fs`），沿用会话的沙箱规则；写入失败就直接报错，不另找位置写。
- 视频预览：`ctx.documentPreviews.register({ id, extensions: ["mp4","webm","mov"], binaryExtensions: [...] })`，主体使用 `loading: "renderer"`，自己读取字节后生成 Blob URL 交给 `<video controls>`，卸载时释放。是否受 Host `maxFileBytes` 限制在 §15 验证。
- 生图结果可以直接用 Markdown 图片或 `present` 展示，不需要额外渲染器。

## 11. 存储（不改 `state.json`，无需迁移）

都放在 `<profileDir>/.dsh-cliproxyapi/` 下，写入方式与 `state.json` 一致（先写临时文件再 rename）。每次读取都重新读文件，解析失败时视为空，**并在日志里提示**，不覆盖损坏的文件。

`media-settings.json`

```json
{
  "version": 1,
  "agentTool": false,
  "outputDir": "generated",
  "defaultVideoSeconds": 6,
  "defaultVideoResolution": "720p",
  "imageConfirm": "auto",
  "videoConfirm": "ask",
  "videoBudget": { "mode": "limited", "seconds": 60 },
  "lastSelection": { "image": "default/grok-imagine-image", "video": "default/grok-imagine-video-1.5" },
  "accounts": {
    "default": { "disabledModels": [], "kindOverrides": {} }
  }
}
```

每个账号记录**关闭**了哪些生成模型（`disabledModels`），而不是开启了哪些：这样 CPA 以后新增的生成模型默认开启，不会因为用户曾经关过某个模型而默认关闭（P1 实现时由 `enabledModels` 改为此写法）。

`media-sessions.json`（以根会话 id 为键，只保留最近 500 个会话）

```json
{
  "version": 1,
  "sessions": {
    "<sessionId>": {
      "image": "default/grok-imagine-image",
      "video": "default/grok-imagine-video-1.5",
      "videoConfirm": "inherit",
      "videoBudget": "inherit",
      "usedSeconds": 12,
      "updatedAt": "2026-10-22T13:30:00+08:00"
    }
  }
}
```

`media-jobs.json`

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "<request_id>", "accountId": "default", "model": "grok-imagine-video-1.5",
      "sessionId": "<sessionId>", "cwd": "D:/…", "seconds": 6, "submittedAt": "…",
      "state": "processing", "file": null
    }
  ]
}
```

已结束的任务保留 7 天。这三个文件里**都不存放 key、token 或上游 URL**。

## 12. HTTP 路由

都经过现有的 `admitRequest()` 校验：

| 路由 | 方法 | 用途 |
|---|---|---|
| `/api/dsh-cliproxyapi/media/status?sessionId=` | GET | 可用模型（按账号、分类）、全局设置、会话设置、已用秒数、任务列表 |
| `/api/dsh-cliproxyapi/media/save` | POST | 修改全局设置（「生成」页） |
| `/api/dsh-cliproxyapi/media/session` | POST | 修改会话的模型、确认方式、上限（切换按钮） |
| `/api/dsh-cliproxyapi/media/jobs/refresh` | POST | 立即查询某个任务 |

前端轮询 `media/status` 的方式与 `quota/status` 相同（订阅时才轮询，有任务进行中时 4 秒一次）。

## 13. 代码结构与仓库约定的修改

- 新增内部模块 `lib/media.js`：分类、请求 CPA、任务轮询、三个存储文件、上限计算。在 `lib/index.js` 里用相对路径引入，并把它加进 `package.json` 的 `files`。
  - 1.7.0 已把离线更新改为按包内 `files` 校验，1.8.0 正好满足 AGENTS.md「至少隔一个版本再新增文件」的要求。CHANGELOG 需注明：1.5.0–1.6.0 用户请通过插件市场或 npm 先升级一次。
- `lib/index.js`：`apply()` 注入 `tools`（受开关控制）、`approval`（可选）、`fs` / `attachments`（可选），注册命令和路由。
- `lib/client.js`：切换按钮 `MediaChip`、设置页的「生成」标签页、视频预览渲染器。
- **AGENTS.md「No agent tool」改为：**
  > **At most one agent tool, `generate_media`, off by default.** It is registered only while the media switch is on and an enabled account exposes an enabled media model. Its schema is static (no model lists, ≈250 tokens). Account management, quota and updates are never exposed as tools; `apply()` injects `tools` only for this purpose (asserted in `tests/plugin.test.mjs`).
- AGENTS.md 同时补充：Surface 表、`lib/media.js` 小节、§8/§9 的不变量（无法取消、扣秒规则、3 小时过期）。
- 两份 README 都加「生成」章节和配置表；两份 CHANGELOG 的 `Unreleased` 里都记录变更。

## 14. 测试清单

- **分类**：`type` / 输出模态 / 模型族 / 手动覆盖的判断优先级；带前缀的模型 id；媒体模型不进路由、不参与推荐；`selectedModels` 保持不变。
- **工具注册**：开关关闭时不注入 `tools`、工具数量为 0；打开但没有可用生成模型时仍为 0；打开且有生成模型时只有 `generate_media`；schema 快照对比，确保不含模型列表。
- **模型选择**：§4.2 的每一档；歧义匹配报错；子 agent 使用根会话的选择。
- **确认**：`ask` 时分别收到 allowed / rejected / unavailable / cancelled 的处理；`auto` 时不调用 approval；会话覆盖全局；`/cpa-video` 不调用 approval。
- **上限**：确认模式只计数不拦截；免确认时超额拦截；提交即扣、CPA 拒绝才退回；改上限或重新开启免确认时清零；无限制；1–15 秒的截断与校验。
- **任务**：轮询退避；工具中断后后台继续；重启后恢复；超过 3 小时标记过期；下载先用 content 接口、再用 URL 后备（https、大小限制、不跟随跨主机跳转）。
- **存储**：原子写入；损坏文件不被覆盖；三个文件都不含 key、token 或 URL。
- **前端**（VM 测试工具）：切换按钮的显示 / 隐藏、首页与输入框只显示一份、文案中英两套、卸载时清理。
- 所有测试都伪造 `fetch`、approval 和 fs，不访问网络，不碰真实 profile。

## 15. 待验证项（实现前对照真实 BCPA）

1. BCPA 的 `/v1/models?client_version=pi` 里，`grok-imagine-*` 是否带 `type` 或输出模态字段，决定 §3 第 2 步能否生效。
2. 原生 `/v1/videos/generations` 的字段名（`duration` / `aspect_ratio` / `resolution` / `image`）和返回结构。
3. 用原生接口提交的任务，能否用 `/openai/v1/videos/{id}/content` 下载。
4. 生图接口返回 `b64_json` 还是 `url`；`grok-imagine-image` 是否支持 `/v1/images/edits`。
5. 视频完成后，如何在原会话里追加提示：是否有不触发新 turn 的会话通知接口；没有的话，退而在切换按钮上显示角标，并在下次调用工具时附带说明。
6. 右侧预览读取视频字节是否受 Host `maxFileBytes` 限制；超出时改为「用系统默认程序打开」。
7. 子 agent 如何追溯到根会话（`ctx.agents` / `exec.agent` 上可用的 API）。

验证只发只读请求（模型目录、查询已有任务）。需要真实生成的验证项，**每一次都先征得用户同意**。

## 16. 分阶段实施

1. **P1 分类与存储**（✅ 已完成）：模型分类（含普通列表里才有的生成模型）、`lib/media.js` 的设置读写、`media/{status,save,diagnose}`，以及账号页「生成」标签（模型开关、类型修改、手动标记、只读诊断）。全局设置项只做了存储和校验，界面在用到它们的阶段再加（P2 输出目录，P3 视频默认值，P4 工具开关、确认和上限），避免出现没有效果的开关。
   - 只读诊断：带 Key 读取两份模型目录，只报告疑似生成模型的固定描述字段；不带 Key 用 GET 探测 `GET /v1/videos/{id}` 和 `GET /openai/v1/videos/{id}/content`：CPA 的 Key 校验挂在路由组上，存在的路由返回 401，不存在的路由返回框架自带的纯文本 `404 page not found`，整个过程不选凭据、不访问上游。不探测 POST 接口：CPA 未要求 Key 时，空请求体的 POST 可能被当成默认模型的生成请求。
2. **P2 生图**（✅ 已完成，已做真实生成测试）：生图 / 改图请求、`/cpa-image`、输入框旁的生成模型按钮（只有生图模型列表；按用户反馈去掉了弹层里的最近缩略图）、「生成」页的保存位置、`media-sessions.json`、`media/{session,session/save,file}`。
   - 命令结果本身只能是纯文本，但 DSH 提供按命令名替换显示的插槽 `conversation.chat.commandview`：`/cpa-image` 这一行由插件自己渲染摘要、提示词和这次生成的图片（按会话 + `commandId` 经 `media/command` 读取）。首次真实测试（2026-10-22，BCPA，`gpt-image-2.5-flare`，28 秒）成功后补上这一点。
   - 用户反馈（2026-10-22）后改为：① 命令只做检查就返回，生成转入后台任务（DSH 的输入框要等命令处理函数返回才清空草稿）；② 显示成一问一答：右侧用户气泡 + 左侧回复（占位框、计时、图片、耗时与保存目录），后台进行中每 2 秒查询 `media/command`（返回 `{ run, files }`，`media-sessions.json` 增加最近 48 次 `runs`）；③ DSH 只把智能体轮次算作运行中且没有插件接口，生成期间插件自己发 `api-session/status`（开始时、每 5 秒、智能体回到空闲后），结束后在智能体不运行时发回空闲；副作用是输入框出现停不下生成的「停止」按钮，消息照常发送。插件重载会中断进行中的任务（记为 `interrupted`）。
   - 第二轮反馈：桌面版里 `target="_blank"` 的「在新窗口打开原图」会被交给系统浏览器、没有会话 Cookie，因此去掉；改为右键菜单 / 放大后的按钮：用默认应用打开、在文件夹中显示（走 DSH 会话接口 `session.openWorkspacePath`，与文档预览相同，Host 再次校验路径）、复制图片（PNG）、复制路径。为此 `media/command` 返回文件的绝对路径和 `folderPath`（`media/session` 仍只返回文件名）。输入框按钮刚启动时看不到：`media/session` 在没有生图模型且有账号未读目录时先同步一次，按钮重试改为 3 s / 10 s / 30 s。
   - 弹层只在打开时读取数据；`media/file` 只提供插件为该会话记录过的文件，`media/session` 只返回文件名和 id。
   - 工作目录必须是本机文件夹（插件用 Node 的 fs 写文件；DSH 的 `ctx.fs` 没有写二进制的接口）。
3. **P3 生视频**（✅ 已实现，待真实生成测试）：视频提交与轮询、任务持久化、`/cpa-video`、`/cpa-video-status`、视频预览。
   - 对照 CPA `dev@9e79552` 的 `openai_videos_handlers.go` 核对：原生 `POST /v1/videos/generations` 原样转给 xAI（字段 `model` / `prompt` / `duration` / `aspect_ratio` / `resolution` / `image.url`，只接受 Grok 视频 id，所以 `sora-2*` 由插件改写为 `grok-imagine-video`），返回 `request_id`；`GET /v1/videos/{id}` 返回 xAI 原样结果（`status`、`video.url` / `duration`、`error`）；原生提交也会登记凭据绑定，所以 `GET /openai/v1/videos/{id}/content` 可以下载（CPA 用凭据的代理去取 `video.url`）。不写比例时交给 xAI（默认 16:9 / 首帧比例），这也是选原生接口而不是 OpenAI 格式接口（那里默认尺寸固定为竖屏 720x1280）的原因。
   - 后续补充（2026-10-22）：按 xAI 文档实现参考图（`reference_images`，1.5 最多 14 张）、首尾帧（`image` + `last_frame`）、尾帧，以及编辑 / 延长（`/v1/videos/edits`、`/extensions`，模型 `grok-imagine-video`）。原视频不上传：请求体上限约 2 MiB、CPA 没有 `/v1/files`，所以用 xAI 结果自带的短期链接（只放内存、约 1 小时、重载即失效）。这改写了 D9（v1 不做编辑 / 延长）。
    - 再次补充（2026-10-22）：用不会生成内容的请求（空提示词 / 非法时长）实测 BCPA 的请求体上限：`/v1/videos/generations` 读得下 1 MiB、1.2 MiB 起返回「length limit exceeded」；`/v1/videos/edits` 读得下 20 MiB；`/v1/videos/extensions` 返回 405（该服务器上游没有延长接口，CPA 随后让凭据冷却约 1 分钟）。据此 `/cpa-video-edit` / `-extend` 改为接受任意 MP4：附带文件、`--video` 路径、`--url` 公开链接、`--from`，本地视频以 base64 内联（≤ 14 MiB），插件生成的视频在链接过期后发送已保存的文件；视频的附带图片按 1 MiB 请求体分配。
   - 视频预览没有用 `documentPreviews`：对话里的命令行直接用 `<video>` 播放，`media/file` 支持 `Range`。§15 第 5 项（完成提示）由命令行本身承担：后台完成后该行自动显示视频；第 6 项因此不再需要。
4. **P4 agent 工具**（✅ 已实现，待真实测试）：`generate_media`、开关、确认、上限，以及 AGENTS.md / README / CHANGELOG 的修改。
   - 与原设计的差异（2026-10-22，经用户确认）：工具也支持编辑 / 延长视频（`mode`、`video` 参数，另有 `frames`），定义约 400 token；不再提供 `video_id` 续等参数，超时后由后台任务继续、对话行展示结果。确认走 `ctx.approval.request`（与 DSH 自带工具的审批相同，会话审批策略为 `never` 时拒绝）；工具调用行通过 `tool.call.toolview` 复用斜杠命令的一问一答显示。工具复用斜杠命令的处理函数（`literal` 模式：不识别提示词里的参数词、不请对话模型解读），在受理后、记录和发送前调用 `gate` 完成确认、上限检查和扣秒。编辑按原视频时长、延长按新增秒数扣秒。图片确认方式也可按会话覆盖。

每个阶段结束都要通过 `npm run check`。P4 完成后再一起发布 1.8.0。
