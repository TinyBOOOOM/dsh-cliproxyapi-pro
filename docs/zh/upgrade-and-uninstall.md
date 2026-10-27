中文 | [English](../en/upgrade-and-uninstall.md) · [返回 README](../../README.md)

# 升级与卸载

- **升级**：装有 dshmarket 时，直接在插件更新卡片点 **立即更新**（或开启自动安装），完成后按提示重启 DSH 或刷新页面。没有插件市场时，使用卡片下载校验后的离线包，保存工作并关闭 DSH，再执行卡片的 `dsh plugin --profile '名称' add '离线包绝对路径'` 命令，最后重新启动；无需先卸载。也可在关闭 DSH 后运行 `dsh plugin --profile <profile 名称> add dsh-cliproxyapi-pro@latest` 从 npm 升级。账号、勾选和参数仍保存在原 profile 目录里，密钥仍在凭证服务里；更新下载功能不会改写这些数据。本地链接安装要保留源码方式时应自行更新源码，而不是从离线包重装。
- **卸载**：在 **插件** 页卸载。已同步的模型路由保存在 DSH 设置里，卸载插件不会自动删除它们；想让这些模型一并从选择器消失，请在卸载前把各账号停用或删除。
