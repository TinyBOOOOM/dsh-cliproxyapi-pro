中文 | [English](../en/storage-and-config.md) · [返回 README](../../README.md)

# 存储与配置

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
- **生成设置**：独立保存在 `<Profile 目录>/.dsh-cliproxyapi/media-settings.json`，不改动 `state.json`。没有此文件时使用默认值；文件损坏时也使用默认值并在日志中提示，下次保存前会把损坏的文件另存为 `media-settings.corrupt-<时间>.json`。各字段都有作用：`outputDir`（保存位置）、`lastSelection`（上一次选择的模型）、`defaultVideoSeconds` / `defaultVideoResolution`（`/cpa-video` 未指定 `-s` / `-r` 时的默认值）、`agentTool`、`imageConfirm`、`videoConfirm`、`videoBudget`（agent 生成工具的开关、确认方式与秒数上限），以及每个账号的 `disabledModels`（关闭的生成模型）和 `kindOverrides`（手动指定的类型）：

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
