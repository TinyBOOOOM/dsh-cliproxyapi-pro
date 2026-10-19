# dsh-cliproxyapi-pro (v1.4.0)

[English](README.md) | 中文

[![CI](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 接入插件，适用于 **DeepSeek Harness（DSH `>=0.2.0-rc.1`）**：自动发现 CPA 服务、同步模型目录与能力（上下文、视觉、推理档位）到 DSH 模型选择器，支持**多个账号**分别启用/停用、可视化勾选模型与单模型参数覆盖。

- 零运行时依赖，无需构建；仅使用 Node.js 内置模块与 DSH（Cordis）上下文服务。
- 密钥只存放在 DSH 凭证服务中，不会写入配置文件。

## 目录

- [功能](#功能)
- [截图](#截图)
- [安装](#安装)
- [使用](#使用)
  - [设置面板](#设置面板)
  - [多账号](#多账号)
  - [Agent 工具 `cliproxyapi`](#agent-工具-cliproxyapi)
  - [斜杠命令](#斜杠命令)
  - [HTTP 接口](#http-接口)
- [协议路由](#协议路由)
- [存储与配置](#存储与配置)
- [AI Agent 安装与配置指南](#ai-agent-安装与配置指南)
- [开发](#开发)
- [许可证](#许可证)

## 功能

1. **自动发现**：可填写远程/本地地址（自动剥离 `/v1`、`/v1/chat/completions`、`/v1/messages` 等后缀），留空则依次尝试已有路由地址、环境变量 `CLIPROXYAPI_BASE_URL` 与本地 `127.0.0.1:8317`。读取 `/v1/models?client_version=pi` 富元数据目录（兼容 OpenAI `data[]` 格式），并用 `/v1/models` 的 `owned_by` 判断模型家族。
2. **模型勾选筛选**：搜索、家族标签、全部/已勾选/未勾选切换、批量勾选；**只有勾选的模型会出现在对话框模型选择器中**。勾选为空表示不过滤；另可用包含/排除关键词规则。从未保存过勾选的账号，首次探测成功后会按该服务自己的模型目录，为每个模型家族勾选最新的一个（最多 12 个）；「恢复推荐精选」可恢复这组勾选。
3. **单模型参数覆盖**：上下文窗口、最大输出、图片输入、思考等级（`off`…`max`）、请求协议，可一键恢复自动探测值。
4. **按模型家族走原生协议**（默认）：见[协议路由](#协议路由)。
5. **多账号**：每个账号独立的服务地址、密钥、路由、协议、勾选与覆盖，可单独启用/停用。见[多账号](#多账号)。
6. **自动刷新**：所有账号按统一间隔（默认 300 秒）刷新；数据无变化时不写入任何设置。

## 截图

面板位于 **设置 → 内置插件 → CLIProxyAPI** 标签页，界面语言跟随 DSH 设置。

**1. 账号栏与账号状态。** 顶部账号栏列出所有账号：绿点表示已连接，灰点加「未启用」标记表示已停用。图中刚用「+ 添加账号」新增了第二个账号「CLI Proxy API 2」：它默认停用，拥有独立的路由 `cli-proxy-2`；由于还没填写服务地址，探测提示本地没有找到 CPA 服务。

![账号栏：一个已连接账号和一个刚添加、未启用的账号](assets/screenshots/accounts.png)

**2. 模型显示筛选。** 从 CPA 服务发现的全部 168 个模型，支持全部发现 / 已勾选 / 未勾选切换、家族标签（GPT、CLAUDE、GEMINI、GROK……）、搜索与批量操作。只有勾选的模型会同步到 DSH 模型选择器；每个模型显示将使用的协议（图中为 OpenAI Responses）、图片输入、推理档位与上下文长度，「编辑参数」可打开单模型参数覆盖。

![模型筛选：家族标签、已勾选模型、协议与能力标记](assets/screenshots/model-filter.png)

**3. 连接与认证配置。** 每个账号独立的设置：「启用此账号」开关、服务地址、保存在该账号独立引用名（`CLI_PROXY_API_KEY_2`）下的 API Key、接口协议、账号名称、可折叠的高级设置，以及「保存设置并应用」与「删除此账号」。

![未启用账号的连接设置，使用独立的密钥引用名](assets/screenshots/connection.png)

## 安装

在 DSH 对话中让 Agent 调用 `plugin_manager` 安装，`target` 任选其一：

| 来源 | `target` |
|---|---|
| GitHub 最新 `main` | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#main` |
| GitHub 某个版本标签 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v<版本号>`（见 [Releases](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/releases)） |
| GitHub Release 的 `.tgz` | 下载 Release 中的 `dsh-cliproxyapi-pro.tgz`，填写它的绝对路径 |
| 本地目录（开发用，链接安装） | 克隆后的仓库目录绝对路径 |
| npm（发布后） | `dsh-cliproxyapi-pro` |

```json
{ "action": "install_bundle", "target": "<上表中的 target>", "enabled": true }
```

- 安装目录时为链接安装（`source: link:<目录>`），修改代码后重载插件即生效。
- 已安装旧版本时可直接重新安装；替换已安装的包后需要重启 DSH 才能加载新代码。
- 安装结果中的 `application` 为 `restart-required` 时需重启 DSH。

安装后入口：

- 左侧栏 → **插件** → **CLIProxyAPI**
- **设置** → **内置插件** → **CLIProxyAPI** 标签页

## 使用

### 设置面板

面板顶部是**账号栏**：点击切换账号（圆点表示状态，未启用的账号带「未启用」标记），「+ 添加账号」新增账号。下方针对当前账号：

| 区块 | 内容 |
|---|---|
| 状态卡片 | 连接状态、当前节点、选择器中的模型数 / 发现总数；「立即探测刷新」「保存设置并应用」 |
| 模型显示筛选 | 勾选模型、编辑单模型参数；修改后点「保存模型勾选」 |
| 连接与认证 | 「启用此账号」开关、服务地址、API Key（可清除）、接口协议、账号名称 |
| 高级路由与规则过滤 | 包含/排除关键词、路由 ID、密钥引用名、自动刷新间隔（所有账号共用）；「删除此账号」 |

### 多账号

- 每个账号写入自己的一组 `llm-pi-ai` 路由：首个账号为 `cli-proxy` / `cli-proxy-responses` / `cli-proxy-messages`，新增账号依次为 `cli-proxy-2*`、`cli-proxy-3*`……；密钥引用名依次为 `CLI_PROXY_API_KEY`、`CLI_PROXY_API_KEY_2`……。模型选择器中按账号名称分组。
- **路由 ID 不能重叠**（例如另一个账号不能使用 `cli-proxy-messages`），保存时会拒绝。
- **停用**账号：保留全部配置，但删除它的路由，模型从选择器中消失；其他账号不受影响。
- **新增**账号默认停用。填写地址与密钥后可先「立即探测刷新」预览模型并勾选，再打开「启用此账号」保存。
- 填写了服务地址的账号**只探测该地址**，连不上就报错，不会回退到本地 `:8317`，避免多个账号指向同一服务。
- **删除**账号会移除它的路由，但保留凭证服务中的密钥。

### Agent 工具 `cliproxyapi`

| `action` | 作用 |
|---|---|
| `status` | 查看所有账号（或 `account` 指定的账号）状态与模型 |
| `refresh` | 立即探测并同步；不带 `account` 时刷新全部账号 |
| `configure` | 修改一个账号（默认第一个），保存后立即刷新 |
| `add_account` | 新增账号；给了 `baseURL` 时默认启用，否则停用 |
| `remove_account` | 删除 `account` 及其路由 |

参数（除 `action` 外均可选）：

| 参数 | 说明 |
|---|---|
| `account` | 账号 id（如 `default`、`account-2`），也可用路由 ID 或账号名称 |
| `enabled` | 启用 / 停用该账号 |
| `baseURL` | CPA 地址，如 `http://127.0.0.1:8317`；空字符串表示自动发现 |
| `apiKey` | Bearer 密钥，保存到该账号的 `apiKeyEnv` 引用名下 |
| `apiKeyEnv` | 密钥引用名（`[A-Za-z_][A-Za-z0-9_]*`） |
| `provider` | `llm-pi-ai` 路由 ID，每个账号唯一 |
| `displayName` | 账号名称 / 模型选择器分组名 |
| `protocolMode` | `auto`（按家族原生协议，默认）或 `fixed` |
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

输出包含 `accounts[]`（每个账号的 `id`、`displayName`、`provider`、`enabled`、`state`、`endpoint`、`modelCount`、`totalDiscovered`、`error`）与文字摘要 `summary`。`state` 取值：`idle`、`probing`、`connected`、`disabled`、`error`。

### 斜杠命令

- `/cpa-status`：显示所有账号的状态。
- `/cpa-refresh`：立即刷新所有账号（包括探测停用账号的模型列表）。

### HTTP 接口

供设置面板使用，需要 DSH Web 会话认证；POST 仅接受本机/受信任主机的同源请求。

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| GET | `/api/dsh-cliproxyapi/status` | — | `{ ok, global, accounts[] }` |
| POST | `/api/dsh-cliproxyapi/refresh` | `{ accountId? }` | 刷新一个或全部账号 |
| POST | `/api/dsh-cliproxyapi/save` | `{ accountId?, …账号字段, apiKey?, clearApiKey?, refreshIntervalSeconds?, probeTimeoutMs? }` | 保存账号（缺省为第一个）；只有全局字段时只保存全局设置 |
| POST | `/api/dsh-cliproxyapi/accounts/add` | 账号字段（可选） | 新增账号，默认停用；返回 `createdId` |
| POST | `/api/dsh-cliproxyapi/accounts/remove` | `{ accountId }` | 删除账号及其路由 |

## 协议路由

CLIProxyAPI 对每个模型同时提供 OpenAI Chat、OpenAI Responses、Anthropic Messages 三种入口，入口协议与上游不一致时会做转换。自动模式（`protocolMode: "auto"`）让每个模型直接使用上游协议：

| 模型家族（依据 `owned_by` 与模型 id） | 协议 | 路由（以 `cli-proxy` 为例） |
|---|---|---|
| Claude（含 `devin/claude-*`、Antigravity Claude） | Anthropic Messages `/v1/messages` | `cli-proxy-messages` |
| OpenAI / Codex / GPT、xAI Grok | OpenAI Responses `/v1/responses` | `cli-proxy-responses` |
| Gemini、DeepSeek、Kimi、GLM、SWE、gpt-oss 等 | OpenAI Chat `/v1/chat/completions` | `cli-proxy` |

- DSH 自定义路由不支持 Gemini 原生 `generateContent`，Gemini 走 OpenAI Chat。
- DSH 每条路由只有一种协议，模型按协议拆入三条路由；没有模型的路由会被移除。默认模型因此换路由时，`agent-default-model` 自动跟随。
- Claude 4.6+ / 5.x / Fable 使用自适应思考（`effort`），更早的 Claude 使用 token 预算。
- 可改为「统一使用」某一协议（`fixed`），或在单个模型的「编辑参数」中指定协议。
- 路由上你手动添加的其他字段（如 `retryPolicy`）会被保留。

## 存储与配置

- **状态文件**：`<Profile 目录>/.dsh-cliproxyapi/state.json`

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

  文件每次读取时都会重新加载，手动修改后点「立即探测刷新」即可生效。v1 单账号文件会自动迁移为 id `default` 的账号（路由、密钥、勾选不变），原文件备份为 `state.v1.json`。

- **密钥**：通过 DSH `credentials` 服务按引用名存取；未存储时回退读取同名环境变量。本地免密的 CPA 可以不填密钥。
- **环境变量**：`CLIPROXYAPI_BASE_URL` 仅用于服务地址留空的账号的自动发现。
- **Bundle 行配置**：`cordis.patch.yml` 中插件行的 `config` 会在启动时叠加到状态文件上：含 `accounts` 时替换账号列表，否则平铺字段作用于第一个账号。通常保持 `{}`，使用面板或工具配置即可。

## AI Agent 安装与配置指南

> 给 DeepSeek Harness 中的 AI Agent：用户要求安装或配置本插件时按以下步骤执行。本包没有 npm 依赖，也没有构建脚本。

1. **安装**：调用 `plugin_manager`，`{"action": "install_bundle", "target": "<见安装一节>", "enabled": true}`。查看结果中的 `application` 与 `warnings`；`restart-required` 表示需重启 DSH 后新代码才会运行。
2. **配置**：使用 `cliproxyapi` 工具。
   - 本地 `http://127.0.0.1:8317` 且无鉴权：无需配置，调用 `{"action": "refresh"}`。
   - 远程地址或密钥：`{"action": "configure", "baseURL": "...", "apiKey": "..."}`（第一个账号），额外账号用 `{"action": "add_account", ...}`；指定账号时传 `"account": "<id>"`。
   - 用 `selectedModels`（取自 `status` 输出的精确 id）精简模型选择器。
3. **验证**：`{"action": "status"}` 中每个启用的账号 `state` 为 `connected` 且 `modelCount > 0`。告诉用户模型已出现在 DSH 模型选择器中（以账号名称分组），可在 **左侧栏 → 插件 → CLIProxyAPI** 或 **设置 → 内置插件 → CLIProxyAPI** 管理账号。

不要把 API Key 回显给用户或写入任何文件。

## 开发

```text
lib/index.js        Host 插件（发现、同步、多账号控制器、工具、命令、HTTP 接口）
lib/client.js       Web 设置面板（ModuleLoader 格式，手写，无需构建）
locale/*.json       插件管理器中显示的标题与描述
cordis.patch.yml    Bundle patch，插入 dsh-cliproxyapi-pro 行
tests/              node:test 单元与集成测试
.github/workflows/  CI（测试）与发版（Release .tgz，可选 npm 发布）
assets/screenshots/ README 截图（同时登记在 screenshots.json 中供插件市场展示）
AGENTS.md           给编码 Agent 的开发约定、架构与不变量
```

```powershell
git clone https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git
cd dsh-cliproxyapi-pro
npm test             # 运行测试
npm run check        # 语法检查 + 测试
npm run pack:check   # 查看打包文件列表
```

修改代码前请阅读 [AGENTS.md](AGENTS.md)；变更记录见 [CHANGELOG.md](CHANGELOG.md)。欢迎提交 Issue 与 Pull Request，修改说明文档时请同时更新中英文两份。

## 许可证

[MIT](LICENSE)
