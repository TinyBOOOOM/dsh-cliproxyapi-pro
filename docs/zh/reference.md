中文 | [English](../en/reference.md) · [返回 README](../../README.md)

# 斜杠命令与 HTTP 接口

除了默认关闭的生成工具 `generate_media`（见 [生图与生视频](media.md)），本插件不注册 Agent 工具，不占用模型上下文。账号与模型在 **设置** → **CLIProxyAPI** 页管理，也可以用下面的斜杠命令查看和刷新。

### 斜杠命令

- `/cpa-status`：显示所有账号的状态（含识别出的生图 / 生视频模型数量）。
- `/cpa-refresh`：立即刷新所有账号（也会探测停用账号的模型列表）。
- `/cpa-image [-m 模型] [--aspect 比例] [-n 1-4] 提示词`：生成图片；附带图片时改图。见 [生成图片](media.md#生成图片cpa-image)。
- `/cpa-video [-m 模型] [--aspect 比例] [-s 1-15] [-r 480p|720p] 提示词`：生成视频；可附带一张首帧图。提交后无法取消。见 [生成视频](media.md#生成视频cpa-video)。
- `/cpa-video-status`：列出本会话的视频任务。
- `/cpa-video-edit [--video 路径 | --url 链接 | --from 命令id] [-m 模型] 修改说明`、`/cpa-video-extend [同上] [-s 2-10] 接下来的内容`：编辑 / 延长任意 MP4（可附带视频文件）。见 [编辑 / 延长视频](media.md#编辑--延长视频cpa-video-editcpa-video-extend)。

### HTTP 接口

供设置面板使用，需要 DSH Web 会话的认证；POST 只接受来自本机或受信任主机的同源请求。

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/api/dsh-cliproxyapi/status` | — | `{ ok, global, accounts[] }` |
| POST | `/api/dsh-cliproxyapi/refresh` | `{ accountId? }` | 刷新一个或全部账号 |
| POST | `/api/dsh-cliproxyapi/save` | `{ accountId?, …账号字段, apiKey?, clearApiKey?, refreshIntervalSeconds?, probeTimeoutMs? }` | 保存账号（缺省为第一个）；只有全局字段时只保存全局设置 |
| POST | `/api/dsh-cliproxyapi/accounts/add` | 账号字段（可选） | 新增账号，默认停用；返回 `createdId` |
| POST | `/api/dsh-cliproxyapi/accounts/remove` | `{ accountId }` | 删除账号及其路由 |
| POST | `/api/dsh-cliproxyapi/accounts/test` | `{ accountId?, baseURL?, apiKey? }` | 用未保存的地址和密钥测试连接，不保存、不写路由；`apiKey` 留空时用该账号已保存的密钥；不返回密钥 |
| GET | `/api/dsh-cliproxyapi/updates/status` | — | 只读更新状态，不主动联网检查 |
| POST | `/api/dsh-cliproxyapi/updates/check` | `{}` | 主动检查所选通道与区域；手动检查不触发自动下载 |
| POST | `/api/dsh-cliproxyapi/updates/save` | `{ autoCheck?, autoDownload?, autoInstall?, channel?, region? }` | 只保存这五项更新设置，与账号配置独立 |
| POST | `/api/dsh-cliproxyapi/updates/download` | `{ version }` | 下载最近一次检查确认的新版本，完成校验后保存离线包；不安装 |
| GET | `/api/dsh-cliproxyapi/quota/status` | — | `{ ok, quota }`：缓存的额度快照；仅未暂停的过期账号 / 凭证在后台刷新；账号与凭证的 `autoRefreshPaused` 表示失败暂停 |
| POST | `/api/dsh-cliproxyapi/quota/refresh` | `{ accountId? }` | 开始刷新并立即返回；指定账号会重试其暂停查询，未指定时跳过暂停项；正在刷新时 `refreshing` 为真 |
| POST | `/api/dsh-cliproxyapi/quota/save` | `{ accountId, managementKey?, clear? }` | 保存或清除该账号的管理密钥，并开始刷新额度；响应不含密钥 |
| GET | `/api/dsh-cliproxyapi/media/status` | — | `{ ok, media }`：生成设置与每个账号识别出的生图 / 生视频模型；不联网 |
| POST | `/api/dsh-cliproxyapi/media/save` | `{ account: { accountId, disabledModels?, kindOverrides? } }` | 保存某账号关闭的生成模型（整表替换）或类型覆盖（按模型合并，`null` 表示恢复自动识别）；类型变化时重新同步该账号并在响应中附带 `status`。无效值返回 400 和错误码，如 `invalid-account`、`invalid-kind` |
| POST | `/api/dsh-cliproxyapi/media/diagnose` | `{ accountId }` | 只读诊断（见 [生图与生视频](media.md)），返回 `{ ok, diagnostic }`，不含 Key |
| GET | `/api/dsh-cliproxyapi/media/session?sessionId=` | — | `{ ok, session }`：可选的生图 / 生视频模型、当前选择及其来源（`session` / `last` / `only`）、本会话最近生成的文件（只有文件名和 id，不含路径）；`pendingConfirmations` 仅列出缺少原生提问服务时、属于这个确切会话的待确认项 `{ commandId, kind, en, zh, expiresAt }`，原生提问不在其中；不联网 |
| POST | `/api/dsh-cliproxyapi/media/session/save` | `{ sessionId?, kind: "image" \| "video", ref }` | 为会话选择模型（`ref` 为 `账号id/模型id`，`null` 清除本会话的选择），并记为上一次选择；不在可选列表里的模型返回 400 `invalid-model`。也可以只传 `{ sessionId, videoConfirm?, imageConfirm?, videoBudget? }`（`ask` / `auto` / `inherit`，上限为 `{ mode: "limited", seconds }` / `{ mode: "unlimited" }` / `inherit`）修改本会话的 agent 生成设置 |
| POST | `/api/dsh-cliproxyapi/media/confirm` | `{ sessionId, commandId, allow }` | 仅回答缺少原生提问服务时、输入框旁兼容确认区中的 `generate_media` 确认（每 2 秒读取 `media/session`）；不用于原生提问，与执行审批权限无关。只有该确认所属的确切根会话能回答，已回答或已过期返回 400 `confirm-expired` |
| GET | `/api/dsh-cliproxyapi/media/file?sessionId=&id=` | — | 返回插件为该会话记录过的生成文件；其他文件或其他会话一律 404。视频以流的形式返回，支持单个 `Range` 区间（206），便于播放器拖动 |
| GET | `/api/dsh-cliproxyapi/media/command?sessionId=&commandId=` | — | `{ ok, run, files }`：该会话中某次命令的生成记录（状态 `running` / `done` / `error`、模型、提示词、比例、张数、参考图数量、起止时间、保存目录的显示名、错误代码和摘要）和生成的文件（id、文件名和完整路径，以及保存目录 `folderPath`、Host 的文件管理器类型 `desktop`：`explorer` / `finder` / `filemanager`），供对话里的命令行显示和打开文件；视频记录另有时长、分辨率、请求 id、方式 `mode`（`text` / `first-frame` / `reference` / `first-last` / `last-frame` / `edit` / `extend`）和来源命令 id；还能编辑 / 延长时附带 `actions: { edit, extend, expiresAt }`（不含链接）；进行中时附带阶段 `phase`（`submitting` / `queued` / `running` / `downloading`）和 CPA 返回的进度 `progress`；记录为进行中、但当前没有对应后台任务的（插件重载或崩溃）报告为 `interrupted` |

更新接口的操作响应采用 `{ ok, update }`，状态包含 `currentVersion`、`latestVersion`、`available`、`channel`、`region`、`effectiveRegion`、`autoCheck`、`autoDownload`、`autoInstall`、`checking`、`downloading`、`lastCheckedAt`、`error` / `errorCode`、`blockedReason`、`downloadedVersion`、`downloadPath` 与 `upgradeCommand`。未检查或未下载的相关字段为 `null`。`channel` 为 `stable` / `beta` / `dev`，`region` 为 `auto` / `global` / `cn`；`effectiveRegion` 为本次成功检查使用的 `global` / `cn`（此前为 `null`）。

失败用顶层 `errorCode` 或 `update.errorCode` 表达，不能只凭 HTTP 状态或 `ok` 判断操作成功；常见值包括 `network-error`、`invalid-metadata`、`channel-unavailable`、`integrity-error`、`invalid-package`、`storage-error`、`busy`、`stale-version`、`service-unavailable`、`forbidden-origin` 与 `disposed`。更新 POST 仍然依赖宿主的会话鉴权与可信主机策略：请求带 `Origin` 时必须属于当前监听的同一 authority（按 `Origin` 自身协议比较主机与端口，与宿主规则一致），否则返回 `forbidden-origin`；桌面端桥接请求可能不带 `Origin`，此时只要通过宿主会话鉴权即可执行，未认证请求仍会在到达路由前被拒绝。普通未认证 `curl` 不能调用这些接口。
