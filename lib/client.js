window.__ModuleLoader__.load({
  id: "dsh-cliproxyapi-pro",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo } = React;

    const PACKAGE_NAME = "dsh-cliproxyapi-pro";
    const MODULE_ID = "dsh-cliproxyapi-pro";
    const NS = "dsh-cliproxyapi-pro";

    // Document-relative API paths (compatible with <base href="./"> in DSH Web/Desktop)
    const API = {
      status: "api/dsh-cliproxyapi/status",
      refresh: "api/dsh-cliproxyapi/refresh",
      save: "api/dsh-cliproxyapi/save",
      addAccount: "api/dsh-cliproxyapi/accounts/add",
      removeAccount: "api/dsh-cliproxyapi/accounts/remove",
    };

    const zh = {
      nav: "CLIProxyAPI",
      title: "CLIProxyAPI 自动发现与模型筛选",
      subtitle:
        "自动连接 CLIProxyAPI 服务，勾选你希望在对话框模型选择器中显示的模型，自动同步上下文长度、视觉与推理档位。",
      statusConnected: "已连接并同步",
      statusProbing: "正在探测同步…",
      statusError: "连接异常",
      statusDisabled: "已停用",
      statusIdle: "等待同步",
      endpointLabel: "当前活动节点",
      endpointNone: "未连接（将依次尝试配置地址与本地 8317 端口）",
      modelsCountLabel: "选择器展示模型",
      refreshedAtLabel: "上次同步时间",
      refreshBtn: "立即探测刷新",
      refreshingBtn: "正在探测…",
      saveBtn: "保存设置并应用",
      savingBtn: "正在应用…",
      saveSelectionBtn: "保存模型勾选",
      unsavedChanges: "有未保存的勾选更改",
      savedToast: "已保存并同步到对话框模型选择器",
      sectionConnection: "连接与认证配置",
      accountsLabel: "账号",
      addAccountBtn: "+ 添加账号",
      addingAccountBtn: "正在添加…",
      removeAccountBtn: "删除此账号",
      removeConfirm: "确定删除账号「{name}」吗？它同步到模型选择器中的模型路由也会一并移除（已保存的密钥不会删除）。",
      noAccounts: "还没有任何账号。点击「添加账号」接入一个 CLIProxyAPI 服务。",
      accountOffBadge: "未启用",
      addedToast: "已添加新账号（默认未启用）。填写服务地址与密钥后，打开「启用此账号」并保存。",
      removedToast: "账号已删除，其模型已从模型选择器中移除",
      disabledHint:
        "该账号未启用，它的模型不会出现在对话框模型选择器中。可先填写地址与密钥并点击「立即探测刷新」预览模型列表，勾选后再开启「启用此账号」。",
      enabledLabel: "启用此账号",
      enabledHint: "开启后将该账号下勾选的模型同步到 DSH 对话框模型选择器；关闭后保留配置，但移除该账号的模型。",
      baseUrlLabel: "CLIProxyAPI 服务地址 (Base URL)",
      baseUrlPlaceholder: "留空则自动继承现有路由或探测 http://127.0.0.1:8317",
      baseUrlHint: "支持填写根地址（如 http://127.0.0.1:8317 或远程 IP:8317），无需手动拼接 /v1。",
      apiKeyLabel: "API Key 密钥",
      apiKeySetPlaceholder: "已配置密钥（留空保持不变，输入新值可覆盖）",
      apiKeyUnsetPlaceholder: "输入 CLIProxyAPI 访问密钥（本地免密模式可留空）",
      apiKeyHint: "密钥通过 DSH 凭证服务安全存储在 .credentials.yaml 中，绝不明文写入配置文件。",
      apiKeyConfiguredBadge: "密钥已配置",
      apiKeyUnsetBadge: "未设置密钥",
      clearKeyBtn: "清除密钥",
      protocolLabel: "接口协议",
      protocolHint: "自动模式下每个模型走所属家族的原生协议，减少 CPA 中转转换；Gemini 等 DSH 不支持原生协议的模型走 OpenAI Chat。",
      protocolAuto: "自动：按模型家族走原生协议（推荐）",
      protocolFixedPrefix: "统一使用：",
      protocolNameCompletions: "OpenAI Chat",
      protocolNameResponses: "OpenAI Responses",
      protocolNameMessages: "Claude Messages",
      modelProtocolLabel: "请求协议",
      modelProtocolDefault: "跟随全局设置",
      modelProtocolHint: "原生协议：",
      sectionAdvanced: "高级路由与规则过滤",
      providerIdLabel: "DSH 路由 ID (Provider)",
      providerIdHint: "写入 llm-pi-ai 的提供商路由标识，每个账号必须不同（首个账号默认 cli-proxy，与现有配置无缝衔接）。",
      apiKeyEnvLabel: "密钥引用名 (Credential Ref)",
      apiKeyEnvHint: "密钥在 DSH 凭证服务中的名称，每个账号建议使用不同的引用名。",
      displayNameLabel: "账号名称 (Display Name)",
      displayNameHint: "用于区分账号，并作为 DSH 对话框模型选择器中的分组名称。",
      includePrefixLabel: "仅包含模型关键词 (可选)",
      includePrefixPlaceholder: "例如: gpt-6, claude-opus, gemini-4 (多个用逗号分隔)",
      includePrefixHint: "附加规则：只允许模型 ID 包含指定关键词的模型。",
      excludePrefixLabel: "排除模型关键词 (可选)",
      excludePrefixPlaceholder: "例如: tts, image, video, zj/ (多个用逗号分隔)",
      excludePrefixHint: "附加规则：排除包含指定关键词的模型 ID。",
      refreshIntervalLabel: "自动刷新间隔 (秒，所有账号共用)",
      sectionModels: "模型显示筛选（仅勾选的模型会在回答选择器中显示）",
      sectionModelsHint:
        "点击模型行即可勾选或取消。不勾选任何模型（全部清空）时默认不限制；勾选后仅展示选中的模型。",
      searchModelsPlaceholder: "搜索模型 ID 或名称（如 claude-opus, gpt-6, gemini-4, swe）…",
      filterAll: "全部发现",
      filterSelected: "已勾选",
      filterUnselected: "未勾选",
      familyAll: "全部家族",
      selectAllVisibleBtn: "全选当前列表",
      deselectAllVisibleBtn: "取消当前列表",
      selectRecommendedBtn: "恢复推荐精选 (7个)",
      badgeVision: "视觉 Image",
      badgeReasoning: "推理",
       badgeSelected: "已启用",
      contextWindowTag: "上下文",
      noModelsText: "未找到匹配的模型。请检查搜索条件或点击上方「立即探测刷新」。",
      editParamsBtn: "编辑参数",
      editingParamsBtn: "收起参数",
      customParamsBadge: "已自定义",
      contextWindowLabel: "上下文窗口 (tokens)",
      maxTokensLabel: "最大输出 (tokens)",
      imageInputLabel: "支持图片输入",
      reasoningLevelsLabel: "思考等级",
      resetParamsBtn: "恢复自动探测",
      paramsHint: "留空并保存即恢复 CLIProxyAPI 自动探测值。修改后请点击「保存模型勾选」才会写入模型选择器。",
      discoveredValue: "探测值",
    };

    const en = {
      nav: "CLIProxyAPI",
      title: "CLIProxyAPI Auto-Discovery & Model Filter",
      subtitle:
        "Connect to CLIProxyAPI and check the exact models you want displayed in the DSH conversation model picker.",
      statusConnected: "Connected & Synced",
      statusProbing: "Probing…",
      statusError: "Connection Error",
      statusDisabled: "Disabled",
      statusIdle: "Idle",
      endpointLabel: "Active Endpoint",
      endpointNone: "Not connected (tries configured URL then localhost:8317)",
      modelsCountLabel: "Models in Picker",
      refreshedAtLabel: "Last Synced",
      refreshBtn: "Probe & Refresh",
      refreshingBtn: "Probing…",
      saveBtn: "Save & Apply",
      savingBtn: "Applying…",
      saveSelectionBtn: "Apply Selected Models",
      unsavedChanges: "Unsaved selection changes",
      savedToast: "Saved and synchronized to the DSH model picker",
      sectionConnection: "Connection & Authentication",
      accountsLabel: "Accounts",
      addAccountBtn: "+ Add Account",
      addingAccountBtn: "Adding…",
      removeAccountBtn: "Delete Account",
      removeConfirm: "Delete account \"{name}\"? Its model routes are removed from the model picker too (the stored key is kept).",
      noAccounts: "No accounts yet. Click Add Account to connect a CLIProxyAPI server.",
      accountOffBadge: "Off",
      addedToast: "Account added (disabled). Fill in its URL and key, then turn on Enable This Account and save.",
      removedToast: "Account deleted and its models removed from the picker",
      disabledHint:
        "This account is disabled, so its models are not in the model picker. Fill in URL and key, click Probe & Refresh to preview its models, check the ones you want, then turn on Enable This Account.",
      enabledLabel: "Enable This Account",
      enabledHint: "Sync this account's checked models into the DSH model selector. Turning it off keeps the settings but removes its models.",
      baseUrlLabel: "CLIProxyAPI Base URL",
      baseUrlPlaceholder: "Leave blank to inherit existing route or auto-discover 127.0.0.1:8317",
      baseUrlHint: "Root URL (e.g. http://127.0.0.1:8317); /v1 is handled automatically.",
      apiKeyLabel: "API Key",
      apiKeySetPlaceholder: "Key is stored (leave blank to keep, or type a new key)",
      apiKeyUnsetPlaceholder: "Enter CLIProxyAPI Bearer key (optional for local no-auth)",
      apiKeyHint: "Stored securely via DSH credentials service, never in plain settings.",
      apiKeyConfiguredBadge: "Configured",
      apiKeyUnsetBadge: "Not Set",
      clearKeyBtn: "Clear Key",
      protocolLabel: "Wire Protocol",
      protocolHint: "Auto sends each model over its family's own protocol to avoid CPA translation; models DSH cannot speak natively (such as Gemini) use OpenAI Chat.",
      protocolAuto: "Auto: native protocol per model family (recommended)",
      protocolFixedPrefix: "Always use: ",
      protocolNameCompletions: "OpenAI Chat",
      protocolNameResponses: "OpenAI Responses",
      protocolNameMessages: "Claude Messages",
      modelProtocolLabel: "Request Protocol",
      modelProtocolDefault: "Follow global setting",
      modelProtocolHint: "Native protocol: ",
      sectionAdvanced: "Advanced Routing & Keyword Rules",
      providerIdLabel: "Provider Route ID",
      providerIdHint: "Provider key under llm-pi-ai; must differ per account (first account: cli-proxy).",
      apiKeyEnvLabel: "Credential Ref",
      apiKeyEnvHint: "Name of the key in the DSH credentials service; use a distinct one per account.",
      displayNameLabel: "Account Name",
      displayNameHint: "Tells accounts apart and titles their group in the DSH model selector.",
      includePrefixLabel: "Include Filter (optional)",
      includePrefixPlaceholder: "e.g. gpt-6, claude-opus, gemini-4 (comma-separated)",
      includePrefixHint: "Additional rule: only sync models matching these substrings.",
      excludePrefixLabel: "Exclude Filter (optional)",
      excludePrefixPlaceholder: "e.g. tts, image, video, zj/ (comma-separated)",
      excludePrefixHint: "Additional rule: hide models matching any of these substrings.",
      refreshIntervalLabel: "Auto Refresh Interval (s, all accounts)",
      sectionModels: "Model Picker Filter (Only checked models appear in DSH)",
      sectionModelsHint:
        "Click any model row to toggle selection. Only checked models will be shown in the conversation model selector.",
      searchModelsPlaceholder: "Search model ID or name (e.g. claude-opus, gpt-6, gemini-4)…",
      filterAll: "All Discovered",
      filterSelected: "Checked",
      filterUnselected: "Unchecked",
      familyAll: "All Families",
      selectAllVisibleBtn: "Check Visible",
      deselectAllVisibleBtn: "Uncheck Visible",
      selectRecommendedBtn: "Reset to Curated (7)",
      badgeVision: "Image",
      badgeReasoning: "Reasoning",
      badgeSelected: "Active",
      contextWindowTag: "Context",
      noModelsText: "No matching models found. Check your filter or click Probe & Refresh.",
      editParamsBtn: "Edit Parameters",
      editingParamsBtn: "Hide Parameters",
      customParamsBadge: "Custom",
      contextWindowLabel: "Context Window (tokens)",
      maxTokensLabel: "Max Output (tokens)",
      imageInputLabel: "Image Input",
      reasoningLevelsLabel: "Thinking Levels",
      resetParamsBtn: "Reset to Discovered",
      paramsHint: "Clear a value and save to restore the value discovered from CLIProxyAPI. Click Apply Selected Models to write changes to the picker.",
      discoveredValue: "Discovered",
    };

    const RECOMMENDED_MODELS = [
      "gpt-6-astra",
      "gpt-6.1-sol",
      "grok-4.7",
      "devin/claude-opus-5-5",
      "devin/gemini-4-argon",
      "devin/swe-2",
      "devin/claude-sonnet-5-5",
    ];

    const CSS = `
.dcpa-wrap {
  max-width: 760px;
  color: var(--dsw-alias-label-primary);
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  line-height: 20px;
}
.dcpa-card {
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dcpa-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.dcpa-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dcpa-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-status-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
}
.dcpa-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 12px;
}
.dcpa-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex: none;
}
.dcpa-dot-connected { background: var(--dsw-alias-state-success-primary); }
.dcpa-dot-probing { background: var(--dsw-alias-brand-primary); }
.dcpa-dot-error { background: var(--dsw-alias-state-error-primary); }
.dcpa-dot-idle { background: var(--dsw-alias-state-idle-primary); }
.dcpa-meta-item {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dcpa-meta-val {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.dcpa-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dcpa-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .dcpa-grid { grid-template-columns: 1fr; }
}
.dcpa-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dcpa-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dcpa-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dcpa-hint {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-input, .dcpa-select {
  width: 100%;
  box-sizing: border-box;
  height: 34px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  outline: none;
}
.dcpa-input:focus, .dcpa-select:focus {
  border-color: var(--dsw-alias-brand-primary);
}
.dcpa-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dcpa-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  background: var(--dsw-alias-state-idle-primary);
  padding: 2px;
  transition: background 0.15s ease;
  flex: none;
}
.dcpa-switch[aria-checked="true"] {
  background: var(--dsw-alias-brand-primary);
}
.dcpa-switch-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  transition: transform 0.15s ease;
}
.dcpa-switch[aria-checked="true"] .dcpa-switch-thumb {
  transform: translateX(16px);
}
.dcpa-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dcpa-btn {
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.dcpa-btn:hover:not(:disabled) {
  border-color: var(--dsw-alias-brand-primary);
}
.dcpa-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dcpa-btn-primary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: var(--dsw-alias-bg-base);
}
.dcpa-btn-sm {
  height: 26px;
  padding: 0 9px;
  font-size: 11px;
  border-radius: 6px;
}
.dcpa-seg {
  display: inline-flex;
  border-radius: 8px;
  padding: 2px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  gap: 2px;
}
.dcpa-seg-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 6px;
  cursor: pointer;
}
.dcpa-seg-btn[data-active="true"] {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.dcpa-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.dcpa-family-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dcpa-chip {
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  border-radius: 999px;
  padding: 2px 9px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dcpa-chip[data-active="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
}
.dcpa-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}
.dcpa-badge-ok {
  color: var(--dsw-alias-state-success-primary);
  border-color: var(--dsw-alias-state-success-primary);
}
.dcpa-badge-warn {
  color: var(--dsw-alias-state-warn-primary);
  border-color: var(--dsw-alias-state-warn-primary);
}
.dcpa-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
}
.dcpa-success {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary);
}
.dcpa-model-list {
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;
}
.dcpa-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 11px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  cursor: pointer;
  user-select: none;
  flex-wrap: wrap;
  transition: border-color 0.12s ease;
}
.dcpa-model-row:hover {
  border-color: var(--dsw-alias-border-l2);
}
.dcpa-model-row[data-checked="true"] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-base);
}
.dcpa-model-left {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.dcpa-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--dsw-alias-bg-base);
  font-size: 11px;
  font-weight: 700;
}
.dcpa-model-row[data-checked="true"] .dcpa-checkbox {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}
.dcpa-model-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.dcpa-model-name {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  margin-left: 6px;
}
.dcpa-model-tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dcpa-model-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.dcpa-edit-btn {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}
.dcpa-edit-btn:hover, .dcpa-edit-btn[data-active="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
.dcpa-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
}
.dcpa-level-list {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dcpa-level {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-account-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dcpa-account-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dcpa-account-chip[data-active="true"] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-base);
  font-weight: 600;
}
.dcpa-account-chip[data-enabled="false"] {
  color: var(--dsw-alias-label-secondary);
}
.dcpa-btn-danger {
  color: var(--dsw-alias-state-error-primary);
}
.dcpa-btn-danger:hover:not(:disabled) {
  border-color: var(--dsw-alias-state-error-primary);
}
`;

    const REASONING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const PROTOCOL_NAME_KEYS = {
      "openai-completions": "protocolNameCompletions",
      "openai-responses": "protocolNameResponses",
      "anthropic-messages": "protocolNameMessages",
    };
    const PROTOCOLS = Object.keys(PROTOCOL_NAME_KEYS);

    function cloneOverrides(value) {
      const out = {};
      for (const [id, entry] of Object.entries(value ?? {})) {
        out[id] = {
          ...entry,
          ...(Array.isArray(entry.reasoningLevels) ? { reasoningLevels: [...entry.reasoningLevels] } : {}),
        };
      }
      return out;
    }

    function overridesKey(value) {
      return JSON.stringify(value ?? {});
    }

    function formatTokens(n) {
      if (typeof n !== "number" || !Number.isFinite(n)) return "";
      if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
      if (n >= 1000) return `${Math.round(n / 1000)}K`;
      return String(n);
    }

    async function postJson(url, body) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await res.json();
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      return payload;
    }

    function stateDotClass(state) {
      return state === "connected"
        ? "dcpa-dot dcpa-dot-connected"
        : state === "probing"
        ? "dcpa-dot dcpa-dot-probing"
        : state === "error"
        ? "dcpa-dot dcpa-dot-error"
        : "dcpa-dot dcpa-dot-idle";
    }

    /**
     * Account list + switcher. Each account is edited in its own
     * {@link AccountPanel}, remounted when the selection changes.
     */
    function CpaSettingsPanel({ t }) {
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(null); // null | "refresh" | "save" | "add" | "remove"
      const [error, setError] = useState(null);
      const [toast, setToast] = useState(null);
      const [data, setData] = useState(null);
      const [activeId, setActiveId] = useState(null);
      // Bumped whenever the server's saved config should replace the drafts.
      const [rev, setRev] = useState(0);

      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

      const fetchStatus = useCallback(async () => {
        try {
          const res = await fetch(API.status, { cache: "no-store" });
          const body = await res.json();
          if (!res.ok || body.ok === false) {
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          setData(body);
          setRev((r) => r + 1);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        void fetchStatus();
      }, [fetchStatus]);

      const run = useCallback(async (kind, fn) => {
        setBusy(kind);
        setError(null);
        setToast(null);
        try {
          return await fn();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          return undefined;
        } finally {
          setBusy(null);
        }
      }, []);

      const onRefresh = useCallback(
        (accountId) =>
          run("refresh", async () => {
            setData(await postJson(API.refresh, { accountId }));
          }),
        [run]
      );

      const onSave = useCallback(
        (accountId, payload) =>
          run("save", async () => {
            setData(await postJson(API.save, { ...payload, accountId }));
            setRev((r) => r + 1);
            setToast(t("savedToast"));
          }),
        [run, t]
      );

      const onAdd = useCallback(
        () =>
          run("add", async () => {
            const body = await postJson(API.addAccount, {});
            setData(body);
            if (body.createdId) setActiveId(body.createdId);
            setRev((r) => r + 1);
            setToast(t("addedToast"));
          }),
        [run, t]
      );

      const onRemove = useCallback(
        (account) => {
          const name = account.config?.displayName || account.id;
          if (typeof window !== "undefined" && !window.confirm(t("removeConfirm").replace("{name}", name))) {
            return;
          }
          void run("remove", async () => {
            const body = await postJson(API.removeAccount, { accountId: account.id });
            setData(body);
            setActiveId(body.accounts?.[0]?.id ?? null);
            setRev((r) => r + 1);
            setToast(t("removedToast"));
          });
        },
        [run, t]
      );

      return h(
        "div",
        { className: "dcpa-wrap", "data-dsh-plugin": MODULE_ID },
        h(
          "div",
          { className: "dcpa-card" },
          h(
            "div",
            { className: "dcpa-head" },
            h(
              "div",
              null,
              h("h3", { className: "dcpa-title" }, t("title")),
              h("p", { className: "dcpa-subtitle" }, t("subtitle"))
            )
          ),
          h(
            "div",
            { className: "dcpa-account-bar", role: "tablist", "aria-label": t("accountsLabel") },
            accounts.map((a) =>
              h(
                "button",
                {
                  key: a.id,
                  type: "button",
                  role: "tab",
                  className: "dcpa-account-chip",
                  "aria-selected": active?.id === a.id,
                  "data-active": active?.id === a.id ? "true" : "false",
                  "data-enabled": a.config?.enabled === false ? "false" : "true",
                  title: a.config?.provider,
                  onClick: () => setActiveId(a.id),
                },
                h("span", { className: stateDotClass(a.status?.state) }),
                a.config?.displayName || a.id,
                a.config?.enabled === false
                  ? h("span", { className: "dcpa-badge" }, t("accountOffBadge"))
                  : null
              )
            ),
            h(
              "button",
              {
                type: "button",
                className: "dcpa-btn dcpa-btn-sm",
                disabled: busy !== null || loading,
                onClick: onAdd,
              },
              busy === "add" ? t("addingAccountBtn") : t("addAccountBtn")
            )
          ),
          !loading && accounts.length === 0 ? h("p", { className: "dcpa-hint" }, t("noAccounts")) : null,
          error ? h("p", { className: "dcpa-error", role: "alert" }, error) : null,
          toast ? h("p", { className: "dcpa-success", role: "status" }, toast) : null
        ),
        active
          ? h(AccountPanel, {
              key: active.id,
              t,
              account: active,
              global: data?.global ?? {},
              rev,
              busy,
              onRefresh: () => onRefresh(active.id),
              onSave: (payload) => onSave(active.id, payload),
              onRemove: () => onRemove(active),
            })
          : null
      );
    }

    function AccountPanel({ t, account, global, rev, busy, onRefresh, onSave: saveAccount, onRemove }) {
      const syncing = busy === "refresh";
      const saving = busy === "save";
      const loading = busy === "add" || busy === "remove";

      // Model filter UI state
      const [search, setSearch] = useState("");
      const [tabFilter, setTabFilter] = useState("all"); // "all" | "selected" | "unselected"
      const [familyFilter, setFamilyFilter] = useState("all");
      const [selectedIds, setSelectedIds] = useState(() => new Set());
      const [savedIdsKey, setSavedIdsKey] = useState("");
      const [modelOverrides, setModelOverrides] = useState({});
      const [savedOverridesKey, setSavedOverridesKey] = useState("{}");
      const [editingId, setEditingId] = useState(null);

      // Form draft state
      const [enabled, setEnabled] = useState(true);
      const [baseURL, setBaseURL] = useState("");
      const [apiKeyDraft, setApiKeyDraft] = useState("");
      // "auto" or the protocol every model is fixed to.
      const [protocol, setProtocol] = useState("auto");
      const [provider, setProvider] = useState("cli-proxy");
      const [displayName, setDisplayName] = useState("CLI Proxy API");
      const [apiKeyEnv, setApiKeyEnv] = useState("CLI_PROXY_API_KEY");
      const [includePrefix, setIncludePrefix] = useState("");
      const [excludePrefix, setExcludePrefix] = useState("");
      const [refreshIntervalSeconds, setRefreshIntervalSeconds] = useState("300");
      const [probeTimeoutMs, setProbeTimeoutMs] = useState("5000");

      // Load the drafts from the saved config on mount and after every save.
      useEffect(() => {
        const c = account.config ?? {};
        setEnabled(c.enabled !== false);
        setBaseURL(c.baseURL ?? "");
        setProtocol(c.protocolMode === "fixed" ? c.protocol ?? "openai-completions" : "auto");
        setProvider(c.provider ?? "cli-proxy");
        setDisplayName(c.displayName ?? "CLI Proxy API");
        setApiKeyEnv(c.effectiveApiKeyEnv ?? c.apiKeyEnv ?? "CLI_PROXY_API_KEY");
        setIncludePrefix(c.includePrefix ?? "");
        setExcludePrefix(c.excludePrefix ?? "");
        setRefreshIntervalSeconds(String(global?.refreshIntervalSeconds ?? 300));
        setProbeTimeoutMs(String(global?.probeTimeoutMs ?? 5000));
        setApiKeyDraft("");

        const sel = Array.isArray(c.selectedModels)
          ? c.selectedModels
          : Array.isArray(account.status?.models)
          ? account.status.models.map((m) => m.id)
          : [];
        const nextSet = new Set(sel);
        setSelectedIds(nextSet);
        setSavedIdsKey([...nextSet].sort().join("\0"));
        const nextOverrides = cloneOverrides(c.modelOverrides);
        setModelOverrides(nextOverrides);
        setSavedOverridesKey(overridesKey(nextOverrides));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [rev]);

      const onRefreshNow = onRefresh;

      const onSave = useCallback(
        (clearKey = false) =>
          saveAccount({
            enabled,
            baseURL: baseURL.trim(),
            protocolMode: protocol === "auto" ? "auto" : "fixed",
            ...(protocol === "auto" ? {} : { protocol }),
            provider: provider.trim() || account.config?.provider || "cli-proxy",
            displayName: displayName.trim() || account.config?.displayName || "CLI Proxy API",
            apiKeyEnv: apiKeyEnv.trim() || account.config?.apiKeyEnv || "CLI_PROXY_API_KEY",
            includePrefix: includePrefix.trim(),
            excludePrefix: excludePrefix.trim(),
            selectedModels: [...selectedIds],
            modelOverrides,
            refreshIntervalSeconds: Math.max(15, Number(refreshIntervalSeconds) || 300),
            probeTimeoutMs: Math.max(250, Number(probeTimeoutMs) || 5000),
            ...(apiKeyDraft.trim() !== "" ? { apiKey: apiKeyDraft.trim() } : {}),
            ...(clearKey ? { clearApiKey: true } : {}),
          }),
        [
          saveAccount,
          account,
          selectedIds,
          modelOverrides,
          enabled,
          baseURL,
          protocol,
          provider,
          displayName,
          apiKeyEnv,
          includePrefix,
          excludePrefix,
          refreshIntervalSeconds,
          probeTimeoutMs,
          apiKeyDraft,
        ]
      );

      const st = account.status ?? { state: "idle", modelCount: 0, models: [], allModels: [] };
      const cred = account.credential ?? { configured: false, ref: apiKeyEnv };
      const effectiveUrl = account.config?.effectiveBaseURL || "";

      const allModels = useMemo(() => {
        if (Array.isArray(st.allModels) && st.allModels.length > 0) return st.allModels;
        if (Array.isArray(st.models)) return st.models;
        return [];
      }, [st.allModels, st.models]);

      const families = useMemo(() => {
        const counts = new Map();
        for (const m of allModels) {
          const fam = m.family || "other";
          counts.set(fam, (counts.get(fam) ?? 0) + 1);
        }
        return [...counts.entries()];
      }, [allModels]);

      const visibleModels = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allModels.filter((m) => {
          const isChecked = selectedIds.has(m.id);
          if (tabFilter === "selected" && !isChecked) return false;
          if (tabFilter === "unselected" && isChecked) return false;
          if (familyFilter !== "all" && (m.family || "other") !== familyFilter) return false;
          if (q) {
            const matchId = String(m.id).toLowerCase().includes(q);
            const matchName = String(m.name ?? "").toLowerCase().includes(q);
            if (!matchId && !matchName) return false;
          }
          return true;
        });
      }, [allModels, search, tabFilter, familyFilter, selectedIds]);

      const currentIdsKey = useMemo(() => [...selectedIds].sort().join("\0"), [selectedIds]);
      const currentOverridesKey = useMemo(() => overridesKey(modelOverrides), [modelOverrides]);
      const selectionDirty =
        (savedIdsKey !== "" && currentIdsKey !== savedIdsKey) ||
        currentOverridesKey !== savedOverridesKey;

      const toggleModel = useCallback((id) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const checkVisible = useCallback(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const m of visibleModels) next.add(m.id);
          return next;
        });
      }, [visibleModels]);

      const uncheckVisible = useCallback(() => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const m of visibleModels) next.delete(m.id);
          return next;
        });
      }, [visibleModels]);

      const resetRecommended = useCallback(() => {
        const next = new Set(RECOMMENDED_MODELS);
        setSelectedIds(next);
      }, []);

      const updateOverride = useCallback((model, patch) => {
        setModelOverrides((prev) => {
          const next = cloneOverrides(prev);
          const discovered = model.discovered ?? {};
          const current = {
            contextWindow: discovered.contextWindow,
            maxTokens: discovered.maxTokens,
            image: discovered.image === true,
            reasoningLevels: Array.isArray(discovered.reasoningLevels) ? [...discovered.reasoningLevels] : [],
            ...(next[model.id] ?? {}),
          };
          const merged = { ...current, ...patch };
          const normalized = {};
          if (
            Number.isInteger(merged.contextWindow) &&
            merged.contextWindow > 0 &&
            merged.contextWindow !== discovered.contextWindow
          ) {
            normalized.contextWindow = merged.contextWindow;
          }
          if (
            Number.isInteger(merged.maxTokens) &&
            merged.maxTokens > 0 &&
            merged.maxTokens !== discovered.maxTokens
          ) {
            normalized.maxTokens = merged.maxTokens;
          }
          if (merged.image !== discovered.image) normalized.image = merged.image === true;
          const discoveredLevels = Array.isArray(discovered.reasoningLevels) ? discovered.reasoningLevels : [];
          const levels = Array.isArray(merged.reasoningLevels) ? merged.reasoningLevels : [];
          if (levels.join("\0") !== discoveredLevels.join("\0")) normalized.reasoningLevels = levels;
          if (PROTOCOLS.includes(merged.protocol)) normalized.protocol = merged.protocol;
          if (Object.keys(normalized).length === 0) delete next[model.id];
          else next[model.id] = normalized;
          return next;
        });
      }, []);

      // The protocol a model would use with the panel's current draft settings.
      const effectiveProtocol = useCallback(
        (m) =>
          modelOverrides[m.id]?.protocol ??
          (protocol === "auto" ? m.nativeProtocol ?? "openai-completions" : protocol),
        [modelOverrides, protocol]
      );
      const protocolName = (p) => t(PROTOCOL_NAME_KEYS[p] ?? "protocolNameCompletions");

      const resetOverride = useCallback((id) => {
        setModelOverrides((prev) => {
          const next = cloneOverrides(prev);
          delete next[id];
          return next;
        });
      }, []);

      const dotClass = stateDotClass(st.state);

      const stateLabel =
        st.state === "connected"
          ? t("statusConnected")
          : st.state === "probing"
          ? t("statusProbing")
          : st.state === "error"
          ? t("statusError")
          : st.state === "disabled"
          ? t("statusDisabled")
          : t("statusIdle");

      return h(
        React.Fragment,
        null,
        // 1. Account Status Card
        h(
          "div",
          { className: "dcpa-card" },
          h(
            "div",
            { className: "dcpa-head" },
            h(
              "div",
              null,
              h("h4", { className: "dcpa-section-title" }, account.config?.displayName || account.id),
              h(
                "p",
                { className: "dcpa-hint" },
                `${t("providerIdLabel")}: ${account.config?.provider ?? ""}`
              )
            ),
            h(
              "div",
              { className: "dcpa-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn",
                  disabled: syncing || saving || loading,
                  onClick: onRefreshNow,
                },
                syncing ? t("refreshingBtn") : t("refreshBtn")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-primary",
                  disabled: saving || syncing || loading,
                  onClick: () => onSave(false),
                },
                saving ? t("savingBtn") : t("saveBtn")
              )
            )
          ),
          h(
            "div",
            { className: "dcpa-status-bar" },
            h(
              "span",
              { className: "dcpa-status-pill" },
              h("span", { className: dotClass }),
              stateLabel
            ),
            h(
              "span",
              { className: "dcpa-meta-item" },
              `${t("endpointLabel")}:`,
              h(
                "span",
                { className: "dcpa-meta-val" },
                st.endpoint || effectiveUrl || t("endpointNone")
              )
            ),
            h(
              "span",
              { className: "dcpa-meta-item" },
              `${t("modelsCountLabel")}:`,
              h(
                "span",
                { className: "dcpa-meta-val" },
                `${st.modelCount ?? 0} / ${st.totalDiscovered ?? allModels.length}`
              )
            )
          ),
          account.config?.enabled === false ? h("p", { className: "dcpa-hint" }, t("disabledHint")) : null,
          st.error ? h("p", { className: "dcpa-error", role: "alert" }, st.error) : null
        ),

        // 2. Interactive Model Selection Filter Card
        h(
          "div",
          { className: "dcpa-card" },
          h(
            "div",
            { className: "dcpa-head" },
            h(
              "div",
              null,
              h(
                "h4",
                { className: "dcpa-section-title" },
                `${t("sectionModels")} (${selectedIds.size} / ${allModels.length})`
              ),
              h("p", { className: "dcpa-hint" }, t("sectionModelsHint"))
            ),
            h(
              "div",
              { className: "dcpa-actions" },
              selectionDirty
                ? h("span", { className: "dcpa-badge dcpa-badge-warn" }, t("unsavedChanges"))
                : null,
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-primary dcpa-btn-sm",
                  disabled: saving || syncing,
                  onClick: () => onSave(false),
                },
                saving ? t("savingBtn") : t("saveSelectionBtn")
              )
            )
          ),

          // Search + Segmented Filter + Batch Actions
          h(
            "div",
            { className: "dcpa-toolbar" },
            h(
              "div",
              { className: "dcpa-seg" },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "all" ? "true" : "false",
                  onClick: () => setTabFilter("all"),
                },
                `${t("filterAll")} (${allModels.length})`
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "selected" ? "true" : "false",
                  onClick: () => setTabFilter("selected"),
                },
                `${t("filterSelected")} (${selectedIds.size})`
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "unselected" ? "true" : "false",
                  onClick: () => setTabFilter("unselected"),
                },
                `${t("filterUnselected")} (${Math.max(0, allModels.length - selectedIds.size)})`
              )
            ),
            h(
              "div",
              { className: "dcpa-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  onClick: checkVisible,
                },
                t("selectAllVisibleBtn")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  onClick: uncheckVisible,
                },
                t("deselectAllVisibleBtn")
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-btn dcpa-btn-sm",
                  onClick: resetRecommended,
                },
                t("selectRecommendedBtn")
              )
            )
          ),

          // Family Quick Chips
          families.length > 1
            ? h(
                "div",
                { className: "dcpa-family-chips" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-chip",
                    "data-active": familyFilter === "all" ? "true" : "false",
                    onClick: () => setFamilyFilter("all"),
                  },
                  t("familyAll")
                ),
                families.map(([fam, count]) =>
                  h(
                    "button",
                    {
                      key: fam,
                      type: "button",
                      className: "dcpa-chip",
                      "data-active": familyFilter === fam ? "true" : "false",
                      onClick: () => setFamilyFilter(familyFilter === fam ? "all" : fam),
                    },
                    `${fam.toUpperCase()} (${count})`
                  )
                )
              )
            : null,

          h("input", {
            type: "text",
            className: "dcpa-input",
            value: search,
            placeholder: t("searchModelsPlaceholder"),
            onChange: (e) => setSearch(e.target.value),
          }),

          visibleModels.length === 0
            ? h("p", { className: "dcpa-hint" }, t("noModelsText"))
            : h(
                "div",
                { className: "dcpa-model-list" },
                visibleModels.map((m) => {
                  const checked = selectedIds.has(m.id);
                  const editing = editingId === m.id;
                  const hasOverride = modelOverrides[m.id] !== undefined;
                  const discovered = m.discovered ?? {};
                  const draft = {
                    contextWindow: discovered.contextWindow ?? m.contextWindow,
                    maxTokens: discovered.maxTokens ?? m.maxTokens,
                    image: discovered.image === true,
                    reasoningLevels: Array.isArray(discovered.reasoningLevels) ? discovered.reasoningLevels : [],
                    ...(modelOverrides[m.id] ?? {}),
                  };
                  return h(
                    "div",
                    {
                      key: m.id,
                      className: "dcpa-model-row",
                      "data-checked": checked ? "true" : "false",
                    },
                    h(
                      "div",
                      { className: "dcpa-model-main" },
                      h(
                        "div",
                        {
                          className: "dcpa-model-left",
                          role: "checkbox",
                          "aria-checked": checked,
                          tabIndex: 0,
                          onClick: () => toggleModel(m.id),
                          onKeyDown: (e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleModel(m.id);
                            }
                          },
                        },
                        h("span", { className: "dcpa-checkbox" }, checked ? "✓" : ""),
                        h(
                          "div",
                          null,
                          h("span", { className: "dcpa-model-id" }, m.id),
                          m.name && m.name !== m.id
                            ? h("span", { className: "dcpa-model-name" }, `(${m.name})`)
                            : null
                        )
                      ),
                      h(
                        "div",
                        { className: "dcpa-model-tags" },
                        hasOverride
                          ? h("span", { className: "dcpa-badge dcpa-badge-warn" }, t("customParamsBadge"))
                          : null,
                        checked
                          ? h("span", { className: "dcpa-badge" }, protocolName(effectiveProtocol(m)))
                          : null,
                        m.image
                          ? h("span", { className: "dcpa-badge dcpa-badge-ok" }, t("badgeVision"))
                          : null,
                        m.reasoning
                          ? h(
                              "span",
                              { className: "dcpa-badge" },
                              `${t("badgeReasoning")}${
                                Array.isArray(m.reasoningLevels) && m.reasoningLevels.length > 0
                                  ? `: ${m.reasoningLevels.join("/")}`
                                  : ""
                              }`
                            )
                          : null,
                        m.contextWindow
                          ? h(
                              "span",
                              { className: "dcpa-badge" },
                              `${t("contextWindowTag")} ${formatTokens(m.contextWindow)}`
                            )
                          : null,
                        checked
                          ? h(
                              "button",
                              {
                                type: "button",
                                className: "dcpa-edit-btn",
                                "data-active": editing ? "true" : "false",
                                onClick: () => setEditingId(editing ? null : m.id),
                              },
                              editing ? t("editingParamsBtn") : t("editParamsBtn")
                            )
                          : null
                      )
                    ),
                    checked && editing
                      ? h(
                          "div",
                          { className: "dcpa-editor" },
                          h(
                            "div",
                            { className: "dcpa-grid" },
                            h(
                              "div",
                              { className: "dcpa-field" },
                              h("label", { className: "dcpa-label" }, t("contextWindowLabel")),
                              h("input", {
                                type: "number",
                                min: "1",
                                className: "dcpa-input",
                                value: draft.contextWindow ?? "",
                                onChange: (e) => {
                                  const value = Number(e.target.value);
                                  if (Number.isInteger(value) && value > 0) {
                                    updateOverride(m, { contextWindow: value });
                                  }
                                },
                              }),
                              h(
                                "p",
                                { className: "dcpa-hint" },
                                `${t("discoveredValue")}: ${formatTokens(m.discovered?.contextWindow)}`
                              )
                            ),
                            h(
                              "div",
                              { className: "dcpa-field" },
                              h("label", { className: "dcpa-label" }, t("maxTokensLabel")),
                              h("input", {
                                type: "number",
                                min: "1",
                                className: "dcpa-input",
                                value: draft.maxTokens ?? "",
                                onChange: (e) => {
                                  const value = Number(e.target.value);
                                  if (Number.isInteger(value) && value > 0) {
                                    updateOverride(m, { maxTokens: value });
                                  }
                                },
                              }),
                              h(
                                "p",
                                { className: "dcpa-hint" },
                                `${t("discoveredValue")}: ${formatTokens(m.discovered?.maxTokens)}`
                              )
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-switch-row" },
                            h("div", { className: "dcpa-label" }, t("imageInputLabel")),
                            h(
                              "button",
                              {
                                type: "button",
                                role: "switch",
                                className: "dcpa-switch",
                                "aria-checked": draft.image === true,
                                "aria-label": t("imageInputLabel"),
                                onClick: () => updateOverride(m, { image: draft.image !== true }),
                              },
                              h("span", { className: "dcpa-switch-thumb" })
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-field" },
                            h("label", { className: "dcpa-label" }, t("reasoningLevelsLabel")),
                            h(
                              "div",
                              { className: "dcpa-level-list" },
                              REASONING_LEVELS.map((level) => {
                                const active = draft.reasoningLevels.includes(level);
                                return h(
                                  "label",
                                  { key: level, className: "dcpa-level" },
                                  h("input", {
                                    type: "checkbox",
                                    checked: active,
                                    onChange: () => {
                                      const current = draft.reasoningLevels;
                                      const next = active
                                        ? current.filter((item) => item !== level)
                                        : [...current, level];
                                      updateOverride(m, {
                                        reasoningLevels: REASONING_LEVELS.filter((item) => next.includes(item)),
                                      });
                                    },
                                  }),
                                  level
                                );
                              })
                            )
                          ),
                          h(
                            "div",
                            { className: "dcpa-field" },
                            h("label", { className: "dcpa-label" }, t("modelProtocolLabel")),
                            h(
                              "select",
                              {
                                className: "dcpa-select",
                                value: modelOverrides[m.id]?.protocol ?? "",
                                onChange: (e) => updateOverride(m, { protocol: e.target.value || undefined }),
                              },
                              h("option", { value: "" }, t("modelProtocolDefault")),
                              PROTOCOLS.map((p) => h("option", { key: p, value: p }, protocolName(p)))
                            ),
                            h(
                              "p",
                              { className: "dcpa-hint" },
                              `${t("modelProtocolHint")}${protocolName(m.nativeProtocol ?? "openai-completions")}`
                            )
                          ),
                          h("p", { className: "dcpa-hint" }, t("paramsHint")),
                          hasOverride
                            ? h(
                                "div",
                                null,
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    className: "dcpa-btn dcpa-btn-sm",
                                    onClick: () => resetOverride(m.id),
                                  },
                                  t("resetParamsBtn")
                                )
                              )
                            : null
                        )
                      : null
                  );
                })
              )
        ),

        // 3. Connection & Auth Card
        h(
          "div",
          { className: "dcpa-card" },
          h("h4", { className: "dcpa-section-title" }, t("sectionConnection")),
          h(
            "div",
            { className: "dcpa-switch-row" },
            h(
              "div",
              null,
              h("div", { className: "dcpa-label" }, t("enabledLabel")),
              h("p", { className: "dcpa-hint" }, t("enabledHint"))
            ),
            h(
              "button",
              {
                type: "button",
                role: "switch",
                className: "dcpa-switch",
                "aria-checked": enabled,
                "aria-label": t("enabledLabel"),
                onClick: () => setEnabled(!enabled),
              },
              h("span", { className: "dcpa-switch-thumb" })
            )
          ),
          h(
            "div",
            { className: "dcpa-field" },
            h("label", { className: "dcpa-label" }, t("baseUrlLabel")),
            h("input", {
              type: "text",
              className: "dcpa-input",
              value: baseURL,
              placeholder: effectiveUrl || t("baseUrlPlaceholder"),
              onChange: (e) => setBaseURL(e.target.value),
            }),
            h("p", { className: "dcpa-hint" }, t("baseUrlHint"))
          ),
          h(
            "div",
            { className: "dcpa-field" },
            h(
              "div",
              { className: "dcpa-label-row" },
              h("label", { className: "dcpa-label" }, `${t("apiKeyLabel")} (${cred.ref || apiKeyEnv})`),
              h(
                "span",
                { className: cred.configured ? "dcpa-badge dcpa-badge-ok" : "dcpa-badge" },
                cred.configured ? t("apiKeyConfiguredBadge") : t("apiKeyUnsetBadge")
              )
            ),
            h("input", {
              type: "password",
              className: "dcpa-input",
              autoComplete: "new-password",
              value: apiKeyDraft,
              placeholder: cred.configured ? t("apiKeySetPlaceholder") : t("apiKeyUnsetPlaceholder"),
              onChange: (e) => setApiKeyDraft(e.target.value),
            }),
            h("p", { className: "dcpa-hint" }, t("apiKeyHint"))
          ),
          h(
            "div",
            { className: "dcpa-grid" },
            h(
              "div",
              { className: "dcpa-field" },
              h("label", { className: "dcpa-label" }, t("protocolLabel")),
              h(
                "select",
                {
                  className: "dcpa-select",
                  value: protocol,
                  onChange: (e) => setProtocol(e.target.value),
                },
                h("option", { value: "auto" }, t("protocolAuto")),
                PROTOCOLS.map((p) =>
                  h("option", { key: p, value: p }, `${t("protocolFixedPrefix")}${protocolName(p)}`)
                )
              ),
              h("p", { className: "dcpa-hint" }, t("protocolHint"))
            ),
            h(
              "div",
              { className: "dcpa-field" },
              h("label", { className: "dcpa-label" }, t("displayNameLabel")),
              h("input", {
                type: "text",
                className: "dcpa-input",
                value: displayName,
                onChange: (e) => setDisplayName(e.target.value),
              }),
              h("p", { className: "dcpa-hint" }, t("displayNameHint"))
            )
          ),
          h(
            "details",
            null,
            h(
              "summary",
              { style: { cursor: "pointer", fontSize: "12px", fontWeight: 500 } },
              t("sectionAdvanced")
            ),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" } },
              h(
                "div",
                { className: "dcpa-grid" },
                h(
                  "div",
                  { className: "dcpa-field" },
                  h("label", { className: "dcpa-label" }, t("includePrefixLabel")),
                  h("input", {
                    type: "text",
                    className: "dcpa-input",
                    value: includePrefix,
                    placeholder: t("includePrefixPlaceholder"),
                    onChange: (e) => setIncludePrefix(e.target.value),
                  }),
                  h("p", { className: "dcpa-hint" }, t("includePrefixHint"))
                ),
                h(
                  "div",
                  { className: "dcpa-field" },
                  h("label", { className: "dcpa-label" }, t("excludePrefixLabel")),
                  h("input", {
                    type: "text",
                    className: "dcpa-input",
                    value: excludePrefix,
                    placeholder: t("excludePrefixPlaceholder"),
                    onChange: (e) => setExcludePrefix(e.target.value),
                  }),
                  h("p", { className: "dcpa-hint" }, t("excludePrefixHint"))
                )
              ),
              h(
                "div",
                { className: "dcpa-grid" },
                h(
                  "div",
                  { className: "dcpa-field" },
                  h("label", { className: "dcpa-label" }, t("providerIdLabel")),
                  h("input", {
                    type: "text",
                    className: "dcpa-input",
                    value: provider,
                    onChange: (e) => setProvider(e.target.value),
                  }),
                  h("p", { className: "dcpa-hint" }, t("providerIdHint"))
                ),
                h(
                  "div",
                  { className: "dcpa-field" },
                  h("label", { className: "dcpa-label" }, t("apiKeyEnvLabel")),
                  h("input", {
                    type: "text",
                    className: "dcpa-input",
                    value: apiKeyEnv,
                    onChange: (e) => setApiKeyEnv(e.target.value),
                  }),
                  h("p", { className: "dcpa-hint" }, t("apiKeyEnvHint"))
                )
              ),
              h(
                "div",
                { className: "dcpa-grid" },
                h(
                  "div",
                  { className: "dcpa-field" },
                  h("label", { className: "dcpa-label" }, t("refreshIntervalLabel")),
                  h("input", {
                    type: "number",
                    className: "dcpa-input",
                    value: refreshIntervalSeconds,
                    onChange: (e) => setRefreshIntervalSeconds(e.target.value),
                  })
                )
              )
            )
          ),
          h(
            "div",
            { className: "dcpa-actions" },
            h(
              "button",
              {
                type: "button",
                className: "dcpa-btn dcpa-btn-primary",
                disabled: saving || syncing,
                onClick: () => onSave(false),
              },
              saving ? t("savingBtn") : t("saveBtn")
            ),
            cred.configured
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-btn",
                    disabled: saving || syncing,
                    onClick: () => onSave(true),
                  },
                  t("clearKeyBtn")
                )
              : null,
            h("span", { style: { flex: 1 } }),
            h(
              "button",
              {
                type: "button",
                className: "dcpa-btn dcpa-btn-danger",
                disabled: saving || syncing || loading,
                onClick: onRemove,
              },
              t("removeAccountBtn")
            )
          )
        )
      );
    }

    const inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-cliproxyapi: dictionaries");
      const t = ctx.locale.bind(NS);

      if (typeof document !== "undefined") {
        const styleId = "dsh-cliproxyapi-styles";
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
          styleEl = document.createElement("style");
          styleEl.id = styleId;
          styleEl.dataset.plugin = MODULE_ID;
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
        } else {
          styleEl.textContent = CSS;
        }
        ctx.effect(
          () => () => {
            styleEl?.remove();
          },
          "dsh-cliproxyapi: styles"
        );
      }

      // 1. Register on the Bundle detail page in Sidebar -> Plugins -> CLIProxyAPI
      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register(
          {
            name: "plugins.bundle.config",
            key: MODULE_ID,
            locale: NS,
          },
          (ownerProps = {}) => (ownerProps.view === "summary" ? null : h(CpaSettingsPanel, { t }))
        )
      );

      // 2. Register as a dedicated tab in Settings -> Built-in plugins -> CLIProxyAPI
      ctx.slots.inject("settings.plugins.tab", () =>
        ctx.slots.register(
          {
            name: "settings.plugins.tab",
            id: NS,
            order: 50,
            label: () => t("nav"),
            locale: NS,
          },
          () => h(CpaSettingsPanel, { t })
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = MODULE_ID;
    return module.exports;
  },
});
