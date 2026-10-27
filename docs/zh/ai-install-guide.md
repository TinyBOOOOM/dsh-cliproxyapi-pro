中文 | [English](../en/ai-install-guide.md) · [返回 README](../../README.md)

# 给 AI Agent 的安装指南

> 给 DeepSeek Harness 中的 AI Agent：用户要求安装或配置本插件时按以下步骤执行。本包没有运行时 npm 依赖，安装时无需构建。

1. **安装**：调用 `plugin_manager`：`{"action": "install_bundle", "target": "dsh-cliproxyapi-pro", "enabled": true}`。查看结果中的 `application` 与 `warnings`；`restart-required` 表示需要重启 DSH 后新代码才会运行。
2. **配置**：账号由用户在界面里配置（本插件不提供管理账号的 Agent 工具）。CPA 在本机 `http://127.0.0.1:8317` 且无鉴权时无需配置，插件启动后会自动发现；否则请用户打开 **设置** 左侧导航的 **CLIProxyAPI** 页，点 **+ 添加账号** 并填写服务地址和 API Key，再在 **模型** 标签勾选需要的模型。
3. **验证**：请用户运行 `/cpa-status`，每个启用的账号应为 `connected` 且模型数大于 0。告诉用户模型已出现在 DSH 模型选择器中（按账号名称分组）。

不要向用户索要 API Key，也不要把它写入任何文件；密钥只在设置页填写。
