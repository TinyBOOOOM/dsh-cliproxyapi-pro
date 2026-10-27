中文 | [English](../en/accounts-and-models.md) · [返回 README](../../README.md)

# 功能详解

## 自动发现与同步

- 服务地址可以是本地或远程，`/v1`、`/v1/chat/completions`、`/v1/messages` 等后缀会自动去掉。
- 地址留空时，依次尝试：已有路由的地址、环境变量 `CLIPROXYAPI_BASE_URL`、本机 `127.0.0.1:8317`。
- 读取 `/v1/models?client_version=pi` 的富元数据目录（也兼容标准 OpenAI `data[]` 格式），并用 `/v1/models` 的 `owned_by` 判断模型家族、用其中的 `type` 识别生图模型。
- 生图 / 生视频模型不会写入对话路由，见 [生图 / 生视频模型](media.md#生图--生视频模型生成标签页)。
- 所有账号按统一间隔自动刷新（默认 300 秒）；模型目录没有变化时不写入任何设置。

## 模型勾选

- 搜索、家族标签、全部 / 已勾选 / 未勾选切换、批量勾选。**只有勾选的模型会出现在模型选择器中**；勾选为空表示全部显示。
- 还可以用「包含 / 排除关键词」规则进一步过滤。
- 从未保存过勾选的账号，首次探测成功后自动为每个模型家族勾选最新的一个（最多 12 个），按该服务自己的模型目录计算；**恢复推荐精选** 可随时恢复这组勾选。

## 单模型参数覆盖

已勾选模型的 **编辑参数** 可以单独设置：上下文窗口、最大输出、图片输入、思考等级（`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`）和请求协议，也可一键恢复自动探测值。

## 多账号

- 每个账号写入自己的一组路由：第一个账号为 `cli-proxy` / `cli-proxy-responses` / `cli-proxy-messages`，之后依次为 `cli-proxy-2*`、`cli-proxy-3*`……；密钥引用名依次为 `CLI_PROXY_API_KEY`、`CLI_PROXY_API_KEY_2`……。模型选择器按账号名称分组。
- **停用**账号：保留全部配置，但移除它的路由，模型从选择器中消失；其他账号不受影响。
- **新增**账号：「+ 添加账号」先用填写的地址和密钥测试连接，成功才创建并启用；也可以选择「仍然添加（不启用）」。
- 每个账号的页面分 **连接 / 模型 / 生成 / 额度** 四个标签，顶部账号栏对所有标签共用。账号标题旁的「启用」开关立即生效；「⋯」菜单里是「立即探测刷新」和「删除此账号」。
- 连接和模型的改动统一记录，底部出现「有未保存的更改 · 放弃更改 / 保存并应用」；切换账号前会提醒未保存的更改。「测试连接」用正在编辑的地址和密钥探测，不保存任何内容。
- 次要说明收进标签旁的 ⓘ 提示（悬停、键盘聚焦或点击打开）。
- 填写了服务地址的账号**只连接该地址**，连不上就报错，不会悄悄改连本地 `:8317`，避免两个账号指向同一个服务。
- 不同账号的路由 ID 不能重叠，冲突的修改会被拒绝。
- **删除**账号会移除它的路由，但保留凭证服务里的密钥。

## 协议路由

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
