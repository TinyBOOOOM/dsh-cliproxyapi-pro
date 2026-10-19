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
- **安全**：API Key 只保存在 DSH 凭证服务里，不写入任何配置文件。
- **零依赖**：不依赖任何 npm 包，无需构建，安装几秒完成。

适用于 DSH `0.2.0-rc.1` 及以上版本（含桌面版与 Web 版）。

## 目录

- [安装](#安装)
- [快速上手](#快速上手)
- [截图](#截图)
- [功能详解](#功能详解)
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

   需要固定版本时可以写成 `dsh-cliproxyapi-pro@1.4.1`。
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
| 某个发布版本 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.4.1` |
| 最新开发版 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| 离线安装包 | 下载 [`dsh-cliproxyapi-pro.tgz`](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases/latest/download/dsh-cliproxyapi-pro.tgz)（始终是最新版），填写它的本地绝对路径 |
| 本地源码（开发用） | 克隆后的仓库目录绝对路径；以链接方式安装，改代码后重载插件即生效 |

所有版本见 [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases)。

## 快速上手

1. **打开设置面板**：左侧栏 **插件** → **CLIProxyAPI**，或 **设置** → **内置插件** → **CLIProxyAPI** 标签页。
2. **填写连接信息**：在「连接与认证配置」里填 **CLIProxyAPI 服务地址**（如 `http://127.0.0.1:8317`，不用加 `/v1`）和 **API Key**（本地免密的 CPA 可留空），点 **保存设置并应用**。
3. **选择模型**：连接成功后，「模型显示筛选」会列出 CPA 上的全部模型，并已为每个家族勾好最新的一个。按需增减后点 **保存模型勾选**。
4. **开始使用**：回到对话框，打开模型选择器，就能在以账号名称命名的分组里看到这些模型。

CPA 就在本机默认端口 `8317` 且没有设置密钥时，什么都不用填，插件会自动发现它。

## 截图

**1. 账号栏与账号状态。** 顶部账号栏列出所有账号：绿点表示已连接，灰点加「未启用」标记表示已停用。图中刚用「+ 添加账号」新增了第二个账号「CLI Proxy API 2」：它默认停用，拥有独立的路由 `cli-proxy-2`；由于还没填写服务地址，探测提示本地没有找到 CPA 服务。

![账号栏：一个已连接账号和一个刚添加、未启用的账号](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/accounts.png)

**2. 模型显示筛选。** 从 CPA 服务发现的全部 168 个模型，支持全部发现 / 已勾选 / 未勾选切换、家族标签（GPT、CLAUDE、GEMINI、GROK……）、搜索与批量操作。只有勾选的模型会同步到 DSH 模型选择器；每个模型显示将使用的协议（图中为 OpenAI Responses）、图片输入、推理档位与上下文长度，「编辑参数」可打开单模型参数覆盖。

![模型筛选：家族标签、已勾选模型、协议与能力标记](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/model-filter.png)

**3. 连接与认证配置。** 每个账号独立的设置：「启用此账号」开关、服务地址、保存在该账号独立引用名（`CLI_PROXY_API_KEY_2`）下的 API Key、接口协议、账号名称、可折叠的高级设置，以及「保存设置并应用」与「删除此账号」。

![未启用账号的连接设置，使用独立的密钥引用名](https://raw.githubusercontent.com/TinyBOOOOM/dsh-cliproxyapi-pro/main/assets/screenshots/connection.png)

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

- **密钥**：通过 DSH 的 `credentials` 服务按引用名存取；凭证服务里没有时，回退读取同名环境变量。
- **环境变量**：`CLIPROXYAPI_BASE_URL` 只用于服务地址留空的账号的自动发现。
- **插件行配置**：`cordis.patch.yml` 中本插件行的 `config` 会在启动时叠加到状态文件上：包含 `accounts` 时替换账号列表，否则其中的字段作用于第一个账号。一般保持 `{}`，用面板或工具配置即可。

## 升级与卸载

- **升级**：在 **插件** 页卸载后重新安装即可；命令行可以运行 `dsh plugin --profile <profile 名称> add dsh-cliproxyapi-pro@latest`。账号、勾选和参数保存在 profile 目录里，密钥保存在凭证服务里，重装不会丢失。
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

## 给 AI Agent 的安装指南

> 给 DeepSeek Harness 中的 AI Agent：用户要求安装或配置本插件时按以下步骤执行。本包没有 npm 依赖，也没有构建脚本。

1. **安装**：调用 `plugin_manager`：`{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`。查看结果中的 `application` 与 `warnings`；`restart-required` 表示需要重启 DSH 后新代码才会运行。
2. **配置**：使用 `cliproxyapi` 工具。
   - CPA 在本机 `http://127.0.0.1:8317` 且无鉴权：无需配置，调用 `{"action": "refresh"}`。
   - 远程地址或有密钥：`{"action": "configure", "baseURL": "...", "apiKey": "..."}`（作用于第一个账号）；额外的账号用 `{"action": "add_account", ...}`；指定账号时传 `"account": "<id>"`。
   - 用 `selectedModels`（取自 `status` 输出中的精确 id）精简模型选择器。
3. **验证**：`{"action": "status"}` 中每个启用的账号 `state` 为 `connected` 且 `modelCount > 0`。告诉用户模型已出现在 DSH 模型选择器中（按账号名称分组），可在 **左侧栏 → 插件 → CLIProxyAPI** 或 **设置 → 内置插件 → CLIProxyAPI** 管理账号。

不要把 API Key 回显给用户，也不要写入任何文件。

## 开发

```text
lib/index.js        Host 插件（发现、同步、多账号控制器、工具、命令、HTTP 接口）
lib/client.js       Web 设置面板（ModuleLoader 格式，手写，无需构建）
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

发版只需推送 `v<版本号>` 标签：GitHub Actions 会运行测试、创建 GitHub Release 并附上安装包，再通过 npm 受信任发布（不使用任何 token）上传到 npm，并附带来源证明。

修改代码前请阅读 [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md)；变更记录见 [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)。欢迎提交 Issue 和 Pull Request，修改说明文档时请同时更新中英文两份。

## 许可证

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
