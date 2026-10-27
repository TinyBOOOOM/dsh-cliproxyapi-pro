中文 | [English](../en/development.md) · [返回 README](../../README.md)

# 开发

```text
lib/index.js        Host 入口；核心逻辑与 apply 接线
lib/host/           Host 核心逻辑
lib/host/apply/     apply 层接线
lib/media/          生成引擎（barrel：lib/media/index.js）
lib/quota/          额度引擎
lib/updater/        更新引擎
src/client/         Web 界面源码（ModuleLoader：账号页与插件更新页）
lib/client.js       提交到仓库的生成文件；禁止手动编辑
scripts/build-client.mjs 零依赖客户端构建脚本
locale/*.json       插件管理器中显示的标题与描述
cordis.patch.yml    Bundle patch，插入 dsh-cliproxyapi-pro 行
tests/<area>/       node:test 测试：host、media、quota、updater、client
tests/helpers/      共享测试辅助代码
.github/workflows/  CI（测试）与发版（GitHub Release + npm 受信任发布）
assets/screenshots/ README 截图（在 screenshots.json 登记供插件市场展示）
docs/zh/, docs/en/  中英文用户文档
docs/dev/           开发详解；AGENTS.md 为编码 Agent 的入口
```

各目录下的逐文件说明见开发文档（英文）：[Host](../dev/architecture.md#module-map)、[生成](../dev/media.md#module-map)、[额度](../dev/quota.md#module-map)、[更新](../dev/updater.md#module-map)、[客户端](../dev/client.md#module-map)、[测试](../dev/testing.md#test-layout)。修改客户端时编辑 `src/client/`，再运行 `npm run build:client` 重新生成 `lib/client.js`，两者一起提交。

```bash
git clone https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro.git
cd dsh-cliproxyapi-pro
npm run build:client # 从 src/client/ 重建 lib/client.js
npm test             # 运行测试
npm run check        # 语法检查 + 测试
npm run pack:check   # 查看打包文件列表
```

`npm run check` 执行 `node scripts/check.mjs`：语法检查所有 `lib/**/*.js` 与 `scripts/**` 文件，运行 `node scripts/build-client.mjs --check` 检查生成客户端是否过期，再运行 `node --test "tests/**/*.test.mjs"`。测试分在 `tests/host/`、`tests/media/`、`tests/quota/`、`tests/updater/`、`tests/client/`，共享辅助代码在 `tests/helpers/`。更新相关离线测试覆盖设置、SemVer、区域、下载完整性与包结构、HTTP 鉴权与同源、更新卡片与请求生命周期，不访问真实网络或 profile。`npm run pack:check` 应包含 `lib/index.js`、`lib/client.js` 和 `lib/**/*.js` 模块，不包含 `src/`、测试、文档、脚本或截图；无需安装运行时依赖。

发版只需推送 `v<版本号>` 标签：GitHub Actions 会运行测试、创建 GitHub Release 并附上安装包，再通过 npm 受信任发布（不使用任何 token）上传到 npm，并附带来源证明。稳定版本发布到 npm `latest`；Beta / 开发预发布分别进入 `beta` / `dev`，对应 GitHub Release 标记为预发布，不覆盖稳定通道。更新器只核对 registry 提供的 SHA-512 完整性与包结构，不验证发行者签名或 npm provenance。

修改代码前请阅读 [AGENTS.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/AGENTS.md)；变更记录见 [CHANGELOG.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.md)（英文版：[CHANGELOG.en.md](https://github.com/TinyBOOOOM/dsh-cliproxyapi-pro/blob/main/CHANGELOG.en.md)）。欢迎提交 Issue 和 Pull Request，修改说明文档时请同时更新中英文两份。
