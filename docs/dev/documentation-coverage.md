[Back to AGENTS.md](../../AGENTS.md)

# Documentation restructure coverage

The original user headings below each have exactly one destination in the corresponding README or language-specific guide. Heading levels may change to make a section a topic title. Installation, quick start, screenshots and license stay in the READMEs; the original Contents heading now indexes detailed documentation.

## Verification result

Baseline: commit `51101d4ece8aca7c1d553be1136c2816267b5f20`, before this documentation split.

- Original README headings: **72 / 72 preserved**, each with exactly one destination in its language.
- Original AGENTS inline-code identifiers: **668 / 668 unique identifiers retained**, **0 missing** across AGENTS and `docs/dev/**`. The one-off Node script extracted backticked spans, compared identifier sets, and checked the section destinations below.
- Bilingual user guides: **10 matching filenames**, with matching heading-level sequences and corresponding original section titles.
- Both README files: **127 lines**, retaining all four installation methods, quick start, all six screenshots and their provenance captions, and the license.
- README Markdown destinations are absolute HTTPS URLs; relative document links and anchors in the moved guides resolve locally.
- `npm run check`: **325 tests passed, 0 failed**, on this documentation worktree before integration of concurrent code splits; `git diff --check` passed.

The one-off verification tooling is not shipped or retained as application code. Historical location identifiers below are deliberately kept out of current architecture/testing instructions.

## Historical names retained for identifier coverage

These identifiers occurred in the original AGENTS. Old file paths and command fragments are retained here for traceability, **not** as current module locations or runnable validation instructions. Use [architecture](architecture.md) and [testing](testing.md) for the current layout. The coordinator supplies exact module maps after integration.

- `lib/media.js`
- `tests/plugin.test.mjs`
- `lib/updater.js`
- `lib/quota.js`
- `tests/updater.test.mjs`
- `tests/update-routes.test.mjs`
- `tests/quota.test.mjs`
- `tests/media.test.mjs`
- `tests/client.test.mjs`
- `#region`

## Section destinations

