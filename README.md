# dsh-cliproxyapi-pro

中文 | [English](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/README.en.md)

[![npm](https://img.shields.io/npm/v/dsh-cliproxyapi-pro?label=npm)](https://www.npmjs.com/package/dsh-cliproxyapi-pro)
[![CI](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)

**把 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（CPA）里的模型，一键接进 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的模型选择器。**

填好服务地址和 API Key，插件会自动读取 CPA 的模型目录，把你勾选的模型连同上下文长度、图片输入、推理档位一起同步到 DSH；每个模型自动走它最合适的协议。可以同时接入多个 CPA 账号，每个账号单独启用或停用。

- **多账号**：每个账号独立的地址、密钥、模型勾选和参数，互不影响，可随时停用。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/accounts-and-models.md)
- **开箱即用**：首次连接时按该服务自己的模型目录，为每个模型家族勾选最新的一个（最多 12 个），模型选择器不会被上百个模型淹没。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/accounts-and-models.md)
- **原生协议**：Claude 走 Anthropic Messages，GPT / Codex / Grok 走 OpenAI Responses，其余走 OpenAI Chat，减少 CPA 的协议转换。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/accounts-and-models.md)
- **可视化管理**：设置面板里勾选模型、编辑单个模型的参数。默认不注册 Agent 工具，不占用模型上下文（可选的生成工具 `generate_media` 需在「生成」标签手动打开）。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/accounts-and-models.md)
- **插件更新**：自动检查稳定 / Beta / 开发通道，可选择全球 / 中国大陆下载源；装有 [DSH 插件市场（dshmarket）](https://github.com/dsh-market/dsh-market) 时可一键或自动安装新版本，否则下载校验离线包，在关闭 DSH 后手动升级。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/updates.md)
- **安全**：API Key 只保存在 DSH 凭证服务里，不写入任何配置文件。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/storage-and-config.md)
- **零依赖**：不依赖任何 npm 包，安装时无需构建，安装几秒完成。 [详解](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/development.md)

适用于 DSH `0.2.0-rc.1` 及以上版本（含桌面版与 Web 版）。
- **渠道额度**：[额度页、对话框徽标与失败保护](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/quota.md)。
- **生图 / 生视频**：[生成、改图、视频编辑 / 延长与可选 agent 工具](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/media.md)。

## 安装

插件已发布到 npm：[`dsh-cliproxyapi-pro`](https://www.npmjs.com/package/dsh-cliproxyapi-pro)，中国大陆镜像（npmmirror）同步可用。任选一种方式安装即可。

### 方式一：在 DSH 插件页安装（推荐）

1. 打开 DSH，点击左侧栏的 **插件**。
2. 点击页面顶部的 **添加插件**。
3. 在输入框中填写包名：

   ```text
   dsh-cliproxyapi-pro
   ```

   需要固定版本时可以写成 `dsh-cliproxyapi-pro@1.8.0`。
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
| 某个发布版本 | `git+https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git#v1.8.0` |
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

## 目录

- [账号与模型](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/accounts-and-models.md)
- [渠道额度](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/quota.md)
- [生图与生视频](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/media.md)
- [插件自身更新](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/updates.md)
- [斜杠命令与 HTTP 接口](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/reference.md)
- [存储与配置](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/storage-and-config.md)
- [升级与卸载](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/upgrade-and-uninstall.md)
- [常见问题](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/faq.md)
- [给 AI Agent 的安装指南](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/ai-install-guide.md)
- [开发](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/docs/zh/development.md)

## 许可证

[MIT](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/LICENSE)
