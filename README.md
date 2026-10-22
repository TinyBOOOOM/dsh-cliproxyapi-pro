# dsh-cliproxyapi-pro

中文 | [English](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/README.en.md)

[![npm](https://img.shields.io/npm/v/dsh-cliproxyapi-pro?label=npm)](https://www.npmjs.com/package/dsh-cliproxyapi-pro)
[![CI](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)

**把 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（CPA）里的模型，一键接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的模型选择器。**

填好服务地址和 API Key，插件会自动读取 CPA 的模型目录，把你勾选的模型连同上下文长度、图片输入、推理档位一起同步到 DSH；每个模型自动走它最合适的协议。可以同时接入多个 CPA 账号，每个账号单独启用或停用。

- **多账号**：每个账号独立的地址、密钥、模型勾选和参数，互不影响，可随时停用。
- **开箱即用**：首次连接时按该服务自己的模型目录，为每个模型家族勾选最新的一个（最多 12 个），模型选择器不会被上百个模型淹没。
- **原生协议**：Claude 走 Anthropic Messages，GPT / Codex / Grok 走 OpenAI Responses，其余走 OpenAI Chat，减少 CPA 的协议转换。
- **可视化管理**：设置面板里勾选模型、编辑单个模型的参数。插件不注册 Agent 工具，不占用模型上下文。
- **插件更新**：自动检查稳定 / Beta / 开发通道，可选择全球 / 中国大陆下载源；装有 [DSH 插件市场（dshmarket）](https://github.com/dsh-market/dsh-market) 时可一键或自动安装新版本，否则下载校验离线包，在关闭 DSH 后手动升级。
- **安全**：API Key 只保存在 DSH 凭证服务里，不写入任何配置文件。
- **零依赖**：不依赖任何 npm 包，无需构建，安装几秒完成。

适用于 DSH `0.2.0-rc.1` 及以上版本（含桌面版与 Web 版）。

## 目录

- [安装](#安装)
- [快速上手](#快速上手)
- [截图](#截图)
- [功能详解](#功能详解)
- [插件自身更新](#插件自身更新)
- [斜杠命令与 HTTP 接口](#斜杠命令与-http-接口)
- [存储与配置](#存储与配置)
- [升级与卸载](#升级与卸载)
- [常见问题](#常见问题)
- [给 AI Agent 的安装指南](#给-ai-agent-的安装指南)
- [开发](#开发)
- [许可证](#许可证)

## 安装

插件已发布到 npm：[`dsh-cliproxyapi-pro`](https://www.npmjs.com/package/dsh-cliproxyapi-pro)，中国大陆镜像（npmmirror）同步可用。任选一种方式安装即可。

### 方式一：在 DSH 插件页安装（推荐）

1. 打开 DSH，点击左侧栏的 **插件**。
2. 点击页面顶部的 **添加插件**。
3. 在输入框中填写包名：

   ```text
   dsh-cliproxyapi-pro
   ```

   需要固定版本时可以写成 `dsh-cliproxyapi-pro@1.7.0`。
4. 点击 **安装**，完成后点击 **立即启用**。

> 在中国大陆下载慢，可以点输入框旁的 **安装源**，切换到 **中国大陆镜像源**。

### 方式二：让 DSH 里的 Agent 帮你装

在 DSH 对话框里直接说：

```text
帮我安装 DSH 插件 dsh-cliproxyapi-pro
```

Agent 会调用 `plugin_manager` 完成安装和启用（视权限设置，可能需要你批准）。装好后可以接着让它配置，例如「把 CLIProxyAPI 地址设为 http://127.0.0.1:8317，密钥是 sk-…」。

### 方式三：命令行

```bash
dsh plugin --profile <profile 名称> add dsh-cliproxyapi-pro
```

这条命令从 npm 下载插件，并把它加入该 profile 已启用的插件列表，一步完成。DSH 桌面版的 profile 通常叫 `desktop`；如果 DSH 正在运行，重启后生效。

### 方式四：从 GitHub 安装（不经过 npm）

在插件页的 **添加插件** 中，或作为 `plugin_manager` 的 `target`，也可以填写：

| 来源 | 填写内容 |
|---|---|
| 某个发布版本 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.7.0` |
| 最新开发版 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| 离线安装包 | 下载 [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz)（始终是最新版），填写它的本地绝对路径 |
| 本地源码（开发用） | 克隆后的仓库目录绝对路径；以链接方式安装，改代码后重载插件即生效 |

所有版本见 [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases)。

## 快速上手

1. **打开设置面板**：**设置** → 左侧导航的 **CLIProxyAPI** 页（账号、模型与协议都在这里）。插件自身的更新在左侧栏 **插件** → **CLIProxyAPI**，或 **设置** → **内置插件** → **CLIProxyAPI** 标签页，这两处只有更新功能。
2. **添加账号**：点 **+ 添加账号**，填账号名称、**服务地址**（如 `http://127.0.0.1:8317`，不用加 `/v1`）和 **API Key**（本地免密的 CPA 可留空），点 **连接**。连接成功即创建并启用账号；失败时会显示原因，可修正后重试，或选「仍然添加（不启用）」。
3. **选择模型**：在账号的 **模型** 标签里，CPA 上的全部模型已列出，并已为每个家族勾好最新的一个。按需增减后点底部的 **保存并应用**。
4. **开始使用**：回到对话框，打开模型选择器，就能在以账号名称命名的分组里看到这些模型。

CPA 就在本机默认端口 `8317` 且没有设置密钥时，什么都不用填，插件会自动发现它。

## 截图

图 1–5 是离线组件渲染：用本插件的真实界面代码加示例数据（`example.com` 地址、虚构账号）在浏览器中渲染，配色按 DSH 深色主题近似，实际颜色跟随你的 DSH 主题。图 6 是 1.6.0 在 DSH 桌面版中的实际截图。

**1. 账号与连接。** 设置左侧导航的 **CLIProxyAPI** 页：顶部账号栏三个标签共用；账号标题下是连接状态、地址和模型数，右侧「启用」开关立即生效，「⋯」菜单里是「立即探测刷新」和「删除此账号」。「连接」标签里每项一行，地址旁可「测试连接」（用正在编辑的值，不保存），次要说明在 ⓘ 里。

![账号栏、账号标题与连接标签（离线渲染）](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/connection.png)

**2. 模型与统一保存。** 「模型」标签列出该 CPA 上的全部模型：全部 / 已勾选 / 未勾选、家族筛选、搜索、批量操作与「恢复推荐精选」；勾选的模型显示将使用的协议，可「编辑参数」。连接和模型的改动统一记录，底部出现「有未保存的更改 · 放弃更改 / 保存并应用」。

![模型标签与底部保存栏（离线渲染）](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/model-filter.png)

**3. 额度。** 「额度」标签：管理密钥、额度数据与刷新、凭证分布条，按渠道分组的凭证（套餐、前缀、状态、5 小时 / 每日 / 每周等额度条与重置时间；Devin 显示每日 / 每周额度，所有 Devin 模型共用；没有额度接口的渠道只显示状态与近期请求），以及可展开的「模型 → 渠道」表。标签上显示该账号可用凭证中最低的剩余额度。

![额度标签：分布条与按渠道分组的凭证额度（离线渲染）](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/quota.png)

**4. 对话框里的额度。** 模型选择器左侧的徽标显示当前模型可用凭证中最充足的剩余额度；点击后列出服务该模型的每个凭证及其额度窗口。只对本插件同步、且所属账号已填写管理密钥的模型显示。

![模型选择器旁的额度徽标与弹出列表（离线渲染）](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/quota-badge.png)

**5. 添加账号。** 填名称、地址和 API Key 后点「连接」：先测试，成功才创建并启用账号；失败时显示原因，可选「仍然添加（不启用）」。

![添加账号表单（离线渲染）](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/add-account.png)

**6. 内置插件里的插件更新页**（1.6.0 实际截图）。**设置** → **内置插件** → **CLIProxyAPI** 标签页只有插件更新：检查更新与离线下载、检测到 DSH 插件市场后的「立即更新」、更新通道、下载区域，以及自动检查 / 自动下载 / 自动安装开关。图中已是稳定通道最新版本，所以「立即更新」不可用。

![内置插件中的 CLIProxyAPI 更新页：版本状态、插件市场更新、通道、区域与自动开关](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/updates.png)

## 功能详解

### 自动发现与同步

- 服务地址可以是本地或远程，`/v1`、`/v1/chat/completions`、`/v1/messages` 等后缀会自动去掉。
- 地址留空时，依次尝试：已有路由的地址、环境变量 `CLIPROXYAPI_BASE_URL`、本机 `127.0.0.1:8317`。
- 读取 `/v1/models?client_version=pi` 的富元数据目录（也兼容标准 OpenAI `data[]` 格式），并用 `/v1/models` 的 `owned_by` 判断模型家族、用其中的 `type` 识别生图模型。
- 生图 / 生视频模型不会写入对话路由，见 [生图 / 生视频模型](#生图--生视频模型生成标签页)。
- 所有账号按统一间隔自动刷新（默认 300 秒）；模型目录没有变化时不写入任何设置。

### 模型勾选

- 搜索、家族标签、全部 / 已勾选 / 未勾选切换、批量勾选。**只有勾选的模型会出现在模型选择器中**；勾选为空表示全部显示。
- 还可以用「包含 / 排除关键词」规则进一步过滤。
- 从未保存过勾选的账号，首次探测成功后自动为每个模型家族勾选最新的一个（最多 12 个），按该服务自己的模型目录计算；**恢复推荐精选** 可随时恢复这组勾选。

### 单模型参数覆盖

已勾选模型的 **编辑参数** 可以单独设置：上下文窗口、最大输出、图片输入、思考等级（`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`）和请求协议，也可一键恢复自动探测值。

### 多账号

- 每个账号写入自己的一组路由：第一个账号为 `cli-proxy` / `cli-proxy-responses` / `cli-proxy-messages`，之后依次为 `cli-proxy-2*`、`cli-proxy-3*`……；密钥引用名依次为 `CLI_PROXY_API_KEY`、`CLI_PROXY_API_KEY_2`……。模型选择器按账号名称分组。
- **停用**账号：保留全部配置，但移除它的路由，模型从选择器中消失；其他账号不受影响。
- **新增**账号：「+ 添加账号」先用填写的地址和密钥测试连接，成功才创建并启用；也可以选择「仍然添加（不启用）」。
- 每个账号的页面分 **连接 / 模型 / 生成 / 额度** 四个标签，顶部账号栏对所有标签共用。账号标题旁的「启用」开关立即生效；「⋯」菜单里是「立即探测刷新」和「删除此账号」。
- 连接和模型的改动统一记录，底部出现「有未保存的更改 · 放弃更改 / 保存并应用」；切换账号前会提醒未保存的更改。「测试连接」用正在编辑的地址和密钥探测，不保存任何内容。
- 次要说明收进标签旁的 ⓘ 提示（悬停、键盘聚焦或点击打开）。
- 填写了服务地址的账号**只连接该地址**，连不上就报错，不会悄悄改连本地 `:8317`，避免两个账号指向同一个服务。
- 不同账号的路由 ID 不能重叠，冲突的修改会被拒绝。
- **删除**账号会移除它的路由，但保留凭证服务里的密钥。

### 协议路由

CPA 对每个模型同时提供 OpenAI Chat、OpenAI Responses、Anthropic Messages 三种入口，入口协议和上游不一致时需要转换。默认的自动模式让每个模型直接使用上游协议：

| 模型家族（依据 `owned_by` 与模型 id） | 协议 | 路由（以 `cli-proxy` 为例） |
|---|---|---|
| Claude（含 `devin/claude-*`、Antigravity Claude） | Anthropic Messages `/v1/messages` | `cli-proxy-messages` |
| OpenAI / Codex / GPT、xAI Grok | OpenAI Responses `/v1/responses` | `cli-proxy-responses` |
| Gemini、DeepSeek、Kimi、GLM、SWE、gpt-oss 等 | OpenAI Chat `/v1/chat/completions` | `cli-proxy` |

- DSH 自定义路由不支持 Gemini 原生 `generateContent`，所以 Gemini 走 OpenAI Chat。
- DSH 每条路由只能有一种协议，模型按协议分到三条路由；没有模型的路由会自动移除。默认模型因此换了路由时，`agent-default-model` 会自动跟随。
- Claude 4.6+ / 5.x / Fable 使用自适应思考（`effort`），更早的 Claude 使用 token 预算。
- 可以改为「统一使用」某一种协议，或在单个模型的「编辑参数」里指定。
- 你在路由上手动加的其他字段（如 `retryPolicy`）会被保留。

### 渠道额度（「额度」标签页与对话框额度徽标）

每个账号的 **额度** 标签（与 **连接**、**模型**、**生成** 并列）显示该账号的渠道额度；标签上显示该账号可用凭证中最低的剩余额度。

- **填写管理密钥**：在「额度」标签里为每个账号填写 CPA 的管理密钥（CPA 配置里的 `remote-management.secret-key`；远程 CPA 还需开启 `remote-management.allow-remote`）。密钥保存在 DSH 凭证服务中，引用名第一个账号为 `CLI_PROXY_MANAGEMENT_KEY`，其他账号为 `CLI_PROXY_MANAGEMENT_KEY_<账号 ID>`（如 `CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2`）；不会写入 `state.json`、设置或日志，也不会返回给页面。
- **由宿主读取**：宿主用管理接口读取该 CPA 的全部凭证（`/v0/management/auth-files`）、每个凭证服务的模型列表，并经 `/v0/management/api-call` 查询上游额度：Codex、Claude、Antigravity、Gemini CLI、Kimi（含 Kimi 国际版 kimi.ai）、xAI、Devin、Meta。CPA 插件提供的渠道（凭证标记了 `supports_quota`）改走 CPA 自己的 `/v0/management/quota/fetch`。Devin 的每日 / 每周额度是整个账号共用的，所有 `devin/…` 模型显示同一组额度。Meta 的额度接口需要凭证文件里的 `dca_token`，宿主每次查询时经管理接口读取，只用于这一次请求，不保存、不记录。API Key 类渠道（OpenAI 兼容、Gemini / Claude / Codex API Key）和 Vertex 没有额度接口（CPA 自带面板同样不显示），只显示账号状态与近期请求数；xAI 付费账号也没有额度计数（CPA 面板为此会真实发一次对话请求探测，本插件不这样做，以免后台刷新产生费用）。
- **额度页**：采用 DSH 原生设置页的行式布局：管理密钥、额度数据与刷新、凭证分布条（充足 / 偏低 / 耗尽 / 停用异常），按渠道分组的凭证列表（套餐、前缀、状态、5 小时 / 每周 / 每月 / 每日额度条与重置时间，问题与剩余最少的排在前面）、渠道筛选（凭证较多时可搜索），以及可展开的「模型 → 渠道」表，列出模型选择器中每个模型实际匹配到的凭证。
- **对话框徽标**：模型选择器左侧的小徽标（信号格 + 百分比）显示当前所选模型可用凭证中最充足的剩余额度，点击可查看每个凭证的额度。只对本插件同步、且所属账号已填写管理密钥的模型显示；没有管理密钥时不显示徽标。在新建对话页（输入栏尚未接管会话时），徽标显示在输入框上方工作区一行的右侧。
- **精确匹配**：只在所选模型所属的账号（按路由 `cli-proxy*`、`cli-proxy-2*`…）里找凭证；带前缀的模型（如 `devin/claude-opus-5-5`）只匹配该前缀的凭证；不带前缀的同名模型（如 `claude-opus-5-5`）优先匹配不带前缀的凭证，Claude 渠道与 Devin 渠道不会混用。Antigravity 等按模型分组的额度窗口只取与当前模型相符的那一组。
- **排查**：`/cpa-status` 会附带额度摘要：每个账号的管理密钥状态、额度状态、凭证数，以及模型选择器中每个模型匹配到的凭证和剩余额度（不输出密钥）。
- **刷新**：结果在宿主端缓存 5 分钟；有页面在看时才在后台刷新过期账号，也可手动「刷新额度」。管理密钥被拒（401/403）后暂停该账号的自动刷新，直到更新密钥或手动刷新，避免触发 CPA 的错误密钥封禁。

### 生图 / 生视频模型（「生成」标签页）

CPA 通过 `/v1/images/*` 和 `/v1/videos/*` 提供生图、生视频模型（如 Grok Imagine）。这些模型不能用于对话，所以插件会把它们识别出来，不放进对话模型选择器。

- **识别规则**（按顺序）：你在「生成」标签里手动指定的类型；模型目录里的 `type`（`openai-image` 为生图）或输出模态（只输出图片为生图，输出视频为生视频）；CPA 分流到图片 / 视频接口的模型族，按前缀匹配：以 `grok-imagine-image` 或 `gpt-image-` 开头为生图，以 `grok-imagine-video` 开头或 `sora-2*` 为生视频。其余都是对话模型（如 `gemini-3.1-flash-image`：CPA 只通过对话接口提供它，DSH 也不能显示对话中返回的图片）。只出现在 `/v1/models` 普通列表里的生成模型也会被收录。模型目录可能列出 CPA 生成接口暂不接受的变体（例如 `grok-imagine-video-1.5-lite`），它们同样不能对话，因此归为生成模型；用它们生成时会显示 CPA 返回的错误。
- **不进入模型选择器**：生成模型不会写入任何对话路由，也不参与首次推荐勾选；即使旧的勾选里含有它们，也不会被同步（勾选本身保持不变）。「模型」标签只列对话模型。
- **「生成」标签**（与 连接 / 模型 / 额度 并列）：分「生图模型」「生视频模型」两组列出，修改立即保存。每个模型可以用开关决定是否提供给生成功能（新出现的模型默认开启），用类型下拉框改为生图 / 生视频 / 对话模型；手动指定的类型可以恢复为自动识别。识别漏掉的模型可以在「把其他模型标记为生成模型」里手动标记。改动类型会立即重新同步该账号的路由。`sora-2*` 标注为「→ grok-imagine-video」：CPA 会把它改写为 Grok 视频模型调用。
- **只读诊断**：「运行诊断」只发送 GET 请求：用该账号的 Key 读取两份模型目录，列出疑似生成模型及其 `type`、模态等描述字段；再**不带 Key** 探测 `GET /v1/videos/{id}` 和 `GET /openai/v1/videos/{id}/content` 是否存在（存在的接口直接返回 401，不存在时返回 CPA 的 404）。不会生成内容，也不会消耗额度；CPA 未要求 Key 时，探测会用一个不存在的任务 id 查询一次，仍是只读请求。结果可复制，不含 Key。
- **保存位置**：「生成」标签底部可以修改生成文件的保存位置（默认 `generated`），相对路径以会话的工作目录为基准，也可以填写绝对路径；所有账号共用。
- **视频默认值**：账号有生视频模型时，「生成」标签里可以设置 `/cpa-video` 默认的时长（1–15 秒，默认 6 秒）和分辨率（480p / 720p，默认 720p）；所有账号共用，修改立即保存。

#### 生成图片（`/cpa-image`）

在对话输入框里输入：

```text
/cpa-image 一只橘猫在雨夜的霓虹街头
/cpa-image -m quality --aspect 16:9 -n 2 一只橘猫在雨夜的霓虹街头
```

- **选项**（写在提示词前面）：`-m <模型>` 临时指定模型，可以写完整的 `账号id/模型id`、模型 id，或能唯一匹配的片段（如 `quality`），匹配到多个时报错并列出候选，不会替你猜；`--aspect <比例>` 可选 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`9:20`、`20:9`；`-n <1-4>` 生成张数。也可以直接写在提示词开头或结尾，作为独立的词（用空格或逗号隔开）：`16:9`、`竖屏`（9:16）、`横屏`（16:9）、`方形`（1:1）、`2张`，例如 `/cpa-image 2张 竖屏 一只橘猫`；`-n` 等选项写了时以选项为准。`--` 之后的内容一律当作提示词。
- **改图**：在输入框附带 1–4 张图片再执行命令，会改用 CPA 的 `/v1/images/edits`，图片作为参考图发送（合计不超过约 1.4 MB）。只接受图片附件。附带的图片以 base64 放在请求里，而上游限制请求大小（约 2 MiB，超出时 xAI 返回「Failed to read request body: length limit exceeded」），所以过大的图片会先缩小：PNG 由插件自己转成 JPEG（透明部分填白，长边不超过 1280），其他格式请 DSH 的附件服务生成较小的版本；仍然缩不下时命令直接报错。
- **保存**：文件写入会话工作目录下的保存位置，文件名形如 `20261022-133000-grok-imagine-image-一只橘猫在雨夜的霓虹街头.png`（取提示词前 24 个字符）；同名文件不会被覆盖，而是加序号。会话的工作目录必须是本机文件夹。
- **提交后**：命令检查完选项、模型、保存目录和参考图就立即返回，输入框随即清空；生成在后台继续，期间工作区的会话列表把这个会话显示为「进行中」，在其他会话时完成会显示「已完成」提示。DSH 本身只把智能体的对话轮次算作运行中，所以插件在生成期间自己发送 DSH 的会话状态事件（`api-session/status`），每 5 秒重发一次。生成期间输入框会出现「停止」按钮，但它停不下生成（上游也不支持取消）；这时照常发消息即可，智能体会正常回复。插件重新加载或 DSH 关闭会中断进行中的生成。
- **结果**：对话里 `/cpa-image` 这一行显示成一问一答：右侧气泡是你的提示词（下方标出比例、张数、参考图数量），左侧是回复：模型和账号、状态，生成中显示按比例排好的占位框和计时，完成后显示图片（单张按原比例显示，多张为方形缩略图），点击放大；底部写着耗时和保存目录（工作目录内的相对路径，或文件夹名），展开「详情」可以看到保存目录的完整路径和文件名（点击即用系统打开），上游改写过提示词时也会显示；失败时以红字显示原因。之前的生成记录同样会显示，前提是文件还在、记录还没被挤出（每个会话保留最近 48 次生成和 48 个文件）。图片只在页面上显示，不会发送给对话模型。
- **图片操作**：在图片上点右键，菜单列出本机能打开这张图片的应用（默认应用排在最前，带「默认」标记，和右侧文档预览的「打开」菜单一致），然后是「在文件资源管理器中显示」（macOS 为「在访达中显示」，Linux 为「在文件管理器中显示」），最后是「复制图片」「复制文件路径」。放大图片后下方按钮提供「用默认应用打开」、在文件管理器中显示和两个复制操作。打开和显示位置通过 DSH 自己的会话接口完成（与文档预览相同，由 DSH 再次校验路径），DSH 不支持打开本机路径时这些项不显示；复制图片总是以 PNG 写入剪贴板（其他格式会先转成 PNG）。
- **请求细节**：向该模型所属账号的 CPA 发送一次 `POST /v1/images/generations`（或 `/edits`），只用这个账号的地址和 Key，不跨账号重试；要求返回 `b64_json`。如果 CPA 只返回图片链接，插件会下载它：只接受 `data:` 或 HTTPS 链接，单张最多 32 MiB，下载请求不带 Key。最多等待 3 分钟。失败时显示 CPA 的错误摘要（截断，并去掉其中的链接）。生图会消耗该账号上游的额度。

#### 生成视频（`/cpa-video`）

```text
/cpa-video 海浪在日落时拍打沙滩
/cpa-video -s 8 -r 480p --aspect 9:16 一只猫在冲浪
```

- **选项**（写在提示词前面）：`-m <模型>` 临时指定模型（规则同 `/cpa-image`）；`-s <1-15>` 时长（秒）；`-r <480p|720p>` 分辨率；`--aspect <比例>` 可选 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`，不写时由 xAI 决定（通常为 16:9，有首帧图时按首帧图的比例）。这些参数也可以直接写在提示词开头或结尾，作为独立的词：`10秒` / `10 秒` / `10s`、`480p` / `720p`、`16:9`、`竖屏`、`横屏`、`方形`，例如 `/cpa-video 10秒 480p 这个角色跳社会摇`；只有紧跟空格、逗号或结尾时才算参数，所以「3 秒后爆炸」仍是提示词，写在句子中间的也不会被识别。`-s` 等选项写了时以选项为准。都没写时用「生成」标签里的视频默认值。`--` 之后的内容一律当作提示词。
- **附带图片的用法**（只接受图片，过大的按上面「改图」里的方式缩小；实测 CPA 的视频生成接口只读约 1 MiB 的请求体，所以所有附带图片合计约 750 KB，超出的先缩小）：
  - 1 张：默认作为**首帧**（图生视频）；加 `--ref`（或写「参考图」）作为**参考图**；加 `--last`（或写「尾帧」）作为**尾帧**，视频最后停在这张图上。
  - 2 张：默认作为**参考图**；加 `--first-last`（或写「首尾帧」）则第 1 张是首帧、第 2 张是尾帧，模型补出中间过程。
  - 3 张及以上：**参考图**，`grok-imagine-video-1.5` 最多 14 张，其他视频模型最多 7 张。参考图用来带入人物、服装、物品等，不锁定第一帧；提示词里可以用 `<IMAGE_0>`、`<IMAGE_1>`… 按顺序指代。
  - 首帧 / 尾帧固定只支持 `grok-imagine-video-1.5`。字段按 xAI 文档发送：`image`、`last_frame`、`reference_images`。
- **无法取消**：视频一旦提交就无法撤回（CPA 和 xAI 都没有取消接口），会照常计费；生成期间输入框的「停止」按钮停不下它。
- **请求细节**：向该模型所属账号的 CPA 发送一次 `POST /v1/videos/generations`（xAI 原生格式：`model`、`prompt`、`duration`、`resolution`，以及可选的 `aspect_ratio`、`image.url`；`sora-2*` 按 CPA 的规则改写为 `grok-imagine-video`），然后查询 `GET /v1/videos/{请求 id}`：开始 1 分钟内每 5 秒、3 分钟内每 10 秒、之后每 15 秒一次。完成后通过 CPA 的 `GET /openai/v1/videos/{请求 id}/content` 下载（CPA 用该凭据自己的代理去取文件，插件不直接访问上游地址），边下载边写入保存位置，最大 200 MiB，只接受 MP4 / MOV / WebM，同名不覆盖。
- **后台与恢复**：提交成功后，任务记录在 `media-jobs.json` 里。重载插件或重启 DSH 只会暂停等待：下次启动时继续查询并保存；但 CPA 只在 3 小时内记得这个视频由哪个凭据生成，超过 3 小时仍未完成的任务标记为「已过期」，不再查询。还没拿到请求 id 就被重载打断的，记为「已中断」（可能已经提交，无法确认）。期间会话同样显示为「进行中」。
- **结果**：对话里 `/cpa-video` 这一行同样显示成一问一答：右侧是提示词和时长、分辨率、比例、首帧图标签；左侧显示排队 / 生成进度（CPA 返回进度时显示百分比）/ 保存中和计时，完成后直接显示可播放的视频（支持拖动进度），下方按钮和右键菜单可以用其他应用打开、在文件资源管理器中显示、复制文件路径。
- `/cpa-video-status` 列出本会话最近 20 个视频任务的状态和请求 id。

#### 编辑 / 延长视频（`/cpa-video-edit`、`/cpa-video-extend`）

```text
/cpa-video-edit 把衣服换成红色，其他保持不变
/cpa-video-extend 4秒 她转身走出画面
/cpa-video-extend --from cmd-xxxx-3 -s 6 镜头慢慢拉远
/cpa-video-edit --video "D:\素材\街景.mp4" 换成雨夜
/cpa-video-extend --url https://example.com/clip.mp4 -s 4 镜头拉远
```

- 视频完成后，下方会出现「编辑视频…」「延长视频…」按钮，点开写一句话即可提交，结果出现在对话下方新的一行。也可以直接输入命令。
- **原视频**（任选其一）：在输入框**附带一个 MP4 文件**；`--video <路径>`（相对路径按会话工作目录，含空格时加引号）；`--url <公开链接>`（http/https，由 xAI 自己下载，大小不受限制）；`--from <命令 id>`（本会话插件生成的视频）；都不写时用本会话最新生成的视频。`-m <模型>` 可指定用哪个账号的视频模型（默认用本会话选中的视频模型；插件生成的视频默认用生成它的账号）。
- **原理**：xAI 的编辑（`/v1/videos/edits`）和延长（`/v1/videos/extensions`）接受任意 MP4，可以是公开链接，也可以是 base64 数据。CPA 没有 xAI 的文件上传接口，所以本地视频以 base64 放在请求里发送（实测编辑接口能读 20 MiB 的请求体，因此本地视频最大 14 MiB；更大的请压缩、裁短，或改用 `--url`）。插件自己生成的视频在约 1 小时内直接把 xAI 结果自带的短期链接交给 xAI（链接只保存在内存里，不写入文件、日志，也不发给页面），之后或插件重载后改为发送已保存的文件，所以按钮在文件还在时一直可用。发送前插件读取 MP4 里记录的时长，不符合下面的限制时直接提示，不会发出请求。
- **限制**（xAI 文档）：都使用 `grok-imagine-video`；编辑要求原视频不超过 8.7 秒，输出保持原时长、比例和分辨率（最高 720p）；延长要求原视频 2–15 秒，`-s` 指定新增的 2–10 秒（默认 6 秒，也可以写「4秒」），输出是原视频加新增部分。
- **服务器不支持时**：有的 CPA 服务器的上游没有延长接口（测试中遇到过返回 HTTP 405 的服务器）。这时这次任务显示「上游不提供视频延长（HTTP 405）」，同一账号之后的延长会直接提示、不再发请求，「延长视频…」按钮也会隐藏，直到插件重载。CPA 收到 405 后会让该凭据的这个模型暂停约 1 分钟。
- 编辑和延长同样提交后无法取消、照常计费，后台等待、重载后继续、按钮操作都与 `/cpa-video` 相同。

#### 输入框旁的生成模型按钮

有可用的生图或生视频模型时，输入框里模型选择器左侧会出现一个生成模型按钮，分别显示当前用于生图（图片图标）和生视频（摄像机图标）的模型。

- 点开后分「生图模型」「生视频模型」两组、按账号列出所有启用的模型，点一下就切换。**选择按会话保存**，同时记为「上一次选择」：还没单独选过的会话（包括新建会话）沿用上一次的选择。
- `/cpa-image` / `/cpa-video` 选模型的顺序：`-m` 指定的模型 → 本会话的选择 → 上一次的选择 → 只有一个可用模型时用它；有多个模型却都没选过时，命令会报错并提示先选择。
- 按钮在加载、切换会话和每次打开弹层时读取数据，不在后台轮询；读取时如果还没有任何可用的生成模型、而某个启用的账号还没读到模型目录（例如 DSH 刚启动），插件会先同步一次；仍然没有时按 3 秒、10 秒、之后每 30 秒重试，读到后停止。
- `/cpa-image` 找不到生图模型、而某个启用的账号还没读到模型目录时，会先同步一次再判断；仍然没有时，错误信息会列出每个账号的状态和模型数量。

## 插件自身更新

**插件更新** 位于左侧栏 **插件** → **CLIProxyAPI** 的插件页，以及 **设置** → **内置插件** → **CLIProxyAPI** 标签页；这两处只有更新功能，账号与模型设置在 **设置** 左侧导航的 **CLIProxyAPI** 页。更新卡片在插件页默认展开，摘要行显示当前版本和更新状态，可随时收起；后台检查仍按保存的开关运行，展开状态不会被轮询重置。它只管理 `dsh-cliproxyapi-pro` 自身，不会更新 CPA 服务或 DSH 宿主，也不改变 CPA 请求的路由、账号或模型勾选。更新设置修改后立即保存；卡片独立轮询状态，不会重载未保存的账号表单。

> **安装交给插件市场。** 本插件自身从不运行包管理器、卸载插件、覆盖源码或重启 DSH。装有 [DSH 插件市场（dshmarket）](https://github.com/dsh-market/dsh-market) 时，卡片通过它公开的 Update API v1 一键或自动安装新版本；没有插件市场时，只能下载并校验离线包，在关闭 DSH 后手动升级。

### 通道、区域与自动开关

| 设置 | 默认值 | 行为 |
|---|---|---|
| 更新通道 | 稳定（`stable`） | 稳定 / Beta / 开发分别读取 npm 的 `latest` / `beta` / `dev` dist-tag。Beta / 开发通道尚未发布时明确报错，不悄悄回退稳定版。 |
| 下载区域 | 自动（`auto`） | 自动模式同时请求全球 npmjs 与中国大陆 npmmirror，选择最先返回**有效版本元数据**的源；全球（`global`）只使用 `https://registry.npmjs.org`，中国大陆（`cn`）使用 `https://registry.npmmirror.com` 及其官方 `cdn.npmmirror.com` 包下载域名。离线包从本次检查选中的源下载，至多跟随 3 次经过白名单与精确包名／版本路径校验的 HTTPS 跳转，不跨区域回退。 |
| 自动检查更新 | 开启 | 插件启动或更新设置重新调度后约 3 秒检查，之后每 6 小时检查所选通道；关闭后仍可手动点 **检查更新**。 |
| 自动下载更新 | 关闭 | 仅在**自动检查**发现新版本时，自动下载并校验离线包；下载本身不安装、不重启。仅开启此项而关闭自动检查，不会触发后台下载。 |
| 自动安装更新 | 关闭 | 需要开启自动检查并装有 dshmarket（未检测到插件市场时无法开启）。**自动检查**发现新版本后，由打开着的 DSH 页面调用插件市场安装；同一版本 6 小时内最多尝试一次，安装成功的版本不再重试。插件市场的发布冷却期等限制照常生效，自动模式从不强制安装。生效可能需要重启 DSH 或刷新页面。 |

- 检查使用严格 SemVer 比较：只有所选通道版本高于当前运行版本时才提供下载，不自动降级。自动区域选择也不会跨通道回退。
- 区域只影响本插件的更新元数据与安装包下载，**不影响 CPA 的连接、模型请求或其他插件的安装源**。
- 切换通道或区域后，请重新检查更新。打开卡片、轮询或重新读取状态本身只读取内存状态，不主动访问更新源；后台自动检查由上述开关控制。
- 失败时卡片显示本地化提示，例如通道未发布、网络异常、包完整性校验失败或磁盘写入失败，不显示后端堆栈。

### 通过插件市场一键更新 / 自动更新

1. 卡片打开时只读取插件市场本地的 `GET /dsh-market/api/v1/capabilities`，不访问任何更新源；检测到后显示 **立即更新**。
2. 检查到新版本后点 **立即更新** 并确认版本号；卡片向插件市场提交 `POST /dsh-market/api/v1/updates { "packageName": "dsh-cliproxyapi-pro" }`，再轮询该任务的进度与结果。版本解析、下载、安装、版本核对与恢复都由插件市场完成。
3. 完成后卡片显示实际装上的版本，并按插件市场的结果提示 **重启 DSH**（仅插件市场声明可以重启时显示按钮；桌面版需完全退出后重新打开）或 **刷新页面**。若插件市场按其自身通道装上的版本低于本卡片检查到的版本，会明确提示。
4. 遇到发布冷却期（`RELEASE_TOO_FRESH`）或镜像未同步（`VERSION_UNCHANGED`）时可手动选择 **仍然安装**；其他失败只显示本地化原因，不显示后端信息。
5. 本地链接安装（`link:`）不提供插件市场安装，以免替换源码链接。

### 下载、校验与离线升级

没有插件市场或需要离线升级时使用：

1. 点击 **检查更新**；有更高版本时，点 **下载更新** 并确认版本号，或等待已启用的自动检查 / 自动下载。
2. 下载先通过 npm 元数据中的 **SHA-512** 完整性校验，再验证 gzip / tar、包名和版本，并要求包内每个文件都在该包自己的 `package.json` `files` 中声明（`package.json`、README、LICENSE 等 npm 总会打包的文件除外）；拒绝路径穿越、隐藏文件、`node_modules`、链接等特殊条目、依赖和安装生命周期脚本。下载被拒绝时，具体原因会写入 DSH 日志。只保存离线包，不解压到安装目录，也不执行包内代码。
3. 校验成功后，卡片显示安装包的绝对路径与适用的升级命令。包保存在 `<Profile 目录>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`。
4. **先保存工作并完全关闭 DSH**，再在终端执行卡片提供的命令。示意如下，以卡片里的实际 profile 名称和绝对路径为准：

   ```bash
   dsh plugin --profile 'desktop' add '/absolute/path/dsh-cliproxyapi-pro-<version>.tgz'
   ```

5. 重新启动 DSH 后新版本生效。检查结果和已下载提示不跨插件重载持久化；离线包仍保留在磁盘，可按需要自行清理，插件不会自动删除历史下载。

**本地链接安装（`link:`）** 可以检查并下载包，但不会提供升级命令，也不会覆盖链接的源码目录。若要保留源码开发方式，请在合适时机手动更新 Git 源码，再重启 DSH；通过离线包重新安装会将插件的安装来源从链接切换到离线包。

## 斜杠命令与 HTTP 接口

本插件不注册任何 Agent 工具，不占用模型上下文。账号与模型在 **设置** → **CLIProxyAPI** 页管理，也可以用下面的斜杠命令查看和刷新。

### 斜杠命令

- `/cpa-status`：显示所有账号的状态（含识别出的生图 / 生视频模型数量）。
- `/cpa-refresh`：立即刷新所有账号（也会探测停用账号的模型列表）。
- `/cpa-image [-m 模型] [--aspect 比例] [-n 1-4] 提示词`：生成图片；附带图片时改图。见 [生成图片](#生成图片cpa-image)。
- `/cpa-video [-m 模型] [--aspect 比例] [-s 1-15] [-r 480p|720p] 提示词`：生成视频；可附带一张首帧图。提交后无法取消。见 [生成视频](#生成视频cpa-video)。
- `/cpa-video-status`：列出本会话的视频任务。
- `/cpa-video-edit [--video 路径 | --url 链接 | --from 命令id] [-m 模型] 修改说明`、`/cpa-video-extend [同上] [-s 2-10] 接下来的内容`：编辑 / 延长任意 MP4（可附带视频文件）。见 [编辑 / 延长视频](#编辑--延长视频cpa-video-editcpa-video-extend)。

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
| GET | `/api/dsh-cliproxyapi/quota/status` | — | `{ ok, quota }`：缓存的额度快照；过期账号在后台刷新 |
| POST | `/api/dsh-cliproxyapi/quota/refresh` | `{ accountId? }` | 开始刷新一个或全部账号的额度并立即返回（快照中 `refreshing` 为真） |
| POST | `/api/dsh-cliproxyapi/quota/save` | `{ accountId, managementKey?, clear? }` | 保存或清除该账号的管理密钥，并开始刷新额度；响应不含密钥 |
| GET | `/api/dsh-cliproxyapi/media/status` | — | `{ ok, media }`：生成设置与每个账号识别出的生图 / 生视频模型；不联网 |
| POST | `/api/dsh-cliproxyapi/media/save` | `{ account: { accountId, disabledModels?, kindOverrides? } }` | 保存某账号关闭的生成模型（整表替换）或类型覆盖（按模型合并，`null` 表示恢复自动识别）；类型变化时重新同步该账号并在响应中附带 `status`。无效值返回 400 和错误码，如 `invalid-account`、`invalid-kind` |
| POST | `/api/dsh-cliproxyapi/media/diagnose` | `{ accountId }` | 只读诊断（见上文），返回 `{ ok, diagnostic }`，不含 Key |
| GET | `/api/dsh-cliproxyapi/media/session?sessionId=` | — | `{ ok, session }`：可选的生图 / 生视频模型、当前选择及其来源（`session` / `last` / `only`）、本会话最近生成的文件（只有文件名和 id，不含路径）；不联网 |
| POST | `/api/dsh-cliproxyapi/media/session/save` | `{ sessionId?, kind: "image" \| "video", ref }` | 为会话选择模型（`ref` 为 `账号id/模型id`，`null` 清除本会话的选择），并记为上一次选择；不在可选列表里的模型返回 400 `invalid-model` |
| GET | `/api/dsh-cliproxyapi/media/file?sessionId=&id=` | — | 返回插件为该会话记录过的生成文件；其他文件或其他会话一律 404。视频以流的形式返回，支持单个 `Range` 区间（206），便于播放器拖动 |
| GET | `/api/dsh-cliproxyapi/media/command?sessionId=&commandId=` | — | `{ ok, run, files }`：该会话中某次命令的生成记录（状态 `running` / `done` / `error`、模型、提示词、比例、张数、参考图数量、起止时间、保存目录的显示名、错误代码和摘要）和生成的文件（id、文件名和完整路径，以及保存目录 `folderPath`、Host 的文件管理器类型 `desktop`：`explorer` / `finder` / `filemanager`），供对话里的命令行显示和打开文件；视频记录另有时长、分辨率、请求 id、方式 `mode`（`text` / `first-frame` / `reference` / `first-last` / `last-frame` / `edit` / `extend`）和来源命令 id；还能编辑 / 延长时附带 `actions: { edit, extend, expiresAt }`（不含链接）；进行中时附带阶段 `phase`（`submitting` / `queued` / `running` / `downloading`）和 CPA 返回的进度 `progress`；记录为进行中、但当前没有对应后台任务的（插件重载或崩溃）报告为 `interrupted` |

更新接口的操作响应采用 `{ ok, update }`，状态包含 `currentVersion`、`latestVersion`、`available`、`channel`、`region`、`effectiveRegion`、`autoCheck`、`autoDownload`、`autoInstall`、`checking`、`downloading`、`lastCheckedAt`、`error` / `errorCode`、`blockedReason`、`downloadedVersion`、`downloadPath` 与 `upgradeCommand`。未检查或未下载的相关字段为 `null`。`channel` 为 `stable` / `beta` / `dev`，`region` 为 `auto` / `global` / `cn`；`effectiveRegion` 为本次成功检查使用的 `global` / `cn`（此前为 `null`）。

失败用顶层 `errorCode` 或 `update.errorCode` 表达，不能只凭 HTTP 状态或 `ok` 判断操作成功；常见值包括 `network-error`、`invalid-metadata`、`channel-unavailable`、`integrity-error`、`invalid-package`、`storage-error`、`busy`、`stale-version`、`service-unavailable`、`forbidden-origin` 与 `disposed`。更新 POST 仍然依赖宿主的会话鉴权与可信主机策略：请求带 `Origin` 时必须属于当前监听的同一 authority（按 `Origin` 自身协议比较主机与端口，与宿主规则一致），否则返回 `forbidden-origin`；桌面端桥接请求可能不带 `Origin`，此时只要通过宿主会话鉴权即可执行，未认证请求仍会在到达路由前被拒绝。普通未认证 `curl` 不能调用这些接口。

## 存储与配置

- **状态文件**：`<Profile 目录>/.dsh-cliproxyapi/state.json`，保存账号、勾选和参数覆盖（不含密钥）。

  ```json
  {
    "version": 2,
    "refreshIntervalSeconds": 300,
    "probeTimeoutMs": 5000,
    "accounts": [
      {
        "id": "default", "enabled": true, "provider": "cli-proxy", "displayName": "CLI Proxy API",
        "baseURL": "https://cpa.example.com", "apiKeyEnv": "CLI_PROXY_API_KEY",
        "protocol": "openai-completions", "protocolMode": "auto",
        "includePrefix": "", "excludePrefix": "", "selectedModels": ["gpt-6.1-sol"], "modelOverrides": {}
      }
    ]
  }
  ```

  文件每次读取都会重新加载，手动修改后在账号「⋯」菜单里点「立即探测刷新」即可生效。旧版（1.3.x 及以前）的单账号文件会自动迁移为 id 为 `default` 的账号，路由、密钥和勾选保持不变，原文件备份为 `state.v1.json`。

- **更新设置**：独立保存在 `<Profile 目录>/.dsh-cliproxyapi/update-settings.json`，不扩展或改写账号的 `state.json` v2，也不接触凭证。首次没有此文件时采用下列默认值：

  ```json
  {
    "version": 1,
    "autoCheck": true,
    "autoDownload": false,
    "autoInstall": false,
    "channel": "stable",
    "region": "auto"
  }
  ```

  设置通过面板保存后立即应用。手动编辑此文件后需重载插件或重启 DSH 才会重新读取；文件损坏、结构 / 字段无效或无法读取时采用关闭自动联网检查的安全默认值。版本检查结果、候选版本、下载完成提示与命令只在内存中，插件重载后重新检查；下载包仍位于独立的 `updates` 子目录，由用户按需清理。
- **生成设置**：独立保存在 `<Profile 目录>/.dsh-cliproxyapi/media-settings.json`，不改动 `state.json`。没有此文件时使用默认值；文件损坏时也使用默认值并在日志中提示，下次保存前会把损坏的文件另存为 `media-settings.corrupt-<时间>.json`。目前生效的是 `outputDir`（保存位置）、`lastSelection`（上一次选择的模型）以及每个账号的 `disabledModels`（关闭的生成模型）和 `kindOverrides`（手动指定的类型）；其余字段为后续生成功能预留，现在没有效果：

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
    "lastSelection": {},
    "accounts": {
      "default": { "disabledModels": [], "kindOverrides": { "my-painter": "image" } }
    }
  }
  ```

- **会话生成记录**：`<Profile 目录>/.dsh-cliproxyapi/media-sessions.json` 保存每个会话选择的生成模型、最近 48 次生成的记录（状态、模型、提示词、选项、起止时间、保存目录显示名、错误摘要），以及最近生成的最多 48 个文件路径和生成它们的命令 id（供对话里的命令行显示图片），只保留最近更新的 500 个会话。删除它只会清空这些选择和记录，不会删除已生成的文件。文件损坏时按空记录处理，下次写入前另存为 `media-sessions.corrupt-<时间>.json`。
- **视频任务**：`<Profile 目录>/.dsh-cliproxyapi/media-jobs.json` 保存已提交的视频任务（CPA 请求 id、账号、模型、会话和命令 id、工作目录与保存位置、提示词、时长、提交时间、状态），用于重载或重启后继续等待；最多 200 个，已结束的保留 7 天。不含 Key 和视频地址。文件损坏时按空处理，下次写入前另存为 `media-jobs.corrupt-<时间>.json`。
- **密钥**：通过 DSH 的 `credentials` 服务按引用名存取；凭证服务里没有时，回退读取同名环境变量。
- **环境变量**：`CLIPROXYAPI_BASE_URL` 只用于服务地址留空的账号的自动发现。
- **插件行配置**：`cordis.patch.yml` 中本插件行的 `config` 会在启动时叠加到状态文件上：包含 `accounts` 时替换账号列表，否则其中的字段作用于第一个账号。一般保持 `{}`，用设置面板配置即可。

## 升级与卸载

- **升级**：装有 dshmarket 时，直接在插件更新卡片点 **立即更新**（或开启自动安装），完成后按提示重启 DSH 或刷新页面。没有插件市场时，使用卡片下载校验后的离线包，保存工作并关闭 DSH，再执行卡片的 `dsh plugin --profile '名称' add '离线包绝对路径'` 命令，最后重新启动；无需先卸载。也可在关闭 DSH 后运行 `dsh plugin --profile <profile 名称> add dsh-cliproxyapi-pro@latest` 从 npm 升级。账号、勾选和参数仍保存在原 profile 目录里，密钥仍在凭证服务里；更新下载功能不会改写这些数据。本地链接安装要保留源码方式时应自行更新源码，而不是从离线包重装。
- **卸载**：在 **插件** 页卸载。已同步的模型路由保存在 DSH 设置里，卸载插件不会自动删除它们；想让这些模型一并从选择器消失，请在卸载前把各账号停用或删除。

## 常见问题

**模型选择器里看不到模型？**
确认账号标题旁的「启用」已打开，并且至少勾选了一个模型（或勾选为空，表示全部）。可以运行 `/cpa-status` 查看每个账号的状态。

**提示「none of the selected models matched」？**
已勾选的模型在这台服务器上都不存在（常见于换了服务器）。面板里仍会列出该服务器的模型，重新勾选，或点「恢复推荐精选」后保存。

**连接失败 / no usable CPA service found？**
检查服务地址是否能从运行 DSH 的机器访问、API Key 是否正确。填写了地址的账号不会改连其他地址，报错里会列出尝试过的地址和原因。

**刚发布的新版本装不上？**
DSH 使用的 pnpm 可能设置了新版本发布后的等待期（`minimumReleaseAge`），安装界面会说明实际装到的版本。稍后再装，或明确写出版本号。

**怎样自动安装更新？**
安装并启用 [DSH 插件市场（dshmarket）](https://github.com/dsh-market/dsh-market)，在插件更新卡片打开 **自动检查更新** 和 **自动安装更新**。安装由插件市场完成（它负责包管理器、版本核对与恢复），本插件自身不会运行包管理器、覆盖文件或重启。没有插件市场时只能准备离线包，在关闭 DSH 后升级。

**点「检查更新」就报错（尤其是桌面版）？**
1.5.1 及以前的版本要求更新 POST 必须带 `Origin`，而 DSH 桌面版转发页面请求时会去掉这个请求头，所以检查、保存更新设置和下载都会被拒绝。1.6.0 起已与宿主规则一致：缺少 `Origin` 时依靠宿主会话鉴权，带 `Origin` 时仍须同源。旧版本请通过插件市场、插件管理器或离线方式升级到新版本。

**Beta / 开发通道提示暂无版本？**
只有维护者发布对应 npm dist-tag 后才可使用；插件不会把稳定版伪装成 Beta / 开发版。若通道版本不高于当前版本，也不会提供降级下载。

**更新卡片显示「更新服务未就绪」或「网络异常」？**
收起状态会直接给出原因：**更新服务未就绪** 表示页面已是新版，但运行中的插件宿主代码仍是旧版——安装或升级后必须**重启 DSH**（只刷新页面或重载插件不够）；**网络异常** 表示本机到 npm 官方源或国内镜像的请求失败，可切换下载区域、检查代理/防火墙后重试；**通道未发布** 则表示该通道还没有对应版本。展开卡片可看到对应说明。

**已经下载，重启后为什么版本没变？**
下载和校验并不安装。应先退出 DSH、执行卡片提供的升级命令，再启动；本地链接安装不提供该命令，保留链接方式需手动更新源码。若重载插件后下载提示消失，离线包仍在 profile 的 `updates` 目录里。

## 给 AI Agent 的安装指南

> 给 DeepSeek Harness 中的 AI Agent：用户要求安装或配置本插件时按以下步骤执行。本包没有 npm 依赖，也没有构建脚本。

1. **安装**：调用 `plugin_manager`：`{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`。查看结果中的 `application` 与 `warnings`；`restart-required` 表示需要重启 DSH 后新代码才会运行。
2. **配置**：本插件不提供 Agent 工具，账号由用户在界面里配置。CPA 在本机 `http://127.0.0.1:8317` 且无鉴权时无需配置，插件启动后会自动发现；否则请用户打开 **设置** 左侧导航的 **CLIProxyAPI** 页，点 **+ 添加账号** 并填写服务地址和 API Key，再在 **模型** 标签勾选需要的模型。
3. **验证**：请用户运行 `/cpa-status`，每个启用的账号应为 `connected` 且模型数大于 0。告诉用户模型已出现在 DSH 模型选择器中（按账号名称分组）。

不要向用户索要 API Key，也不要把它写入任何文件；密钥只在设置页填写。

## 开发

```text
lib/index.js        Host 插件（发现、同步、多账号控制器、工具、命令、HTTP 接口）
lib/client.js       Web 界面（ModuleLoader 格式：设置左侧的账号页、插件页的更新卡片，无需构建）
lib/updater.js      更新设置、SemVer/通道、区域竞速、SHA-512/包结构检查与离线包存储
locale/*.json       插件管理器中显示的标题与描述
cordis.patch.yml    Bundle patch，插入 dsh-cliproxyapi-pro 行
tests/              node:test 单元与集成测试
.github/workflows/  CI（测试）与发版（GitHub Release + npm 受信任发布）
assets/screenshots/ README 截图（同时登记在 screenshots.json 中供插件市场展示）
AGENTS.md           给编码 Agent 的开发约定、架构与不变量
```

```bash
git clone https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git
cd dsh-cliproxyapi-pro
npm test             # 运行测试
npm run check        # 语法检查 + 测试
npm run pack:check   # 查看打包文件列表
```

`npm run check` 会语法检查三个 `lib/*.js` 模块并运行全部测试。更新相关离线测试为 `tests/updater.test.mjs`（设置、SemVer、区域、下载完整性与包结构）、`tests/update-routes.test.mjs`（HTTP 鉴权与同源）和 `tests/client.test.mjs`（更新卡片与请求生命周期）；它们不访问真实网络或真实 profile。`npm run pack:check` 的文件列表应包含 `lib/updater.js`，且仍不包含测试或截图，无需安装任何运行时依赖。

发版只需推送 `v<版本号>` 标签：GitHub Actions 会运行测试、创建 GitHub Release 并附上安装包，再通过 npm 受信任发布（不使用任何 token）上传到 npm，并附带来源证明。稳定版本发布到 npm `latest`；Beta / 开发预发布分别进入 `beta` / `dev`，对应 GitHub Release 标记为预发布，不覆盖稳定通道。更新器只核对 registry 提供的 SHA-512 完整性与包结构，不验证发行者签名或 npm provenance。

修改代码前请阅读 [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md)；变更记录见 [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)（英文版：[CHANGELOG.en.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.en.md)）。欢迎提交 Issue 和 Pull Request，修改说明文档时请同时更新中英文两份。

## 许可证

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