| Language | Original heading | Destination |
|---|---|---|
| zh | dsh-cliproxyapi-pro | [Guide](../../README.md) |
| zh | 目录 | [Guide](../../README.md) |
| zh | 安装 | [Guide](../../README.md) |
| zh | 方式一：在 DSH 插件页安装（推荐） | [Guide](../../README.md) |
| zh | 方式二：让 DSH 里的 Agent 帮你装 | [Guide](../../README.md) |
| zh | 方式三：命令行 | [Guide](../../README.md) |
| zh | 方式四：从 GitHub 安装（不经过 npm） | [Guide](../../README.md) |
| zh | 快速上手 | [Guide](../../README.md) |
| zh | 截图 | [Guide](../../README.md) |
| zh | 功能详解 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 自动发现与同步 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 模型勾选 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 单模型参数覆盖 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 多账号 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 协议路由 | [Guide](../../docs/zh/accounts-and-models.md) |
| zh | 渠道额度（「额度」标签页与对话框额度徽标） | [Guide](../../docs/zh/quota.md) |
| zh | 生图 / 生视频模型（「生成」标签页） | [Guide](../../docs/zh/media.md) |
| zh | 生成图片（`/cpa-image`） | [Guide](../../docs/zh/media.md) |
| zh | 生成视频（`/cpa-video`） | [Guide](../../docs/zh/media.md) |
| zh | 编辑 / 延长视频（`/cpa-video-edit`、`/cpa-video-extend`） | [Guide](../../docs/zh/media.md) |
| zh | 用对话模型理解自然语言参数 | [Guide](../../docs/zh/media.md) |
| zh | 让 agent 生成（`generate_media` 工具，默认关闭） | [Guide](../../docs/zh/media.md) |
| zh | 输入框旁的生成模型按钮 | [Guide](../../docs/zh/media.md) |
| zh | 插件自身更新 | [Guide](../../docs/zh/updates.md) |
| zh | 通道、区域与自动开关 | [Guide](../../docs/zh/updates.md) |
| zh | 通过插件市场一键更新 / 自动更新 | [Guide](../../docs/zh/updates.md) |
| zh | 下载、校验与离线升级 | [Guide](../../docs/zh/updates.md) |
| zh | 斜杠命令与 HTTP 接口 | [Guide](../../docs/zh/reference.md) |
| zh | 斜杠命令 | [Guide](../../docs/zh/reference.md) |
| zh | HTTP 接口 | [Guide](../../docs/zh/reference.md) |
| zh | 存储与配置 | [Guide](../../docs/zh/storage-and-config.md) |
| zh | 升级与卸载 | [Guide](../../docs/zh/upgrade-and-uninstall.md) |
| zh | 常见问题 | [Guide](../../docs/zh/faq.md) |
| zh | 给 AI Agent 的安装指南 | [Guide](../../docs/zh/ai-install-guide.md) |
| zh | 开发 | [Guide](../../docs/zh/development.md) |
| zh | 许可证 | [Guide](../../README.md) |
| en | dsh-cliproxyapi-pro | [Guide](../../README.en.md) |
| en | Contents | [Guide](../../README.en.md) |
| en | Installation | [Guide](../../README.en.md) |
| en | Option 1: the DSH Plugins page (recommended) | [Guide](../../README.en.md) |
| en | Option 2: ask the agent in DSH | [Guide](../../README.en.md) |
| en | Option 3: command line | [Guide](../../README.en.md) |
| en | Option 4: from GitHub (without npm) | [Guide](../../README.en.md) |
| en | Getting started | [Guide](../../README.en.md) |
| en | Screenshots | [Guide](../../README.en.md) |
| en | Features in detail | [Guide](../../docs/en/accounts-and-models.md) |
| en | Discovery and synchronization | [Guide](../../docs/en/accounts-and-models.md) |
| en | Model selection | [Guide](../../docs/en/accounts-and-models.md) |
| en | Per-model overrides | [Guide](../../docs/en/accounts-and-models.md) |
| en | Multiple accounts | [Guide](../../docs/en/accounts-and-models.md) |
| en | Protocol routing | [Guide](../../docs/en/accounts-and-models.md) |
| en | Channel quota (the "Quota" tab and the composer badge) | [Guide](../../docs/en/quota.md) |
| en | Image and video models (the "Generation" tab) | [Guide](../../docs/en/media.md) |
| en | Generating images (`/cpa-image`) | [Guide](../../docs/en/media.md) |
| en | Generating videos (`/cpa-video`) | [Guide](../../docs/en/media.md) |
| en | Editing and extending videos (`/cpa-video-edit`, `/cpa-video-extend`) | [Guide](../../docs/en/media.md) |
| en | Reading plain-language parameters with the chat model | [Guide](../../docs/en/media.md) |
| en | Letting the agent generate (`generate_media` tool, off by default) | [Guide](../../docs/en/media.md) |
| en | The generation-model button next to the composer | [Guide](../../docs/en/media.md) |
| en | Updating this plugin | [Guide](../../docs/en/updates.md) |
| en | Channels, regions and automatic controls | [Guide](../../docs/en/updates.md) |
| en | One-click and automatic updates through the plugin market | [Guide](../../docs/en/updates.md) |
| en | Download, verification and offline upgrade | [Guide](../../docs/en/updates.md) |
| en | Slash commands and HTTP routes | [Guide](../../docs/en/reference.md) |
| en | Slash commands | [Guide](../../docs/en/reference.md) |
| en | HTTP API | [Guide](../../docs/en/reference.md) |
| en | Storage and configuration | [Guide](../../docs/en/storage-and-config.md) |
| en | Upgrading and uninstalling | [Guide](../../docs/en/upgrade-and-uninstall.md) |
| en | FAQ | [Guide](../../docs/en/faq.md) |
| en | AI installation guide | [Guide](../../docs/en/ai-install-guide.md) |
| en | Development | [Guide](../../docs/en/development.md) |
| en | License | [Guide](../../README.en.md) |
