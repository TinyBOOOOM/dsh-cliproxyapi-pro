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
- **可视化管理**：设置面板里勾选模型、编辑单个模型的参数；也可以让 DSH 的 Agent 通过 `cliproxyapi` 工具帮你配置。
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
- [Agent 工具与斜杠命令](#agent-工具与斜杠命令)
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

   需要固定版本时可以写成 `dsh-cliproxyapi-pro@1.6.0`。
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
| 某个发布版本 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.6.0` |
| 最新开发版 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| 离线安装包 | 下载 [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz)（始终是最新版），填写它的本地绝对路径 |
| 本地源码（开发用） | 克隆后的仓库目录绝对路径；以链接方式安装，改代码后重载插件即生效 |

所有版本见 [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases)。

## 快速上手

1. **打开设置面板**：**设置** → 左侧导航的 **CLIProxyAPI** 页（账号、模型与协议都在这里）。插件自身的更新在左侧栏 **插件** → **CLIProxyAPI**，或 **设置** → **内置插件** → **CLIProxyAPI** 标签页，这两处只有更新功能。
2. **填写连接信息**：在「连接与认证配置」里填 **CLIProxyAPI 服务地址**（如 `http://127.0.0.1:8317`，不用加 `/v1`）和 **API Key**（本地免密的 CPA 可留空），点 **保存设置并应用**。
3. **选择模型**：连接成功后，「模型显示筛选」会列出 CPA 上的全部模型，并已为每个家族勾好最新的一个。按需增减后点 **保存模型勾选**。
4. **开始使用**：回到对话框，打开模型选择器，就能在以账号名称命名的分组里看到这些模型。

CPA 就在本机默认端口 `8317` 且没有设置密钥时，什么都不用填，插件会自动发现它。

## 截图

以下均为 1.6.0 在 DSH 桌面版中的实际截图。

**1. 设置左侧的 CLIProxyAPI 页与账号栏。** 账号与模型设置位于 **设置** 左侧导航的 **CLIProxyAPI** 页。顶部账号栏列出所有账号：绿点表示已连接，灰点加「未启用」标记表示已停用。图中刚用「+ 添加账号」新增了第二个账号「CLI Proxy API 2」：它默认停用，拥有独立的路由 `cli-proxy-2`；由于还没填写服务地址，探测提示本地没有找到 CPA 服务。

![设置左侧的 CLIProxyAPI 页：一个已连接账号和一个刚添加、未启用的账号](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/accounts.png)

**2. 模型显示筛选。** 从 CPA 服务发现的全部 168 个模型，支持全部发现 / 已勾选 / 未勾选切换、家族标签（GPT、CLAUDE、GEMINI、GROK……）、搜索与批量操作。只有勾选的模型会同步到 DSH 模型选择器；每个模型显示将使用的协议（图中为 OpenAI Responses）、图片输入、推理档位与上下文长度，「编辑参数」可打开单模型参数覆盖。

![模型筛选：家族标签、已勾选模型、协议与能力标记](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/model-filter.png)

**3. 连接与认证配置。** 每个账号独立的设置：「启用此账号」开关、服务地址、保存在该账号独立引用名（`CLI_PROXY_API_KEY_2`）下的 API Key、接口协议、账号名称、可折叠的高级设置，以及「保存设置并应用」与「删除此账号」。

![未启用账号的连接设置，使用独立的密钥引用名](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/connection.png)

**4. 内置插件里的插件更新页。** **设置** → **内置插件** → **CLIProxyAPI** 标签页只有插件更新：检查更新与离线下载、检测到 DSH 插件市场后的「立即更新」、更新通道、下载区域，以及自动检查 / 自动下载 / 自动安装开关。图中已是稳定通道最新版本，所以「立即更新」不可用。

![内置插件中的 CLIProxyAPI 更新页：版本状态、插件市场更新、通道、区域与自动开关](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/updates.png)

## 功能详解

### 自动发现与同步

- 服务地址可以是本地或远程，`/v1`、`/v1/chat/completions`、`/v1/messages` 等后缀会自动去掉。
- 地址留空时，依次尝试：已有路由的地址、环境变量 `CLIPROXYAPI_BASE_URL`、本机 `127.0.0.1:8317`。
- 读取 `/v1/models?client_version=pi` 的富元数据目录（也兼容标准 OpenAI `data[]` 格式），并用 `/v1/models` 的 `owned_by` 判断模型家族。
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
- **新增**账号默认停用。可先填好地址和密钥，点「立即探测刷新」预览模型并勾选，再打开「启用此账号」保存。
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

**设置** → **CLIProxyAPI** 页顶部有两个标签：**设置**（上面介绍的账号与模型）和 **额度**。

- **填写管理密钥**：在「额度」页为每个账号填写 CPA 的管理密钥（CPA 配置里的 `remote-management.secret-key`；远程 CPA 还需开启 `remote-management.allow-remote`）。密钥保存在 DSH 凭证服务中，引用名第一个账号为 `CLI_PROXY_MANAGEMENT_KEY`，其他账号为 `CLI_PROXY_MANAGEMENT_KEY_<账号 ID>`（如 `CLI_PROXY_MANAGEMENT_KEY_ACCOUNT_2`）；不会写入 `state.json`、设置或日志，也不会返回给页面。
- **由宿主读取**：宿主用管理接口读取该 CPA 的全部凭证（`/v0/management/auth-files`）、每个凭证服务的模型列表，并经 `/v0/management/api-call` 查询上游额度（Codex、Claude、Antigravity、Gemini CLI、Kimi、xAI 等）。没有可查询额度接口的渠道（如 Devin）只显示账号状态与近期请求数。
- **额度页**：采用 DSH 原生设置页的行式布局：管理密钥、额度数据与刷新、凭证分布条（充足 / 偏低 / 耗尽 / 停用异常），按渠道分组的凭证列表（套餐、前缀、状态、5 小时 / 每周 / 每月 / 每日额度条与重置时间，问题与剩余最少的排在前面）、渠道筛选（凭证较多时可搜索），以及可展开的「模型 → 渠道」表，列出模型选择器中每个模型实际匹配到的凭证。
- **对话框徽标**：模型选择器左侧的小徽标（信号格 + 百分比）显示当前所选模型可用凭证中最充足的剩余额度，点击可查看每个凭证的额度。只对本插件同步、且所属账号已填写管理密钥的模型显示；没有管理密钥时不显示徽标。
- **精确匹配**：只在所选模型所属的账号（按路由 `cli-proxy*`、`cli-proxy-2*`…）里找凭证；带前缀的模型（如 `devin/claude-opus-5-5`）只匹配该前缀的凭证；不带前缀的同名模型（如 `claude-opus-5-5`）优先匹配不带前缀的凭证，Claude 渠道与 Devin 渠道不会混用。Antigravity 等按模型分组的额度窗口只取与当前模型相符的那一组。
- **排查**：`cliproxyapi` 工具的 `status` 与 `/cpa-status` 会附带额度摘要：每个账号的管理密钥状态、额度状态、凭证数，以及模型选择器中每个模型匹配到的凭证和剩余额度（不输出密钥）。
- **刷新**：结果在宿主端缓存 5 分钟；有页面在看时才在后台刷新过期账号，也可手动「刷新额度」。管理密钥被拒（401/403）后暂停该账号的自动刷新，直到更新密钥或手动刷新，避免触发 CPA 的错误密钥封禁。

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
2. 下载先通过 npm 元数据中的 **SHA-512** 完整性校验，再验证 gzip / tar、预期文件与目录、包名和版本；拒绝路径穿越、链接等特殊条目、依赖和安装生命周期脚本。只保存离线包，不解压到安装目录，也不执行包内代码。
3. 校验成功后，卡片显示安装包的绝对路径与适用的升级命令。包保存在 `<Profile 目录>/.dsh-cliproxyapi/updates/dsh-cliproxyapi-pro-<version>.tgz`。
4. **先保存工作并完全关闭 DSH**，再在终端执行卡片提供的命令。示意如下，以卡片里的实际 profile 名称和绝对路径为准：

   ```bash
   dsh plugin --profile 'desktop' add '/absolute/path/dsh-cliproxyapi-pro-<version>.tgz'
   ```

5. 重新启动 DSH 后新版本生效。检查结果和已下载提示不跨插件重载持久化；离线包仍保留在磁盘，可按需要自行清理，插件不会自动删除历史下载。

**本地链接安装（`link:`）** 可以检查并下载包，但不会提供升级命令，也不会覆盖链接的源码目录。若要保留源码开发方式，请在合适时机手动更新 Git 源码，再重启 DSH；通过离线包重新安装会将插件的安装来源从链接切换到离线包。

## Agent 工具与斜杠命令

### `cliproxyapi` 工具

DSH 的 Agent 可以用这个工具查看和配置插件，你只需用自然语言提要求。

| `action` | 作用 |
|---|---|
| `status` | 查看所有账号（或 `account` 指定的账号）的状态与模型 |
| `refresh` | 立即探测并同步；不带 `account` 时刷新全部账号 |
| `configure` | 修改一个账号（默认第一个），保存后立即刷新 |
| `add_account` | 新增账号；给了 `baseURL` 时默认启用，否则停用 |
| `remove_account` | 删除 `account` 指定的账号及其路由 |

参数（除 `action` 外都可选）：

| 参数 | 说明 |
|---|---|
| `account` | 账号 id（如 `default`、`account-2`），也可用路由 ID 或账号名称 |
| `enabled` | 启用 / 停用该账号 |
| `baseURL` | CPA 地址，如 `http://127.0.0.1:8317`；空字符串表示自动发现 |
| `apiKey` | Bearer 密钥，保存到该账号的 `apiKeyEnv` 引用名下 |
| `apiKeyEnv` | 密钥引用名（`[A-Za-z_][A-Za-z0-9_]*`） |
| `provider` | `llm-pi-ai` 路由 ID，每个账号唯一 |
| `displayName` | 账号名称，也是模型选择器中的分组名 |
| `protocolMode` | `auto`（按家族走原生协议，默认）或 `fixed` |
| `protocol` | `fixed` 时使用的协议：`openai-completions` / `openai-responses` / `anthropic-messages` |
| `selectedModels` | 显示在选择器中的模型 id 列表；`[]` 表示全部 |
| `includePrefix` / `excludePrefix` | 逗号分隔的模型 id 关键词 |
| `modelOverrides` | `{ [modelId]: { contextWindow?, maxTokens?, image?, reasoningLevels?, protocol? } }`，整体替换 |

示例：

```json
{ "action": "configure", "baseURL": "http://127.0.0.1:8317", "apiKey": "sk-...", "selectedModels": ["gpt-6.1-sol", "claude-opus-5-5"] }
{ "action": "add_account", "displayName": "Backup CPA", "baseURL": "https://other-cpa:8317", "apiKey": "sk-...", "selectedModels": ["gpt-6-astra"] }
{ "action": "configure", "account": "account-2", "enabled": false }
{ "action": "remove_account", "account": "account-2" }
```

输出包含 `accounts[]`（每个账号的 `id`、`displayName`、`provider`、`enabled`、`state`、`endpoint`、`modelCount`、`totalDiscovered`、`error`）和文字摘要 `summary`。`state` 取值：`idle`、`probing`、`connected`、`disabled`、`error`。

### 斜杠命令

- `/cpa-status`：显示所有账号的状态。
- `/cpa-refresh`：立即刷新所有账号（也会探测停用账号的模型列表）。

### HTTP 接口

供设置面板使用，需要 DSH Web 会话的认证；POST 只接受来自本机或受信任主机的同源请求。

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/api/dsh-cliproxyapi/status` | — | `{ ok, global, accounts[] }` |
| POST | `/api/dsh-cliproxyapi/refresh` | `{ accountId? }` | 刷新一个或全部账号 |
| POST | `/api/dsh-cliproxyapi/save` | `{ accountId?, …账号字段, apiKey?, clearApiKey?, refreshIntervalSeconds?, probeTimeoutMs? }` | 保存账号（缺省为第一个）；只有全局字段时只保存全局设置 |
| POST | `/api/dsh-cliproxyapi/accounts/add` | 账号字段（可选） | 新增账号，默认停用；返回 `createdId` |
| POST | `/api/dsh-cliproxyapi/accounts/remove` | `{ accountId }` | 删除账号及其路由 |
| GET | `/api/dsh-cliproxyapi/updates/status` | — | 只读更新状态，不主动联网检查 |
| POST | `/api/dsh-cliproxyapi/updates/check` | `{}` | 主动检查所选通道与区域；手动检查不触发自动下载 |
| POST | `/api/dsh-cliproxyapi/updates/save` | `{ autoCheck?, autoDownload?, autoInstall?, channel?, region? }` | 只保存这五项更新设置，与账号配置独立 |
| POST | `/api/dsh-cliproxyapi/updates/download` | `{ version }` | 下载最近一次检查确认的新版本，完成校验后保存离线包；不安装 |
| GET | `/api/dsh-cliproxyapi/quota/status` | — | `{ ok, quota }`：缓存的额度快照；过期账号在后台刷新 |
| POST | `/api/dsh-cliproxyapi/quota/refresh` | `{ accountId? }` | 开始刷新一个或全部账号的额度并立即返回（快照中 `refreshing` 为真） |
| POST | `/api/dsh-cliproxyapi/quota/save` | `{ accountId, managementKey?, clear? }` | 保存或清除该账号的管理密钥，并开始刷新额度；响应不含密钥 |

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

  文件每次读取都会重新加载，手动修改后点「立即探测刷新」即可生效。旧版（1.3.x 及以前）的单账号文件会自动迁移为 id 为 `default` 的账号，路由、密钥和勾选保持不变，原文件备份为 `state.v1.json`。

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
- **密钥**：通过 DSH 的 `credentials` 服务按引用名存取；凭证服务里没有时，回退读取同名环境变量。
- **环境变量**：`CLIPROXYAPI_BASE_URL` 只用于服务地址留空的账号的自动发现。
- **插件行配置**：`cordis.patch.yml` 中本插件行的 `config` 会在启动时叠加到状态文件上：包含 `accounts` 时替换账号列表，否则其中的字段作用于第一个账号。一般保持 `{}`，用面板或工具配置即可。

## 升级与卸载

- **升级**：装有 dshmarket 时，直接在插件更新卡片点 **立即更新**（或开启自动安装），完成后按提示重启 DSH 或刷新页面。没有插件市场时，使用卡片下载校验后的离线包，保存工作并关闭 DSH，再执行卡片的 `dsh plugin --profile '名称' add '离线包绝对路径'` 命令，最后重新启动；无需先卸载。也可在关闭 DSH 后运行 `dsh plugin --profile <profile 名称> add dsh-cliproxyapi-pro@latest` 从 npm 升级。账号、勾选和参数仍保存在原 profile 目录里，密钥仍在凭证服务里；更新下载功能不会改写这些数据。本地链接安装要保留源码方式时应自行更新源码，而不是从离线包重装。
- **卸载**：在 **插件** 页卸载。已同步的模型路由保存在 DSH 设置里，卸载插件不会自动删除它们；想让这些模型一并从选择器消失，请在卸载前把各账号停用或删除。

## 常见问题

**模型选择器里看不到模型？**
确认账号已打开「启用此账号」，并且至少勾选了一个模型（或勾选为空，表示全部）。可以运行 `/cpa-status` 查看每个账号的状态。

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
2. **配置**：使用 `cliproxyapi` 工具。
   - CPA 在本机 `http://127.0.0.1:8317` 且无鉴权：无需配置，调用 `{"action": "refresh"}`。
   - 远程地址或有密钥：`{"action": "configure", "baseURL": "...", "apiKey": "..."}`（作用于第一个账号）；额外的账号用 `{"action": "add_account", ...}`；指定账号时传 `"account": "<id>"`。
   - 用 `selectedModels`（取自 `status` 输出中的精确 id）精简模型选择器。
3. **验证**：`{"action": "status"}` 中每个启用的账号 `state` 为 `connected` 且 `modelCount > 0`。告诉用户模型已出现在 DSH 模型选择器中（按账号名称分组），可在 **设置** 左侧导航的 **CLIProxyAPI** 页管理账号。

不要把 API Key 回显给用户，也不要写入任何文件。

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

修改代码前请阅读 [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md)；变更记录见 [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)。欢迎提交 Issue 和 Pull Request，修改说明文档时请同时更新中英文两份。

## 许可证

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
