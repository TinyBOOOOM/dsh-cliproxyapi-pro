# dsh-cliproxyapi-pro (v1.4.0)

[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 接入插件，适用于 **DeepSeek Harness（DSH `>=0.2.0-rc.1`）**：自动发现 CPA 服务、同步模型目录与能力（上下文、视觉、推理档位）到 DSH 模型选择器，支持**多个账号**分别启用/停用、可视化勾选模型与单模型参数覆盖。

- 零运行时依赖，无需构建；仅使用 Node.js 内置模块与 DSH（Cordis）上下文服务。
- 密钥只存放在 DSH 凭证服务中，不会写入配置文件。

## 目录

- [功能](#功能)
- [安装](#安装)
- [使用](#使用)
  - [设置面板](#设置面板)
  - [多账号](#多账号)
  - [Agent 工具 `cliproxyapi`](#agent-工具-cliproxyapi)
  - [斜杠命令](#斜杠命令)
  - [HTTP 接口](#http-接口)
- [协议路由](#协议路由)
- [存储与配置](#存储与配置)
- [AI Agent 安装与配置指南](#ai-agent-安装与配置指南-ai-installation-protocol)
- [开发](#开发)
- [许可证](#许可证)

## 功能

1. **自动发现**：可填写远程/本地地址（自动剥离 `/v1`、`/v1/chat/completions`、`/v1/messages` 等后缀），留空则依次尝试已有路由地址、环境变量 `CLIPROXYAPI_BASE_URL` 与本地 `127.0.0.1:8317`。读取 `/v1/models?client_version=pi` 富元数据目录（兼容 OpenAI `data[]` 格式），并用 `/v1/models` 的 `owned_by` 判断模型家族。
2. **模型勾选筛选**：搜索、家族标签、全部/已勾选/未勾选切换、批量勾选；**只有勾选的模型会出现在对话框模型选择器中**。勾选为空表示不过滤；另可用包含/排除关键词规则。
3. **单模型参数覆盖**：上下文窗口、最大输出、图片输入、思考等级（`off`…`max`）、请求协议，可一键恢复自动探测值。
4. **按模型家族走原生协议**（默认）：见[协议路由](#协议路由)。
5. **多账号**：每个账号独立的服务地址、密钥、路由、协议、勾选与覆盖，可单独启用/停用。见[多账号](#多账号)。
6. **自动刷新**：所有账号按统一间隔（默认 300 秒）刷新；数据无变化时不写入任何设置。

## 安装

**方式一：在 DSH 中让 Agent 安装**（推荐）。把本目录或打包好的 `.tgz` 的绝对路径告诉 Agent，它会调用 `plugin_manager`：

```json
{ "action": "install_bundle", "target": "<本目录或 .tgz 的绝对路径>", "enabled": true }
```

- 安装目录时为链接安装（`source: link:<目录>`），修改本目录后重载插件即生效，适合开发。
- 安装 `.tgz` 时为复制安装，适合分发。打包：`npm pack`。
- 已安装旧版本时可直接重新安装；替换已安装的包后需要重启 DSH 才能加载新代码。

**方式二：插件市场 / 插件管理器**：在 DSH 左侧栏「插件」中安装本地包。

安装后入口：

- 左侧栏 → **插件** → **CLIProxyAPI**
- **设置** → **插件** → **CLIProxyAPI**

## 使用

### 设置面板

面板顶部是**账号栏**：点击切换账号（圆点表示状态，未启用的账号带「未启用」标记），「+ 添加账号」新增账号。下方针对当前账号：

| 区块 | 内容 |
|---|---|
| 状态卡片 | 连接状态、当前节点、选择器中的模型数 / 发现总数；「立即探测刷新」「保存设置并应用」 |
| 模型显示筛选 | 勾选模型、编辑单模型参数；修改后点「保存模型勾选」 |
| 连接与认证 | 「启用此账号」开关、服务地址、API Key（可清除）、接口协议、账号名称 |
| 高级 | 包含/排除关键词、路由 ID、密钥引用名、自动刷新间隔（所有账号共用）；「删除此账号」 |

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
| `configure` | 修改一个账号（默认第一个）；同时保存后立即刷新 |
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
{ "action": "configure", "baseURL": "http://127.0.0.1:8317", "apiKey": "sk-...", "selectedModels": ["gpt-6.1-sol", "devin/claude-opus-5-5"] }
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

## AI Agent 安装与配置指南 (AI Installation Protocol)

> **Instructions for DeepSeek Harness (DSH) AI Agent**: when the user asks you to install or configure this plugin, follow these steps. The package has no npm dependencies and no build scripts.

1. **Install**: call `plugin_manager` with `{"action": "install_bundle", "target": "<ABSOLUTE_PATH_TO_TGZ_OR_DIRECTORY>", "enabled": true}`. Read `application` and `warnings` in the result; `restart-required` means DSH must restart before the new code runs.
2. **Configure** with the `cliproxyapi` tool:
   - Local CPA on `http://127.0.0.1:8317` without auth: no configuration needed; call `{"action": "refresh"}`.
   - Remote URL or key: `{"action": "configure", "baseURL": "...", "apiKey": "..."}` (first account), or `{"action": "add_account", ...}` for an additional account. Pass `"account": "<id>"` to target a specific account.
   - Narrow the picker with `selectedModels` (exact ids from the `status` output).
3. **Verify**: `{"action": "status"}` shows `state: "connected"` and `modelCount > 0` for each enabled account. Tell the user the models are in the DSH model picker under the account's display name, and that they can manage accounts in **Sidebar → Plugins → CLIProxyAPI** or **Settings → Plugins → CLIProxyAPI**.

Never echo API keys back to the user or into files.

## 开发

```text
lib/index.js        Host 插件（发现、同步、多账号控制器、工具、命令、HTTP 接口）
lib/client.js       Web 设置面板（ModuleLoader 格式，手写，无需构建）
locale/*.json       插件管理器中显示的标题与描述
cordis.patch.yml    Bundle patch，插入 dsh-cliproxyapi-pro 行
tests/              node:test 单元与集成测试
AGENTS.md           给编码 Agent 的开发约定、架构与不变量
```

```powershell
npm test             # 运行测试
npm run check        # 语法检查 + 测试
npm run pack:check   # 查看打包文件列表
```

修改代码前请阅读 [AGENTS.md](AGENTS.md)；变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

[MIT](LICENSE)
