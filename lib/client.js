window.__ModuleLoader__.load({
  id: "dsh-cliproxyapi-pro",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useCallback, useMemo, useRef } = React;

    const PACKAGE_NAME = "dsh-cliproxyapi-pro";
    const MODULE_ID = "dsh-cliproxyapi-pro";
    const NS = "dsh-cliproxyapi-pro";
    // Stable id of the account/model page in the Settings left navigation.
    const SETTINGS_SECTION_ID = "cliproxyapi";

    // Document-relative API paths (compatible with <base href="./"> in DSH Web/Desktop)
    const API = {
      status: "api/dsh-cliproxyapi/status",
      refresh: "api/dsh-cliproxyapi/refresh",
      save: "api/dsh-cliproxyapi/save",
      addAccount: "api/dsh-cliproxyapi/accounts/add",
      removeAccount: "api/dsh-cliproxyapi/accounts/remove",
      testAccount: "api/dsh-cliproxyapi/accounts/test",
      updateStatus: "api/dsh-cliproxyapi/updates/status",
      updateCheck: "api/dsh-cliproxyapi/updates/check",
      updateSave: "api/dsh-cliproxyapi/updates/save",
      updateDownload: "api/dsh-cliproxyapi/updates/download",
      quotaStatus: "api/dsh-cliproxyapi/quota/status",
      quotaRefresh: "api/dsh-cliproxyapi/quota/refresh",
      quotaSave: "api/dsh-cliproxyapi/quota/save",
      mediaStatus: "api/dsh-cliproxyapi/media/status",
      mediaSave: "api/dsh-cliproxyapi/media/save",
      mediaDiagnose: "api/dsh-cliproxyapi/media/diagnose",
      mediaSession: "api/dsh-cliproxyapi/media/session",
      mediaSessionSave: "api/dsh-cliproxyapi/media/session/save",
      mediaFile: "api/dsh-cliproxyapi/media/file",
      mediaCommand: "api/dsh-cliproxyapi/media/command",
      mediaConfirm: "api/dsh-cliproxyapi/media/confirm",
    };

    // Public, versioned dshmarket Update API (UPDATE-API-V1.md in dshmarket).
    // Installation is delegated to the market; this plugin never runs a
    // package manager. Paths are document-relative like API above.
    const MARKET_API = {
      capabilities: "dsh-market/api/v1/capabilities",
      updates: "dsh-market/api/v1/updates",
      operations: "dsh-market/api/v1/operations",
      restart: "dsh-market/api/v1/restart",
    };
    const MARKET_SCHEMA = "dsh-market/update-api/v1";

    const zh = {
      nav: "CLIProxyAPI",
      statusConnected: "已连接并同步",
      statusProbing: "正在探测同步…",
      statusError: "连接异常",
      statusDisabled: "已停用",
      statusIdle: "等待同步",
      refreshBtn: "立即探测刷新",
      refreshingBtn: "正在探测…",
      saveBtn: "保存并应用",
      savingBtn: "正在应用…",
      unsavedChanges: "有未保存的更改",
      savedToast: "已保存并同步到对话框模型选择器",
      accountsLabel: "账号",
      addAccountBtn: "+ 添加账号",
      removeAccountBtn: "删除此账号",
      removeConfirm: "确定删除账号「{name}」吗？它同步到模型选择器中的模型路由也会一并移除（已保存的密钥不会删除）。",
      addedToast: "账号已添加并启用，已按每个家族勾选最新模型。",
      removedToast: "账号已删除，其模型已从模型选择器中移除",
      disabledHint: "未启用：模型不在模型选择器中，配置已保留。",
      enabledLabel: "启用此账号",
      enabledHint: "开启后，该账号勾选的模型会出现在对话框模型选择器中；关闭后移除这些模型，配置保留。",
      baseUrlLabel: "服务地址",
      baseUrlPlaceholder: "如 http://127.0.0.1:8317，无需加 /v1；留空自动发现",
      apiKeyLabel: "API Key",
      apiKeySetPlaceholder: "已配置密钥（留空保持不变，输入新值可覆盖）",
      apiKeyUnsetPlaceholder: "输入 CLIProxyAPI 访问密钥（本地免密模式可留空）",
      apiKeyHint: "保存在 DSH 凭证服务（{ref}），不会写入配置文件。本地免密的 CPA 可留空。",
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
      providerIdLabel: "路由 ID",
      providerIdHint: "写入 llm-pi-ai 的提供商路由标识，每个账号必须不同（首个账号默认 cli-proxy，与现有配置无缝衔接）。",
      apiKeyEnvLabel: "密钥引用名",
      apiKeyEnvHint: "密钥在 DSH 凭证服务中的名称，每个账号建议使用不同的引用名。",
      displayNameLabel: "账号名称",
      displayNameHint: "用于区分账号，并作为 DSH 对话框模型选择器中的分组名称。",
      includePrefixLabel: "仅包含关键词",
      includePrefixPlaceholder: "例如: gpt-6, claude-opus, gemini-4 (多个用逗号分隔)",
      includePrefixHint: "附加规则：只允许模型 ID 包含指定关键词的模型。",
      excludePrefixLabel: "排除关键词",
      excludePrefixPlaceholder: "例如: tts, image, video, zj/ (多个用逗号分隔)",
      excludePrefixHint: "附加规则：排除包含指定关键词的模型 ID。",
      refreshIntervalLabel: "自动刷新间隔",
      searchModelsPlaceholder: "搜索模型 ID 或名称（如 claude-opus, gpt-6, gemini-4, swe）…",
      filterAll: "全部发现",
      filterSelected: "已勾选",
      filterUnselected: "未勾选",
      familyAll: "全部家族",
      selectAllVisibleBtn: "全选当前列表",
      deselectAllVisibleBtn: "取消当前列表",
      selectRecommendedBtn: "恢复推荐精选",
      selectRecommendedHint: "按该服务的模型目录，每个模型家族勾选最新的一个。",
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
      paramsHint: "留空并保存即恢复 CLIProxyAPI 自动探测值。",
      discoveredValue: "探测值",
      updateTitle: "插件更新",
      updatePageHint: "这里只管理插件自身的更新。CLIProxyAPI 的账号、模型和协议设置位于「设置」左侧导航的「CLIProxyAPI」页。",
      updateToggleDetails: "展开或收起插件更新设置",
      updateCompactCurrent: "当前 {version}",
      updateCompactAvailable: "有新版本 {version}",
      updateCompactDownloaded: "{version} 已下载",
      updateCompactError: "更新异常",
      updateCompactStatusUnavailable: "更新服务未就绪",
      updateCompactErrorNetwork: "网络异常",
      updateCompactErrorChannel: "通道未发布",
      updateStatusUnavailableHint: "无法读取更新服务，可能是插件宿主代码尚未重载：重启 DSH（仅刷新页面不够），或检查更新接口是否可用。",
      updateServiceUnavailableError: "更新服务未就绪：当前运行的插件宿主代码仍是旧版，可能尚未重启 DSH。重启 DSH 后重试。",
      updateOriginError: "请求来源校验未通过，更新操作已拒绝。请从 DSH 打开的页面重试；使用反向代理时请保持与页面一致的地址访问。",
      updateSubtitle: "仅更新 CLIProxyAPI 插件自身，不更新 CPA 服务或 DSH 宿主。设置修改后立即保存。",
      updateNewVersion: "新版本",
      updateVersionSummary: "当前版本 {current} · 最新版本 {latest}",
      updateUnknownVersion: "未知",
      updateNotChecked: "尚未检查",
      updateLoading: "正在读取更新状态…",
      updateUpToDate: "已是所选通道最新版本",
      updateAvailable: "有可用更新",
      updateCheckBtn: "检查更新",
      updateChecking: "正在检查…",
      updateRetryBtn: "重新读取状态",
      updateDownloadBtn: "下载更新",
      updateDownloading: "正在下载并校验…",
      updateDownloadedBtn: "重新下载",
      updateChannelLabel: "更新通道",
      updateChannelHint: "稳定版适合日常使用；Beta 和开发版可能不稳定。切换后请重新检查更新。",
      updateChannelStable: "稳定",
      updateChannelBeta: "Beta",
      updateChannelDev: "开发",
      updateRegionLabel: "下载区域",
      updateRegionHint: "自动选择可用下载区域；也可手动指定全球或中国大陆源。",
      updateRegionAuto: "自动",
      updateRegionGlobal: "全球",
      updateRegionCn: "中国大陆",
      updateEffectiveRegion: "当前使用：{region}",
      updateAutoCheckLabel: "自动检查更新",
      updateAutoCheckHint: "启动时及每 6 小时检查所选通道；关闭后仍可手动检查。",
      updateAutoDownloadLabel: "自动下载更新",
      updateAutoDownloadHint: "自动检查发现新版本后下载并校验离线包；需开启自动检查，不会自动安装或重启 DSH。",
      updateLastChecked: "上次检查：{time}",
      updateSaving: "正在保存更新设置…",
      updateSaved: "更新设置已保存",
      updateLoadFailed: "无法读取插件更新状态，请重试。",
      updateCheckFailed: "检查更新失败，请稍后重试或切换下载区域。",
      updateSaveFailed: "更新设置保存失败，请重试。",
      updateDownloadFailed: "下载更新失败，请稍后重试或切换下载区域。",
      updateNetworkError: "无法连接更新源，请检查网络或切换下载区域后重试。",
      updateMetadataError: "更新源返回了无效的版本信息，请稍后重试。",
      updateChannelUnavailable: "所选通道尚未发布可用版本，请选择其他通道。",
      updateIntegrityError: "下载包完整性校验失败，未应用任何更改。请重新下载。",
      updateInvalidPackage: "下载包不是有效的本插件更新包，未应用任何更改。",
      updateStorageError: "无法保存更新设置或离线包，请检查磁盘空间和目录写入权限。",
      updateBusyError: "已有更新任务正在进行，请等待完成后重试。",
      updateStaleVersion: "可用版本已变化，请重新检查更新后再下载。",
      updateDisposedError: "插件正在重新加载，请稍后重新读取更新状态。",
      updateHttpError: "更新服务请求失败（HTTP {status}），请重试。",
      updateLinkedHint: "当前为本地链接安装，更新不会覆盖源码目录。可检查并下载离线包；若要保留源码开发方式，请自行更新代码。",
      updateUnsupportedHint: "当前 DSH 宿主不支持此更新操作，请升级 DSH 后重试。",
      updateNotInstalledHint: "未找到已安装的插件，无法准备更新。请先通过 DSH 插件管理器安装本插件。",
      updateBlockedHint: "当前安装方式无法准备更新，请使用 DSH 插件管理器检查安装状态。",
      updateConfirmTitle: "确认下载版本 {version}？",
      updateConfirmHint: "只下载并校验离线包，不会自动安装或重启。下载后需关闭 DSH，执行提示的升级命令，再重新启动。",
      updateLinkedConfirmHint: "只下载并校验离线包，不会覆盖源码、安装或重启。若要保留本地链接方式，请手动更新源码后重新启动 DSH；通过离线包重新安装会切换插件安装来源。",
      updateConfirmBtn: "确认下载",
      updateCancelBtn: "取消",
      updateDownloadRequested: "下载任务已提交，完成后将在此显示离线包与升级命令。",
      updateDownloadedHint: "版本 {version} 已下载并校验。请先保存工作并关闭 DSH，再执行下方命令升级，最后重新启动 DSH 生效。",
      updateLinkedDownloadedHint: "版本 {version} 的离线包已下载并校验。当前为本地链接安装；如需保留源码方式，请手动更新源码，之后重新启动 DSH 生效。不要将离线包覆盖到正在使用的源码目录。",
      updateLinkedSourceHint: "未提供自动升级命令以保护本地链接来源。通过离线包重新安装会切换插件安装来源。",
      updateDownloadPathLabel: "已校验的离线包",
      updateUpgradeCommandLabel: "关闭 DSH 后执行升级命令",
      updateCommandUnavailable: "未生成升级命令。请先确认 DSH 支持的离线包升级方式；升级前关闭 DSH，完成后重新启动。",
      updateOfflineHint: "离线包下载不会自动安装。本插件自身不会运行包管理器、关闭或重启 DSH；一键更新和自动安装都交给 DSH 插件市场（dshmarket）完成。",
      updateCompactInstalled: "{version} 已安装",
      updateMarketLabel: "通过插件市场更新",
      updateMarketDetecting: "正在检测 DSH 插件市场…",
      updateMarketReadyHint: "已检测到 DSH 插件市场（dshmarket），可一键安装新版本。安装和版本解析都由插件市场完成，可能需要重启 DSH 或刷新页面才能生效。",
      updateMarketUnavailableHint: "未检测到 DSH 插件市场（dshmarket）的更新接口。安装插件市场后即可在此一键更新或自动更新；目前可使用下方的离线包下载。",
      updateMarketLinkedHint: "当前为本地链接安装，不通过插件市场安装，以免替换源码链接。",
      updateMarketInstallBtn: "立即更新",
      updateMarketInstalledBtn: "已安装",
      updateMarketInstalling: "正在通过插件市场安装…",
      updateMarketProgress: "正在通过插件市场安装… {percent}%",
      updateMarketRedetectBtn: "重新检测",
      updateMarketConfirmTitle: "通过插件市场安装版本 {version}？",
      updateMarketConfirmHint: "DSH 插件市场会安装本插件的新版本，并在安装后核对实际装上的版本，不一致时恢复原版本。安装期间请勿关闭 DSH；完成后可能需要重启 DSH 或刷新页面。",
      updateMarketConfirmBtn: "确认安装",
      updateMarketAutomaticPrefix: "自动更新：",
      updateMarketInstalled: "已安装版本 {version}。",
      updateMarketVersionLower: "插件市场安装的是 {installed}，低于检查到的 {target}：插件市场按其自身的通道与镜像解析版本。",
      updateMarketRestartHint: "重启 DSH 后新版本生效。",
      updateMarketRestartDesktopHint: "请完全退出 DSH 桌面版并重新打开，新版本才会生效。",
      updateMarketRestartManualHint: "请重启 DSH 服务，新版本才会生效。",
      updateMarketRefreshHint: "刷新页面后新版本界面生效。",
      updateMarketAppliedHint: "新版本已生效；若界面仍是旧版，请刷新页面。",
      updateMarketRestartBtn: "重启 DSH",
      updateMarketRestarting: "正在请求重启…",
      updateMarketRestartRequested: "已请求重启 DSH，页面将在 DSH 重新启动后恢复。",
      updateMarketRefreshBtn: "刷新页面",
      updateMarketUnchanged: "插件市场报告完成，但插件版本没有变化。",
      updateMarketCancelled: "插件市场的安装任务已取消。",
      updateMarketRolledBack: "插件市场已回滚此次更新，插件保持原版本。",
      updateMarketForceBtn: "仍然安装",
      updateMarketBusy: "插件市场正在执行另一项更新，请稍后重试。",
      updateMarketAgentsRunning: "有智能体正在运行，插件市场暂不安装。请等待任务结束后重试。",
      updateMarketTooFresh: "新版本刚发布，仍在插件市场的发布冷却期内。可稍后重试，或选择「仍然安装」。",
      updateMarketVersionUnchanged: "插件市场没有解析到更新的版本（镜像可能尚未同步）。可稍后重试，或选择「仍然安装」。",
      updateMarketDowngrade: "插件市场解析到的版本低于当前版本，已自动恢复，未做更改。",
      updateMarketMismatch: "插件市场安装的版本与目标版本不一致，已自动恢复。请等待镜像同步后重试。",
      updateMarketTimeout: "插件市场安装超时，请稍后重试。",
      updateMarketForbidden: "插件市场拒绝了此次更新请求，请从 DSH 打开的页面重试。",
      updateMarketLost: "无法继续跟踪插件市场的安装任务（DSH 可能已重启）。请重新检查更新以确认当前版本。",
      updateMarketUnreachable: "无法连接 DSH 插件市场的更新接口，请确认 dshmarket 已启用后重试。",
      updateMarketRestartFailed: "重启请求失败，请手动重启 DSH。",
      updateMarketFailed: "插件市场安装失败。可在插件市场中查看详情，稍后重试，或使用离线包下载。",
      updateAutoInstallLabel: "自动安装更新",
      updateAutoInstallHint: "自动检查发现新版本后，通过 DSH 插件市场自动安装（需开启自动检查并安装 dshmarket，仅在 DSH 页面打开时进行；同一版本 6 小时内最多尝试一次）。生效可能需要重启 DSH 或刷新页面。",
      tabsLabel: "账号页面",
      tabSettings: "设置",
      tabQuota: "额度",
      qTitle: "CPA 渠道额度",
      qSubtitle: "填写管理密钥后，查看 CPA 上每个渠道凭证的剩余额度；对话框模型选择器旁也会显示当前模型的额度。",
      qAccountsLabel: "选择账号",
      qNoAccounts: "还没有 CLIProxyAPI 账号，请先在「设置」页添加并连接。",
      qAccountDisabled: "账号未启用",
      qKeyLabel: "管理密钥",
      qKeyHint: "保存在 DSH 凭证服务（{ref}），只由宿主使用，不会返回到页面。远程 CPA 需开启 remote-management.allow-remote。",
      qKeySetPlaceholder: "已保存管理密钥（留空保持不变，输入新值可覆盖）",
      qKeyUnsetPlaceholder: "CPA 配置中的 remote-management.secret-key",
      qKeySave: "保存",
      qKeySaving: "正在保存…",
      qKeyClear: "清除密钥",
      qKeyClearConfirm: "确定清除账号「{name}」的管理密钥吗？清除后不再读取它的额度。",
      qKeyStatusSet: "已配置",
      qKeyStatusUnset: "未配置",
      qDataLabel: "额度数据",
      qTotalCreds: "{n} 个凭证",
      qKeySaved: "管理密钥已保存",
      qKeyCleared: "管理密钥已清除",
      qRefresh: "刷新额度",
      qRefreshing: "正在刷新…",
      qUpdated: "{time}更新",
      qNeverUpdated: "尚未读取额度",
      qAgoJustNow: "刚刚",
      qAgoSeconds: "{n} 秒前",
      qAgoMinutes: "{n} 分钟前",
      qAgoHours: "{n} 小时前",
      qAgoDays: "{n} 天前",
      qStatHealthy: "充足",
      qStatLow: "偏低",
      qStatEmpty: "耗尽",
      qStatIssue: "停用/异常",
      qStatUnknown: "无额度数据",
      qFilterAll: "全部渠道",
      qSearchPlaceholder: "搜索邮箱、名称或模型…",
      qNoCredentials: "该 CPA 服务器上没有凭证（auth files）。",
      qNoMatch: "没有符合筛选条件的凭证。",
      qShowModels: "服务 {n} 个模型",
      qHideModels: "收起模型列表",
      qModelsUnknown: "模型列表不可用",
      qStatusActive: "可用",
      qStatusDisabled: "已停用",
      qStatusUnavailable: "暂不可用",
      qStatusError: "异常",
      qQuotaUnsupported: "此渠道没有可查询的额度接口，仅显示账号状态",
      qQuotaError: "额度查询失败",
      qQuotaNone: "上游未返回额度窗口",
      qRecent: "近期请求：成功 {success} · 失败 {failed}",
      qWin5h: "5 小时",
      qWin7d: "每周",
      qWin30d: "每月",
      qWin1d: "每日",
      qWinOther: "额度",
      qResetIn: "{time}后重置",
      qResetSoon: "即将重置",
      qDurDH: "{d}天{h}小时",
      qDurHM: "{h}小时{m}分",
      qDurM: "{m}分钟",
      qErrUnauthorized: "管理密钥无效（401）。为避免 CPA 因错误密钥封禁地址，已暂停自动刷新；更新密钥或手动刷新后重试。",
      qErrForbidden: "CPA 拒绝了管理请求（403）：请确认 CPA 已开启 remote-management.allow-remote，且密钥正确。",
      qErrNetwork: "无法连接 CPA 管理接口，请检查服务地址与网络。",
      qErrTimeout: "CPA 管理接口响应超时，请稍后重试。",
      qErrHttp: "CPA 管理接口返回错误（HTTP {status}）。",
      qErrInvalid: "CPA 管理接口返回了无法识别的数据。",
      qErrNoEndpoint: "该账号还没有可用的服务地址，请先在「设置」页连接 CPA。",
      qErrLoad: "无法读取额度数据：{error}",
      qStale: "以下为上次成功读取的数据。",
      qMapTitle: "模型 → 渠道",
      qMapHint: "该账号同步到模型选择器的每个模型，实际由哪些渠道凭证提供服务。模型选择器旁的额度按此匹配。",
      qMapNone: "未匹配到凭证",
      qMapEmpty: "该账号还没有同步到模型选择器的模型。",
      qMatchModelList: "按模型列表",
      qMatchPrefix: "按前缀",
      qMatchFamily: "按家族推断",
      qBadgeLabel: "{model} 的 CPA 额度",
      qPeekCreds: "{n} 个凭证可服务此模型",
      qPeekNoCreds: "CPA 上没有凭证提供这个模型。",
      qPeekLoading: "正在读取额度…",
      qPeekFooter: "完整列表见 设置 → CLIProxyAPI → 额度",
      qPeekBest: "最充足",
      infoLabel: "说明",
      tabConnection: "连接",
      tabModels: "模型",
      enableShort: "启用",
      moreActions: "更多操作",
      testBtn: "测试连接",
      testingBtn: "正在测试…",
      testOk: "连接成功：{endpoint} · {n} 个模型",
      testFail: "连接失败：{error}",
      discardBtn: "放弃更改",
      discardConfirm: "当前账号有未保存的更改，确定放弃吗？",
      saveBarLabel: "保存",
      modelsEmptyRule: "只有勾选的模型会出现在模型选择器中；一个都不勾选时显示全部模型。",
      addTitle: "添加账号",
      addNamePlaceholder: "如：家里的 CPA",
      cancelBtn: "取消",
      addAnywayBtn: "仍然添加（不启用）",
      connectBtn: "连接",
      connectingBtn: "正在连接…",
      addedDisabledToast: "账号已添加但未启用。修正连接信息后，在账号标题旁打开「启用」。",
      clearKeyConfirm: "确定清除该账号的 API Key 吗？",
      clearedKeyToast: "API Key 已清除",
      enabledToast: "已启用，模型已同步到模型选择器",
      disabledToast: "已停用，模型已从模型选择器移除",
      modelsCountShort: "{n}/{total} 个模型",
      secondsUnit: "秒 · 所有账号共用",
      paramsHintShort: "修改后点底部「保存并应用」生效。",
      qProviderOther: "其他",
      tabMedia: "生成",
      mediaIntro: "该账号 CPA 上识别为生图 / 生视频的模型。它们由 CPA 的图片和视频接口提供，不会出现在对话模型选择器中。下面的修改会立即保存。",
      mediaLoading: "正在读取生成模型…",
      mediaLoadError: "无法读取生成模型：{error}",
      mediaImageGroup: "生图模型",
      mediaVideoGroup: "生视频模型",
      mediaNone: "该账号的模型目录里没有识别到生图或生视频模型。",
      mediaNoCatalog: "还没有读取到该账号的模型目录。请先在「连接」页连接 CPA，或从标题右侧的 ⋯ 菜单立即探测。",
      mediaEnabledLabel: "提供 {model} 用于生成",
      mediaKindFor: "{model} 的类型",
      mediaKindLabel: "类型",
      mediaKindImage: "生图",
      mediaKindVideo: "生视频",
      mediaKindChat: "对话模型",
      mediaDetectedTag: "自动识别",
      mediaOverriddenTag: "手动指定",
      mediaResetKind: "恢复自动识别",
      mediaAliasTag: "→ {target}",
      mediaAliasHint: "CPA 会把这个模型 id 改写为 {target} 调用。",
      mediaMovedTitle: "已改为对话模型",
      mediaMovedHint: "这些模型被自动识别为生成模型，但你把它们改成了对话模型，因此出现在「模型」页。",
      mediaMarkTitle: "把其他模型标记为生成模型",
      mediaMarkHint: "自动识别漏掉时使用。标记后，该模型会离开「模型」页和对话模型选择器。",
      mediaMarkSelect: "选择模型…",
      mediaMarkBtn: "标记",
      mediaSaved: "已保存",
      mediaKindSaved: "已保存，对话模型选择器已重新同步",
      mediaSettingsInvalid: "media-settings.json 无法读取，当前使用默认设置；下次保存时会把损坏的文件另存一份。",
      mediaErrInvalidAccount: "账号不存在或已删除，请刷新页面。",
      mediaErrInvalidRequest: "请求无效，请刷新页面后重试。",
      mediaErrNoEndpoint: "该账号还没有可用的服务地址，请先在「连接」页连接 CPA。",
      mediaErrGeneric: "操作失败：{error}",
      diagTitle: "只读诊断",
      diagHint: "只发送 GET 请求：用该账号的 Key 读取两份模型目录；再不带 Key 探测两个视频接口是否存在（存在的接口会直接返回 401）。不会生成内容，也不会消耗额度。如果 CPA 没有要求 Key，探测会用一个不存在的任务 id 查询一次，仍是只读请求。",
      diagRun: "运行诊断",
      diagRunning: "正在诊断…",
      diagNoKey: "该账号没有配置 API Key，模型目录可能读取失败。",
      diagEnriched: "模型目录（client_version=pi）",
      diagListing: "模型列表（/v1/models）",
      diagCatalogOk: "共 {n} 个模型，其中 {m} 个疑似生成模型",
      diagCatalogFail: "读取失败（{reason}）",
      diagRoutes: "视频接口",
      diagPresent: "存在",
      diagMissing: "不存在（CPA 版本可能较旧）",
      diagUnknown: "无法判断（HTTP {status}）",
      diagUnreachable: "无法连接",
      diagRaw: "完整结果（JSON，不含 Key）",
      diagCopy: "复制结果",
      diagCopied: "已复制",
      mediaChipLabel: "生图模型：{model}",
      mediaChipChoose: "选择生图模型",
      mediaChipTitle: "生成模型",
      mediaChipHint: "输入 /cpa-image 加提示词生成图片；附带图片即可改图。",
      mediaChipVideoHint: "输入 /cpa-video 加提示词生成视频；可附带一张首帧图，提交后无法取消。",
      mediaChipHintBoth: "/cpa-image 生成图片（附带图片即可改图）；/cpa-video 生成视频（可附带一张首帧图，提交后无法取消）。",
      mediaChipVideoLabel: "生视频模型：{model}",
      mediaChipVideoChoose: "选择生视频模型",
      mediaChipJoin: "；",
      mediaChipInherited: "本会话还没有单独选择，正在沿用上一次的选择。",
      mediaAgentSettings: "agent 生成设置",
      mediaBack: "返回",
      mediaActOpen: "用默认应用打开",
      mediaActReveal: "显示文件位置",
      mediaActRevealExplorer: "在文件资源管理器中显示",
      mediaActRevealFinder: "在访达中显示",
      mediaActRevealFiles: "在文件管理器中显示",
      mediaActOpenWith: "用 {app} 打开",
      mediaActOpenWithDefault: "用 {app} 打开（默认）",
      mediaActAppsLoading: "正在读取可用的应用…",
      mediaActOpenFolder: "打开文件夹",
      mediaActCopyImage: "复制图片",
      mediaActCopyPath: "复制文件路径",
      mediaActCopied: "已复制",
      mediaActOpenFailed: "DSH 没能打开这个路径。",
      mediaActCopyFailed: "复制失败：{error}",
      mediaActMenu: "图片操作",
      mediaActMore: "更多操作",
      mediaClosePreview: "收起",
      mediaPickFailed: "无法切换模型：{error}",
      mediaOutputTitle: "保存位置",
      mediaVideoDefaults: "视频默认值",
      mediaVideoDefaultsHint: "/cpa-video 没有写 -s / -r 时使用的时长和分辨率。所有账号共用。视频按秒计费，提交后无法取消。",
      mediaVideoSeconds: "时长",
      mediaVideoResolution: "分辨率",
      mediaSecondsOption: "{n} 秒",
      mediaOutputHint: "生成的文件保存在这里。相对路径以会话的工作目录为基准，也可以填写绝对路径。所有账号共用。",
      mediaOutputSave: "保存",
      mediaErrInvalidOutputDir: "保存位置无效：不能为空、不能含控制字符，且不超过 260 个字符。",
      mediaErrInvalidModel: "该模型已不可用，请刷新后重试。",
      mediaErrInvalidSession: "会话无效，请刷新页面。",
      mediaCardSubmitting: "正在提交…",
      mediaCardRunning: "正在生成 · {time}",
      mediaCardEditing: "正在改图 · {time}",
      mediaCardVideoQueued: "排队中 · {time}",
      mediaCardVideoProgress: "正在生成 {progress}% · {time}",
      mediaCardVideoSaving: "正在保存视频 · {time}",
      mediaCardVideoNoStop: "视频提交后无法取消，会照常计费；可以继续对话。重载插件或重启 DSH（3 小时内）后会继续等待并保存。",
      mediaCardFirstFrame: "首帧图",
      mediaModeReference: "参考图 ×{n}",
      mediaModeFirstLast: "首尾帧",
      mediaModeLastFrame: "尾帧",
      mediaModeEdit: "编辑视频",
      mediaModeExtend: "延长 +{n} 秒",
      mediaEditOpen: "编辑视频…",
      mediaExtendOpen: "延长视频…",
      mediaEditPlaceholder: "要怎么改？例如：把衣服换成红色，其他保持不变",
      mediaExtendPlaceholder: "接下来发生什么？例如：她转身走出画面",
      mediaExtendSeconds: "延长时长",
      mediaEditSubmit: "提交编辑",
      mediaExtendSubmit: "提交延长",
      mediaEditCancel: "取消",
      mediaEditNote: "使用 grok-imagine-video，结果出现在对话下方新的一行；提交后无法取消，会照常计费。约 1 小时内直接用 xAI 的视频链接，之后把本地文件随请求发送。",
      mediaSourceTag: "源：{name}",
      mediaCopyInput: "复制原始输入",
      mediaLocale: "zh",
      mediaConfirmWaiting: "等待你确认",
      mediaConfirmTitle: "agent 想生成图片",
      mediaConfirmTitleVideo: "agent 想生成视频",
      mediaConfirmAllow: "允许生成",
      mediaConfirmDecline: "拒绝",
      mediaConfirmNote: "确认前不会提交生成。10 分钟内没有回答视为不同意；可在生成设置里调整本会话的确认方式。",
      mediaConfirmDeliveryFailed: "回答未送达，请重试；生成尚未获准。",
      mediaConfirmAllowed: "已允许，开始生成",
      mediaConfirmDeclined: "已拒绝",
      mediaConfirmFailed: "没有送达：{error}",
      mediaAgentTitle: "允许 agent 生成图片 / 视频",
      mediaAgentHint: "打开后，对话里的 agent 可以调用 generate_media 工具，用上面启用的生成模型生图、生视频、编辑或延长视频，文件保存到会话工作目录下的保存位置。关闭时不注册这个工具，不占用上下文。斜杠命令和输入框旁的按钮不受影响。",
      mediaAgentOnNote: "已开启：agent 可以调用 generate_media。确认方式和秒数上限可在输入框旁的生成按钮里按会话单独修改。",
      mediaAgentOffNote: "已关闭：agent 看不到生成工具。",
      mediaVideoConfirm: "agent 生成视频时",
      mediaImageConfirm: "agent 生成图片时",
      mediaConfirmAsk: "每次先问我",
      mediaConfirmAuto: "直接生成",
      mediaVideoBudget: "每个会话的 agent 视频上限",
      mediaVideoBudgetHint: "按视频秒数累计（子 agent 计入所属会话）。只在「直接生成」时拦截超出上限的视频；「每次先问我」时只计数，确认框里会显示已用秒数。修改上限或改为直接生成时重新计数。你手动用 /cpa-video 不计数。",
      mediaBudgetSeconds: "{n} 秒",
      mediaBudgetUnlimited: "不限",
      mediaFollowGlobal: "跟随全局（{value}）",
      mediaAgentSection: "本会话的 agent 生成",
      mediaAgentUsed: "本会话 agent 已用视频 {used} / {limit} 秒",
      mediaAgentUsedUnlimited: "本会话 agent 已用视频 {used} 秒（不限）",
      mediaCardInterpreting: "正在理解参数 · {time}",
      mediaInterpreted: "参数由 {by} 从提示词中读出：{items}",
      mediaInterpretedNone: "{by} 没有从提示词中读出其他参数",
      mediaInterpretFailed: "参数解读失败（{by}），按命令里的选项和原文发送",
      mediaInterpretedPrompt: "；已从提示词中去掉这些参数的说法",
      mediaSentText: "模式：纯文字生成（没有附带图片）",
      mediaSentFirstFrame: "模式：首帧 — 附带的图片就是视频的第一帧",
      mediaSentReference: "模式：参考图 ×{n} — 带入图中的人物、服装、物品，不锁定第一帧",
      mediaSentFirstLast: "模式：首尾帧 — 第 1 张图是第一帧，第 2 张图是最后一帧",
      mediaSentLastFrame: "模式：尾帧 — 视频最后停在附带的图片上",
      mediaSentEdit: "模式：编辑视频（grok-imagine-video）— 原视频：{source}",
      mediaSentExtend: "模式：延长 +{n} 秒（grok-imagine-video）— 原视频：{source}",
      mediaSentImageText: "模式：文生图",
      mediaSentImageEdit: "模式：改图 — {n} 张附带图片作为参考",
      mediaSourceUpload: "上传本地文件 {name}",
      mediaSourceUrl: "公开链接（{name}），由 xAI 下载",
      mediaSourceLink: "本会话生成的视频（xAI 结果链接）",
      mediaSourceSession: "本会话生成的视频",
      mediaIgnoredTag: "已忽略 {words}（编辑 / 延长沿用原视频的设置）",
      mediaCopiedInput: "已复制原始输入",
      mediaEditSubmitted: "已提交，结果见对话下方新的一行。",
      mediaEditFailed: "提交失败。",
      mediaDurationS: "{s} 秒",
      mediaDurationMS: "{m} 分 {s} 秒",
      mediaCardNoStop: "生成开始后无法中途停止；可以继续对话，完成后图片会出现在这里。",
      mediaCardDone: "用时 {time} · 已保存到 {folder}",
      mediaCardDoneShort: "已完成",
      mediaCardFailed: "生成失败",
      mediaCardMissing: "图片文件已移动或删除，或已超出每个会话保留的最近 48 条生成记录。",
      mediaCardDetails: "详情",
      mediaCardFiles: "文件",
      mediaCardFolder: "保存目录",
      mediaCardRevised: "上游改写后的提示词",
      mediaCardImage: "图片 {n}",
      mediaCardCount: "{n} 张",
      mediaCardRefs: "{n} 张参考图",
      mediaRunErrInterrupted: "插件重新加载或 DSH 关闭，生成已中断。",
      mediaRunErrTimeout: "CPA 在 3 分钟内没有返回结果。",
      mediaRunErrNetwork: "无法连接 CPA。",
      mediaRunErrNoImage: "CPA 没有返回图片。",
      mediaRunErrInvalid: "CPA 返回的数据不是 PNG、JPEG、WebP 或 GIF 图片。",
      mediaRunErrWrite: "无法写入文件。",
      mediaRunErrExpired: "CPA 已不再记得这个视频：提交已超过 3 小时。",
      mediaRunErrInvalidVideo: "CPA 返回的数据不是 MP4、MOV 或 WebM 视频。",
      mediaRunErrVideoTooLarge: "视频超过 200 MiB，未保存。",
    };

    const en = {
      nav: "CLIProxyAPI",
      statusConnected: "Connected & Synced",
      statusProbing: "Probing…",
      statusError: "Connection Error",
      statusDisabled: "Disabled",
      statusIdle: "Idle",
      refreshBtn: "Probe & Refresh",
      refreshingBtn: "Probing…",
      saveBtn: "Save & Apply",
      savingBtn: "Applying…",
      unsavedChanges: "Unsaved changes",
      savedToast: "Saved and synchronized to the DSH model picker",
      accountsLabel: "Accounts",
      addAccountBtn: "+ Add Account",
      removeAccountBtn: "Delete Account",
      removeConfirm: "Delete account \"{name}\"? Its model routes are removed from the model picker too (the stored key is kept).",
      addedToast: "Account added and enabled; the newest model of each family is checked.",
      removedToast: "Account deleted and its models removed from the picker",
      disabledHint: "Disabled: its models are not in the model picker; settings are kept.",
      enabledLabel: "Enable This Account",
      enabledHint: "When on, this account's checked models appear in the composer model picker; turning it off removes them and keeps the settings.",
      baseUrlLabel: "Base URL",
      baseUrlPlaceholder: "e.g. http://127.0.0.1:8317, no /v1 needed; blank = auto-discover",
      apiKeyLabel: "API Key",
      apiKeySetPlaceholder: "Key is stored (leave blank to keep, or type a new key)",
      apiKeyUnsetPlaceholder: "Enter CLIProxyAPI Bearer key (optional for local no-auth)",
      apiKeyHint: "Stored in the DSH credentials service ({ref}), never in settings files. Leave blank for a local CPA without a key.",
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
      providerIdLabel: "Route ID",
      providerIdHint: "Provider key under llm-pi-ai; must differ per account (first account: cli-proxy).",
      apiKeyEnvLabel: "Credential Ref",
      apiKeyEnvHint: "Name of the key in the DSH credentials service; use a distinct one per account.",
      displayNameLabel: "Account Name",
      displayNameHint: "Tells accounts apart and titles their group in the DSH model selector.",
      includePrefixLabel: "Include Keywords",
      includePrefixPlaceholder: "e.g. gpt-6, claude-opus, gemini-4 (comma-separated)",
      includePrefixHint: "Additional rule: only sync models matching these substrings.",
      excludePrefixLabel: "Exclude Keywords",
      excludePrefixPlaceholder: "e.g. tts, image, video, zj/ (comma-separated)",
      excludePrefixHint: "Additional rule: hide models matching any of these substrings.",
      refreshIntervalLabel: "Auto Refresh",
      searchModelsPlaceholder: "Search model ID or name (e.g. claude-opus, gpt-6, gemini-4)…",
      filterAll: "All Discovered",
      filterSelected: "Checked",
      filterUnselected: "Unchecked",
      familyAll: "All Families",
      selectAllVisibleBtn: "Check Visible",
      deselectAllVisibleBtn: "Uncheck Visible",
      selectRecommendedBtn: "Reset to Recommended",
      selectRecommendedHint: "Check the newest model of each family in this server's catalog.",
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
      paramsHint: "Clear a value and save to restore the value discovered from CLIProxyAPI.",
      discoveredValue: "Discovered",
      updateTitle: "Plugin Updates",
      updatePageHint: "This page only manages updates of the plugin itself. CLIProxyAPI accounts, models and protocol settings are on the \"CLIProxyAPI\" page in the Settings dialog's left navigation.",
      updateToggleDetails: "Expand or collapse plugin update settings",
      updateCompactCurrent: "Current {version}",
      updateCompactAvailable: "Update {version}",
      updateCompactDownloaded: "{version} downloaded",
      updateCompactError: "Update error",
      updateCompactStatusUnavailable: "Update service unavailable",
      updateCompactErrorNetwork: "Network error",
      updateCompactErrorChannel: "Channel unpublished",
      updateStatusUnavailableHint: "Could not reach the update service; the running host plugin code may still be the previous version. Restart DSH (refreshing the page is not enough), or check that the update endpoint is registered.",
      updateServiceUnavailableError: "The update service is not ready: the running host plugin code is still the previous version, so DSH may not have been restarted. Restart DSH and retry.",
      updateOriginError: "The request origin was rejected, so the update action was refused. Retry from the page DSH opened, and reach it through the same address you see (relevant behind a reverse proxy).",
      updateSubtitle: "Updates this CLIProxyAPI plugin only, not the CPA server or DSH. Changes to update settings are saved immediately.",
      updateNewVersion: "New Version",
      updateVersionSummary: "Current {current} · Latest {latest}",
      updateUnknownVersion: "Unknown",
      updateNotChecked: "Not checked yet",
      updateLoading: "Loading update status…",
      updateUpToDate: "Up to date on this channel",
      updateAvailable: "Update available",
      updateCheckBtn: "Check for Updates",
      updateChecking: "Checking…",
      updateRetryBtn: "Reload Status",
      updateDownloadBtn: "Download Update",
      updateDownloading: "Downloading & verifying…",
      updateDownloadedBtn: "Download Again",
      updateChannelLabel: "Update Channel",
      updateChannelHint: "Stable is recommended for daily use. Beta and development builds may be unstable. Check again after switching channels.",
      updateChannelStable: "Stable",
      updateChannelBeta: "Beta",
      updateChannelDev: "Dev",
      updateRegionLabel: "Download Region",
      updateRegionHint: "Automatically select an available region, or choose the global or Mainland China source manually.",
      updateRegionAuto: "Auto",
      updateRegionGlobal: "Global",
      updateRegionCn: "Mainland China",
      updateEffectiveRegion: "Using: {region}",
      updateAutoCheckLabel: "Automatically Check for Updates",
      updateAutoCheckHint: "Check the selected channel at startup and every 6 hours. Manual checks remain available when disabled.",
      updateAutoDownloadLabel: "Automatically Download Updates",
      updateAutoDownloadHint: "Download and verify packages found by automatic checks (requires Auto Check). Never installs or restarts DSH automatically.",
      updateLastChecked: "Last checked: {time}",
      updateSaving: "Saving update settings…",
      updateSaved: "Update settings saved",
      updateLoadFailed: "Could not load plugin update status. Please retry.",
      updateCheckFailed: "Could not check for updates. Retry later or change the download region.",
      updateSaveFailed: "Could not save update settings. Please retry.",
      updateDownloadFailed: "Could not download the update. Retry later or change the download region.",
      updateNetworkError: "Could not reach the update source. Check your network or change the download region and retry.",
      updateMetadataError: "The update source returned invalid version information. Please retry later.",
      updateChannelUnavailable: "No release has been published on this channel. Please choose another channel.",
      updateIntegrityError: "Package integrity verification failed. No changes were applied. Please download again.",
      updateInvalidPackage: "The downloaded file is not a valid update package for this plugin. No changes were applied.",
      updateStorageError: "Could not save update settings or the offline package. Check free disk space and write permissions.",
      updateBusyError: "Another update operation is in progress. Wait for it to finish and retry.",
      updateStaleVersion: "The available version changed. Check for updates again before downloading.",
      updateDisposedError: "The plugin is reloading. Please reload update status shortly.",
      updateHttpError: "The update service request failed (HTTP {status}). Please retry.",
      updateLinkedHint: "This is a linked local installation. Updates never overwrite its source directory. You can check and download an offline package; update the source yourself to keep the development setup.",
      updateUnsupportedHint: "This DSH version does not support this update operation. Upgrade DSH and retry.",
      updateNotInstalledHint: "No installed plugin was found, so an update cannot be prepared. Install this plugin through the DSH plugin manager first.",
      updateBlockedHint: "An update cannot be prepared for this installation. Check it in the DSH plugin manager.",
      updateConfirmTitle: "Download version {version}?",
      updateConfirmHint: "Only downloads and verifies the offline package. Nothing is installed or restarted automatically. Then close DSH, run the provided upgrade command, and start DSH again.",
      updateLinkedConfirmHint: "Only downloads and verifies the offline package. It never overwrites source code, installs, or restarts DSH. To keep the linked setup, update the source manually and restart DSH. Reinstalling from the offline package changes the installation source.",
      updateConfirmBtn: "Confirm Download",
      updateCancelBtn: "Cancel",
      updateDownloadRequested: "Download requested. The verified package and upgrade command will appear here when ready.",
      updateDownloadedHint: "Version {version} has been downloaded and verified. Save your work and close DSH, then run the command below to upgrade. Start DSH again for it to take effect.",
      updateLinkedDownloadedHint: "The offline package for version {version} has been downloaded and verified. This is a linked installation. To keep the source-based setup, update the source manually, then restart DSH. Do not extract the package over source files that are in use.",
      updateLinkedSourceHint: "No upgrade command is provided, to protect the linked installation source. Reinstalling from the offline package changes that source.",
      updateDownloadPathLabel: "Verified Offline Package",
      updateUpgradeCommandLabel: "Upgrade Command — Run After Closing DSH",
      updateCommandUnavailable: "No upgrade command was generated. First verify the offline-package upgrade method supported by your DSH version. Close DSH before upgrading, then start it again.",
      updateOfflineHint: "Downloading an offline package never installs it. This plugin itself never runs a package manager, closes or restarts DSH; one-click and automatic installation are handed to the DSH plugin market (dshmarket).",
      updateCompactInstalled: "{version} installed",
      updateMarketLabel: "Update Through Plugin Market",
      updateMarketDetecting: "Detecting the DSH plugin market…",
      updateMarketReadyHint: "The DSH plugin market (dshmarket) was detected, so new versions can be installed in one click. The market installs and resolves the version; a DSH restart or page refresh may be needed for it to take effect.",
      updateMarketUnavailableHint: "The DSH plugin market (dshmarket) update API was not detected. Install the plugin market to enable one-click and automatic updates here; until then, use the offline package download below.",
      updateMarketLinkedHint: "This is a linked local installation, so it is not installed through the plugin market, which would replace the source link.",
      updateMarketInstallBtn: "Update Now",
      updateMarketInstalledBtn: "Installed",
      updateMarketInstalling: "Installing through the plugin market…",
      updateMarketProgress: "Installing through the plugin market… {percent}%",
      updateMarketRedetectBtn: "Detect Again",
      updateMarketConfirmTitle: "Install version {version} through the plugin market?",
      updateMarketConfirmHint: "The DSH plugin market installs the new version of this plugin, then verifies the version it actually placed and restores the previous one on a mismatch. Keep DSH open while it runs; a DSH restart or page refresh may be needed afterwards.",
      updateMarketConfirmBtn: "Confirm Install",
      updateMarketAutomaticPrefix: "Automatic update:",
      updateMarketInstalled: "Version {version} is installed.",
      updateMarketVersionLower: "The plugin market installed {installed}, older than the checked {target}: the market resolves versions with its own channel and mirror.",
      updateMarketRestartHint: "Restart DSH for the new version to take effect.",
      updateMarketRestartDesktopHint: "Quit the DSH desktop app completely and reopen it for the new version to take effect.",
      updateMarketRestartManualHint: "Restart the DSH service for the new version to take effect.",
      updateMarketRefreshHint: "Refresh the page to load the new interface.",
      updateMarketAppliedHint: "The new version is active; refresh the page if the interface still looks old.",
      updateMarketRestartBtn: "Restart DSH",
      updateMarketRestarting: "Requesting restart…",
      updateMarketRestartRequested: "A DSH restart was requested. The page recovers once DSH is back.",
      updateMarketRefreshBtn: "Refresh Page",
      updateMarketUnchanged: "The plugin market reported success, but the plugin version did not change.",
      updateMarketCancelled: "The plugin market cancelled the installation.",
      updateMarketRolledBack: "The plugin market rolled this update back; the previous version is kept.",
      updateMarketForceBtn: "Install Anyway",
      updateMarketBusy: "The plugin market is running another update. Retry shortly.",
      updateMarketAgentsRunning: "Agents are running, so the plugin market will not install now. Retry when they finish.",
      updateMarketTooFresh: "This release is still inside the plugin market's release-age wait. Retry later, or choose Install Anyway.",
      updateMarketVersionUnchanged: "The plugin market did not resolve a newer version (its mirror may still be syncing). Retry later, or choose Install Anyway.",
      updateMarketDowngrade: "The plugin market resolved a version older than the current one and restored it; nothing changed.",
      updateMarketMismatch: "The plugin market installed a version other than the target and restored the previous one. Retry after the mirror catches up.",
      updateMarketTimeout: "The plugin market installation timed out. Retry later.",
      updateMarketForbidden: "The plugin market refused this update request. Retry from the page DSH opened.",
      updateMarketLost: "The plugin market operation can no longer be followed (DSH may have restarted). Check for updates again to confirm the current version.",
      updateMarketUnreachable: "Could not reach the DSH plugin market update API. Make sure dshmarket is enabled and retry.",
      updateMarketRestartFailed: "The restart request failed. Restart DSH manually.",
      updateMarketFailed: "The plugin market installation failed. See the plugin market for details, retry later, or use the offline package download.",
      updateAutoInstallLabel: "Automatically Install Updates",
      updateAutoInstallHint: "Install versions found by automatic checks through the DSH plugin market (requires Auto Check and dshmarket; runs only while a DSH page is open, at most once per version every 6 hours). A DSH restart or page refresh may be needed for it to take effect.",
      tabsLabel: "Account pages",
      tabSettings: "Settings",
      tabQuota: "Quota",
      qTitle: "CPA Channel Quota",
      qSubtitle: "With a management key, see the remaining quota of every channel credential on CPA; the composer also shows the current model's quota next to the model picker.",
      qAccountsLabel: "Choose account",
      qNoAccounts: "No CLIProxyAPI account yet. Add and connect one on the Settings tab first.",
      qAccountDisabled: "Account disabled",
      qKeyLabel: "Management Key",
      qKeyHint: "Stored in the DSH credentials service ({ref}), used only by the host and never sent back to the page. A remote CPA needs remote-management.allow-remote.",
      qKeySetPlaceholder: "Management key stored (leave blank to keep, or type a new one)",
      qKeyUnsetPlaceholder: "remote-management.secret-key from the CPA config",
      qKeySave: "Save",
      qKeySaving: "Saving…",
      qKeyClear: "Clear Key",
      qKeyClearConfirm: "Clear the management key of account \"{name}\"? Its quota is no longer read afterwards.",
      qKeyStatusSet: "Set",
      qKeyStatusUnset: "Not set",
      qDataLabel: "Quota data",
      qTotalCreds: "{n} credentials",
      qKeySaved: "Management key saved",
      qKeyCleared: "Management key cleared",
      qRefresh: "Refresh Quota",
      qRefreshing: "Refreshing…",
      qUpdated: "Updated {time}",
      qNeverUpdated: "Quota not loaded yet",
      qAgoJustNow: "just now",
      qAgoSeconds: "{n}s ago",
      qAgoMinutes: "{n} min ago",
      qAgoHours: "{n} h ago",
      qAgoDays: "{n} d ago",
      qStatHealthy: "Healthy",
      qStatLow: "Low",
      qStatEmpty: "Exhausted",
      qStatIssue: "Off / Error",
      qStatUnknown: "No quota data",
      qFilterAll: "All channels",
      qSearchPlaceholder: "Search email, name or model…",
      qNoCredentials: "This CPA server has no credentials (auth files).",
      qNoMatch: "No credential matches the filters.",
      qShowModels: "Serves {n} models",
      qHideModels: "Hide models",
      qModelsUnknown: "Model list unavailable",
      qStatusActive: "Active",
      qStatusDisabled: "Disabled",
      qStatusUnavailable: "Unavailable",
      qStatusError: "Error",
      qQuotaUnsupported: "No quota endpoint for this channel; showing account status only",
      qQuotaError: "Quota query failed",
      qQuotaNone: "Upstream returned no quota window",
      qRecent: "Recent requests: {success} ok · {failed} failed",
      qWin5h: "5 hours",
      qWin7d: "Weekly",
      qWin30d: "Monthly",
      qWin1d: "Daily",
      qWinOther: "Quota",
      qResetIn: "resets in {time}",
      qResetSoon: "resetting now",
      qDurDH: "{d}d {h}h",
      qDurHM: "{h}h {m}m",
      qDurM: "{m}m",
      qErrUnauthorized: "The management key was rejected (401). Automatic refresh is paused so CPA does not ban this address for bad keys; update the key or refresh manually to retry.",
      qErrForbidden: "CPA refused the management request (403). Make sure remote-management.allow-remote is on and the key is correct.",
      qErrNetwork: "Could not reach the CPA management API. Check the server address and network.",
      qErrTimeout: "The CPA management API timed out. Retry shortly.",
      qErrHttp: "The CPA management API returned an error (HTTP {status}).",
      qErrInvalid: "The CPA management API returned data that could not be read.",
      qErrNoEndpoint: "This account has no usable server address yet. Connect CPA on the Settings tab first.",
      qErrLoad: "Could not load quota data: {error}",
      qStale: "Showing the last successful data below.",
      qMapTitle: "Model → Channel",
      qMapHint: "Which channel credentials actually serve each model this account puts in the model picker. The composer quota badge uses exactly this mapping.",
      qMapNone: "No matching credential",
      qMapEmpty: "This account has no models in the model picker yet.",
      qMatchModelList: "by model list",
      qMatchPrefix: "by prefix",
      qMatchFamily: "inferred from family",
      qBadgeLabel: "CPA quota of {model}",
      qPeekCreds: "{n} credential(s) serve this model",
      qPeekNoCreds: "No CPA credential serves this model.",
      qPeekLoading: "Loading quota…",
      qPeekFooter: "Full list in Settings → CLIProxyAPI → Quota",
      qPeekBest: "Best",
      infoLabel: "More info",
      tabConnection: "Connection",
      tabModels: "Models",
      enableShort: "Enabled",
      moreActions: "More actions",
      testBtn: "Test Connection",
      testingBtn: "Testing…",
      testOk: "Connected: {endpoint} · {n} models",
      testFail: "Connection failed: {error}",
      discardBtn: "Discard",
      discardConfirm: "This account has unsaved changes. Discard them?",
      saveBarLabel: "Save",
      modelsEmptyRule: "Only checked models appear in the model picker; with none checked, all models are shown.",
      addTitle: "Add Account",
      addNamePlaceholder: "e.g. Home CPA",
      cancelBtn: "Cancel",
      addAnywayBtn: "Add Anyway (Disabled)",
      connectBtn: "Connect",
      connectingBtn: "Connecting…",
      addedDisabledToast: "Account added but disabled. Fix the connection, then turn on Enabled next to the account title.",
      clearKeyConfirm: "Clear this account's API key?",
      clearedKeyToast: "API key cleared",
      enabledToast: "Enabled; its models are synced to the model picker",
      disabledToast: "Disabled; its models were removed from the model picker",
      modelsCountShort: "{n}/{total} models",
      secondsUnit: "s · all accounts",
      paramsHintShort: "Click Save & Apply at the bottom to apply changes.",
      qProviderOther: "Other",
      tabMedia: "Generation",
      mediaIntro: "Models on this account's CPA recognized as image or video generators. CPA serves them through its image and video endpoints, so they never appear in the chat model picker. Changes here are saved at once.",
      mediaLoading: "Loading generation models…",
      mediaLoadError: "Could not load generation models: {error}",
      mediaImageGroup: "Image models",
      mediaVideoGroup: "Video models",
      mediaNone: "No image or video models were recognized in this account's catalog.",
      mediaNoCatalog: "This account's catalog has not been read yet. Connect CPA on the Connection tab, or probe now from the ⋯ menu next to the title.",
      mediaEnabledLabel: "Offer {model} for generation",
      mediaKindFor: "Kind of {model}",
      mediaKindLabel: "Kind",
      mediaKindImage: "Image",
      mediaKindVideo: "Video",
      mediaKindChat: "Chat model",
      mediaDetectedTag: "Detected",
      mediaOverriddenTag: "Set by you",
      mediaResetKind: "Use detected kind",
      mediaAliasTag: "→ {target}",
      mediaAliasHint: "CPA rewrites this model id and calls {target}.",
      mediaMovedTitle: "Changed to chat models",
      mediaMovedHint: "These models were detected as media models, but you changed them to chat models, so they appear on the Models tab.",
      mediaMarkTitle: "Mark another model as a media model",
      mediaMarkHint: "For models detection missed. A marked model leaves the Models tab and the chat model picker.",
      mediaMarkSelect: "Choose a model…",
      mediaMarkBtn: "Mark",
      mediaSaved: "Saved",
      mediaKindSaved: "Saved; the chat model picker was re-synchronized",
      mediaSettingsInvalid: "media-settings.json is unreadable; defaults apply. The next save keeps a copy of the damaged file.",
      mediaErrInvalidAccount: "The account does not exist or was removed. Refresh the page.",
      mediaErrInvalidRequest: "Invalid request. Refresh the page and try again.",
      mediaErrNoEndpoint: "This account has no usable server address yet. Connect CPA on the Connection tab first.",
      mediaErrGeneric: "Failed: {error}",
      diagTitle: "Read-only diagnostic",
      diagHint: "Sends GET requests only: reads both model catalogs with this account's key, then probes two video routes without the key (a route that exists answers 401 at once). Generates nothing and spends no quota. If CPA does not require a key, the probe looks up one nonexistent job id, which is still read-only.",
      diagRun: "Run diagnostic",
      diagRunning: "Diagnosing…",
      diagNoKey: "This account has no API key; reading the catalogs may fail.",
      diagEnriched: "Catalog (client_version=pi)",
      diagListing: "Listing (/v1/models)",
      diagCatalogOk: "{n} models, {m} look like media models",
      diagCatalogFail: "Failed ({reason})",
      diagRoutes: "Video routes",
      diagPresent: "Present",
      diagMissing: "Missing (CPA may be outdated)",
      diagUnknown: "Undetermined (HTTP {status})",
      diagUnreachable: "Unreachable",
      diagRaw: "Full result (JSON, no keys)",
      diagCopy: "Copy result",
      diagCopied: "Copied",
      mediaChipLabel: "Image model: {model}",
      mediaChipChoose: "Choose image model",
      mediaChipTitle: "Generation models",
      mediaChipHint: "Type /cpa-image followed by a prompt to generate an image; attach images to edit them.",
      mediaChipHintBoth: "/cpa-image generates images (attach images to edit them); /cpa-video generates a video (attach one image as the first frame; a submitted video cannot be cancelled).",
      mediaChipVideoLabel: "Video model: {model}",
      mediaChipVideoChoose: "Choose video model",
      mediaChipJoin: "; ",
      mediaChipInherited: "No pick for this session yet; your last pick is used.",
      mediaChipVideoHint: "Type /cpa-video followed by a prompt to generate a video; you can attach one image as the first frame. A submitted video cannot be cancelled.",
      mediaAgentSettings: "Agent generation settings",
      mediaBack: "Back",
      mediaActOpen: "Open with default app",
      mediaActReveal: "Show file location",
      mediaActRevealExplorer: "Show in File Explorer",
      mediaActRevealFinder: "Show in Finder",
      mediaActRevealFiles: "Show in Files",
      mediaActOpenWith: "Open with {app}",
      mediaActOpenWithDefault: "Open with {app} (default)",
      mediaActAppsLoading: "Looking up applications…",
      mediaActOpenFolder: "Open folder",
      mediaActCopyImage: "Copy image",
      mediaActCopyPath: "Copy file path",
      mediaActCopied: "Copied",
      mediaActOpenFailed: "DSH could not open this path.",
      mediaActCopyFailed: "Copy failed: {error}",
      mediaActMenu: "Image actions",
      mediaActMore: "More actions",
      mediaClosePreview: "Close",
      mediaPickFailed: "Could not switch the model: {error}",
      mediaOutputTitle: "Save location",
      mediaVideoDefaults: "Video defaults",
      mediaVideoDefaultsHint: "Length and resolution /cpa-video uses when -s / -r are not given. Shared by all accounts. Videos are billed by the second and cannot be cancelled once submitted.",
      mediaVideoSeconds: "Length",
      mediaVideoResolution: "Resolution",
      mediaSecondsOption: "{n} s",
      mediaOutputHint: "Generated files are saved here. A relative path is resolved against the session's working directory; an absolute path also works. Shared by all accounts.",
      mediaOutputSave: "Save",
      mediaErrInvalidOutputDir: "Invalid save location: it must not be empty, must not contain control characters and is at most 260 characters.",
      mediaErrInvalidModel: "That model is no longer available. Refresh and try again.",
      mediaErrInvalidSession: "Invalid session. Refresh the page.",
      mediaCardSubmitting: "Submitting…",
      mediaCardRunning: "Generating · {time}",
      mediaCardEditing: "Editing · {time}",
      mediaCardVideoQueued: "Queued · {time}",
      mediaCardVideoProgress: "Generating {progress}% · {time}",
      mediaCardVideoSaving: "Saving the video · {time}",
      mediaCardVideoNoStop: "A submitted video cannot be cancelled and is billed as usual; you can keep chatting. After a plugin reload or a DSH restart (within 3 hours) it is still awaited and saved.",
      mediaCardFirstFrame: "first frame",
      mediaModeReference: "references ×{n}",
      mediaModeFirstLast: "first & last frame",
      mediaModeLastFrame: "last frame",
      mediaModeEdit: "video edit",
      mediaModeExtend: "extend +{n} s",
      mediaEditOpen: "Edit video…",
      mediaExtendOpen: "Extend video…",
      mediaEditPlaceholder: "What should change? e.g. make the dress red, keep everything else",
      mediaExtendPlaceholder: "What happens next? e.g. she turns and walks out of frame",
      mediaExtendSeconds: "Extension length",
      mediaEditSubmit: "Submit edit",
      mediaExtendSubmit: "Submit extension",
      mediaEditCancel: "Cancel",
      mediaEditNote: "Uses grok-imagine-video; the result appears in a new row below. A submitted video cannot be cancelled and is billed as usual. For about an hour xAI's own video link is used; after that the local file is sent with the request.",
      mediaSourceTag: "source: {name}",
      mediaCopyInput: "Copy original input",
      mediaLocale: "en",
      mediaConfirmWaiting: "Waiting for your confirmation",
      mediaConfirmTitle: "The agent wants to generate images",
      mediaConfirmTitleVideo: "The agent wants to generate a video",
      mediaConfirmAllow: "Allow",
      mediaConfirmDecline: "Decline",
      mediaConfirmNote: "Nothing is submitted before confirmation. No answer within 10 minutes counts as declined; change this session's confirmation mode in generation settings.",
      mediaConfirmDeliveryFailed: "Answer not delivered. Retry; generation has not been approved.",
      mediaConfirmAllowed: "Allowed; generating",
      mediaConfirmDeclined: "Declined",
      mediaConfirmFailed: "Not delivered: {error}",
      mediaAgentTitle: "Let the agent generate images / videos",
      mediaAgentHint: "When on, the chat agent can call the generate_media tool to generate images and videos, or edit / extend videos, with the generation models enabled above; files go to the save location under the session's working directory. When off the tool is not registered and takes no context. Slash commands and the composer button work either way.",
      mediaAgentOnNote: "On: the agent can call generate_media. Confirmation and the seconds limit can be changed per session in the generation button next to the composer.",
      mediaAgentOffNote: "Off: the agent has no generation tool.",
      mediaVideoConfirm: "Agent videos",
      mediaImageConfirm: "Agent images",
      mediaConfirmAsk: "Ask me each time",
      mediaConfirmAuto: "Generate directly",
      mediaVideoBudget: "Agent video limit per session",
      mediaVideoBudgetHint: "Counted in video seconds (a sub-agent counts against its session). Videos over the limit are refused only when generating directly; when asking, they are counted and the prompt shows the seconds used. Changing the limit or switching to direct generation starts the count again. Your own /cpa-video is not counted.",
      mediaBudgetSeconds: "{n} s",
      mediaBudgetUnlimited: "No limit",
      mediaFollowGlobal: "Follow global ({value})",
      mediaAgentSection: "Agent generation in this session",
      mediaAgentUsed: "Agent videos in this session: {used} of {limit} s",
      mediaAgentUsedUnlimited: "Agent videos in this session: {used} s (no limit)",
      mediaCardInterpreting: "Reading parameters · {time}",
      mediaInterpreted: "Parameters {by} read from the prompt: {items}",
      mediaInterpretedNone: "{by} found no further parameters in the prompt",
      mediaInterpretFailed: "Reading parameters failed ({by}); sent with the command's options and the prompt as written",
      mediaInterpretedPrompt: "; the words stating them were taken out of the prompt",
      mediaSentText: "Mode: text only (no attached images)",
      mediaSentFirstFrame: "Mode: first frame — the attached image is the video's first frame",
      mediaSentReference: "Mode: references ×{n} — brings in the people, clothing and objects shown, without fixing the first frame",
      mediaSentFirstLast: "Mode: first & last frame — image 1 is the first frame, image 2 the last",
      mediaSentLastFrame: "Mode: last frame — the video ends on the attached image",
      mediaSentEdit: "Mode: video edit (grok-imagine-video) — source: {source}",
      mediaSentExtend: "Mode: extend +{n} s (grok-imagine-video) — source: {source}",
      mediaSentImageText: "Mode: text to image",
      mediaSentImageEdit: "Mode: image edit — {n} attached image(s) as references",
      mediaSourceUpload: "uploaded local file {name}",
      mediaSourceUrl: "public link ({name}), downloaded by xAI",
      mediaSourceLink: "a video made in this session (xAI result link)",
      mediaSourceSession: "a video made in this session",
      mediaIgnoredTag: "ignored {words} (edits / extensions keep the source's settings)",
      mediaCopiedInput: "Original input copied",
      mediaEditSubmitted: "Submitted; the result appears in a new row below.",
      mediaEditFailed: "Could not submit.",
      mediaDurationS: "{s} s",
      mediaDurationMS: "{m} min {s} s",
      mediaCardNoStop: "A started generation cannot be stopped; you can keep chatting, and the images appear here when ready.",
      mediaCardDone: "{time} · saved to {folder}",
      mediaCardDoneShort: "Done",
      mediaCardFailed: "Generation failed",
      mediaCardMissing: "The image files were moved or deleted, or fell out of the last 48 generation records kept per session.",
      mediaCardDetails: "Details",
      mediaCardFiles: "Files",
      mediaCardFolder: "Folder",
      mediaCardRevised: "Prompt as rewritten upstream",
      mediaCardImage: "Image {n}",
      mediaCardCount: "{n} images",
      mediaCardRefs: "{n} reference image(s)",
      mediaRunErrInterrupted: "Stopped because the plugin was reloaded or DSH closed.",
      mediaRunErrTimeout: "CPA did not answer within 3 minutes.",
      mediaRunErrNetwork: "Could not reach CPA.",
      mediaRunErrNoImage: "CPA returned no image.",
      mediaRunErrInvalid: "CPA returned data that is not a PNG, JPEG, WebP or GIF image.",
      mediaRunErrWrite: "Could not write the file.",
      mediaRunErrExpired: "CPA no longer knows this video: more than 3 hours have passed since it was submitted.",
      mediaRunErrInvalidVideo: "CPA returned data that is not an MP4, MOV or WebM video.",
      mediaRunErrVideoTooLarge: "The video is larger than 200 MiB and was not saved.",
    };

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
  box-shadow: 0 1px 2px var(--dsw-alias-border-l1);
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
.dcpa-update-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
}
.dcpa-update-row .dcpa-field {
  flex: 1;
  min-width: 0;
}
.dcpa-update-row .dcpa-seg, .dcpa-update-row .dcpa-actions {
  flex: none;
}
.dcpa-update-version {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.dcpa-update-card {
  display: block;
  padding: 0;
}
.dcpa-update-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 10px 14px;
  border-radius: 12px;
  cursor: pointer;
  list-style: none;
}
.dcpa-update-summary::-webkit-details-marker { display: none; }
.dcpa-update-summary:hover { background: var(--dsw-alias-bg-layer-2); }
.dcpa-update-summary:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dcpa-update-summary-title {
  flex: none;
  font-weight: 600;
}
.dcpa-update-summary-current, .dcpa-update-summary-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.dcpa-update-summary-current { flex: 0 1 auto; }
.dcpa-update-summary-status { flex: 1; text-align: right; }
.dcpa-update-summary-status[data-state="available"],
.dcpa-update-summary-status[data-state="downloaded"],
.dcpa-update-summary-status[data-state="installing"],
.dcpa-update-summary-status[data-state="installed"] { color: var(--dsw-alias-brand-primary); }
.dcpa-update-summary-status[data-state="error"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-update-summary::after {
  content: "";
  flex: none;
  width: 7px;
  height: 7px;
  margin-right: 3px;
  border-right: 1.5px solid var(--dsw-alias-label-secondary);
  border-bottom: 1.5px solid var(--dsw-alias-label-secondary);
  transform: rotate(-45deg);
}
.dcpa-update-card[open] > .dcpa-update-summary::after { transform: rotate(45deg); }
.dcpa-update-content {
  padding: 0 14px 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
}
.dcpa-update-content > .dcpa-subtitle { padding: 10px 0; }
.dcpa-update-card .dcpa-seg {
  flex-wrap: wrap;
}
.dcpa-update-card .dcpa-seg-btn:disabled, .dcpa-update-card .dcpa-switch:disabled {
  opacity: 0.5;
  cursor: default;
}
.dcpa-update-card button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dcpa-update-notice {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.dcpa-update-notice p {
  margin: 0;
}
.dcpa-update-code {
  display: block;
  margin: 0;
  padding: 8px 10px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 17px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
.dcpa-update-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
  padding-top: 10px;
}
@media (max-width: 620px) {
  .dcpa-update-row:not(.dcpa-switch-row) {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .dcpa-update-row .dcpa-actions {
    flex-wrap: wrap;
  }
}
/* ---- Section tabs: DSH segmented control ---- */
.dcpa-tabs {
  align-self: flex-start;
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  padding: 4px;
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dcpa-tab, .dcpa-q-seg-tab {
  box-sizing: border-box;
  height: 28px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.dcpa-tab:hover, .dcpa-q-seg-tab:hover { color: var(--dsw-alias-label-primary); }
.dcpa-tab[aria-selected="true"], .dcpa-q-seg-tab[aria-selected="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft, 0 1px 2px var(--dsw-alias-border-l1));
}
.dcpa-tabpanel[hidden] { display: none; }
.dcpa-tab:focus-visible, .dcpa-q-seg-tab:focus-visible, .dcpa-q button:focus-visible, .dcpa-q summary:focus-visible,
.dcpa-q-badge:focus-visible, .dcpa-q-pop button:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}

/* ---- Quota page: flat DSH settings rows ---- */
.dcpa-q {
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}
.dcpa-q-head { padding: 4px 0 12px; }
.dcpa-q-h { margin: 0; font-size: 16px; font-weight: 500; line-height: 24px; }
.dcpa-q-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-seg {
  align-self: flex-start;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  margin: 4px 0 8px;
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dcpa-q-seg-tab { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; }
.dcpa-q-seg-note { font-weight: 400; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-q-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dcpa-q-row-main { min-width: 0; }
.dcpa-q-title { font-size: 14px; line-height: 20px; }
.dcpa-q-sub {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.dcpa-q-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.dcpa-q-form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 16px;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dcpa-q-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  height: 34px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, var(--dsw-alias-border-l2));
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.dcpa-q-input:focus { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dcpa-q-input::placeholder { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-q-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.dcpa-q-btn:disabled { cursor: not-allowed; opacity: 0.4; }
.dcpa-q-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dcpa-q-btn[data-variant="primary"] {
  height: 34px;
  padding: 0 14px;
  border-radius: var(--dsw-radius-md, 10px);
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary));
  color: var(--dsw-alias-label-primary-foreground, var(--dsw-alias-bg-base));
}
.dcpa-q-btn[data-variant="primary"]:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary));
}
.dcpa-q-btn[data-variant="outline"] { border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dcpa-q-btn[data-variant="danger"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-btn[data-variant="danger"]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-bg-layer-2));
}
.dcpa-q-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  border: 0.5px solid var(--dsw-alias-border-l4, var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
}
.dcpa-q-tag[data-tone="success"] {
  border-color: transparent;
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
  color: var(--dsw-alias-state-success-primary);
}
.dcpa-q-tag[data-tone="warning"] {
  border-color: transparent;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  color: var(--dsw-alias-state-warn-primary);
}
.dcpa-q-tag[data-tone="danger"] {
  border-color: transparent;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.dcpa-q-tag[data-tone="info"] {
  border-color: transparent;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)) 10%, transparent);
  color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
}
.dcpa-q-msg { margin: 12px 0 0; font-size: 12px; line-height: 18px; }
.dcpa-q-msg[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-msg[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.dcpa-q-summary { display: flex; flex-direction: column; gap: 8px; padding: 20px 0 4px; }
.dcpa-q-dist {
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dcpa-q-dist span { display: block; height: 100%; }
.dcpa-q-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-legend span { display: inline-flex; align-items: center; gap: 6px; }
.dcpa-q-legend b { font-weight: 500; color: var(--dsw-alias-label-primary); font-variant-numeric: tabular-nums; }
.dcpa-q-swatch { width: 8px; height: 8px; border-radius: 2px; }
[data-level="ok"] > .dcpa-q-swatch, .dcpa-q-dist [data-level="ok"] { background: var(--dsw-alias-state-success-primary); }
[data-level="low"] > .dcpa-q-swatch, .dcpa-q-dist [data-level="low"] { background: var(--dsw-alias-state-warn-primary); }
[data-level="empty"] > .dcpa-q-swatch, .dcpa-q-dist [data-level="empty"] { background: var(--dsw-alias-state-error-primary); }
[data-level="issue"] > .dcpa-q-swatch, .dcpa-q-dist [data-level="issue"] { background: var(--dsw-alias-state-idle-primary); }
[data-level="unknown"] > .dcpa-q-swatch, .dcpa-q-dist [data-level="unknown"] { background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dcpa-q-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 16px 0 0; }
.dcpa-q-filter {
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.dcpa-q-filter:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dcpa-q-filter[aria-pressed="true"] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  font-weight: 500;
}
.dcpa-q-filter small { margin-left: 4px; font-size: 11px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-q-tools .dcpa-q-input { flex: 0 1 220px; height: 28px; margin-left: auto; border-radius: var(--dsw-radius-sm, 8px); }
.dcpa-q-group-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 20px 0 4px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-group-title small { font-weight: 400; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-q-cred {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto;
  align-items: center;
  gap: 8px 24px;
  padding: 14px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
@media (max-width: 640px) { .dcpa-q-cred { grid-template-columns: 1fr; } }
.dcpa-q-cred[data-status="disabled"] .dcpa-q-who, .dcpa-q-cred[data-status="unavailable"] .dcpa-q-who { opacity: 0.55; }
.dcpa-q-who { min-width: 0; }
.dcpa-q-name {
  font-size: 14px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dcpa-q-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2));
  text-underline-offset: 3px;
}
.dcpa-q-link:hover { color: var(--dsw-alias-label-primary); }
.dcpa-q-meters { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px 20px; }
@media (max-width: 640px) { .dcpa-q-meters { justify-content: flex-start; } }
.dcpa-q-meter { width: 128px; display: flex; flex-direction: column; gap: 4px; }
.dcpa-q-meter-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-meter-top span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcpa-q-pct {
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.dcpa-q-meter[data-level="low"] .dcpa-q-pct { color: var(--dsw-alias-state-warn-primary); }
.dcpa-q-meter[data-level="empty"] .dcpa-q-pct { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-track {
  height: 4px;
  border-radius: 2px;
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  overflow: hidden;
}
.dcpa-q-fill { display: block; height: 100%; border-radius: 2px; background: var(--dsw-alias-state-idle-primary); }
[data-level="ok"] > .dcpa-q-track > .dcpa-q-fill { background: var(--dsw-alias-state-success-primary); }
[data-level="mid"] > .dcpa-q-track > .dcpa-q-fill { background: var(--dsw-alias-state-success-primary); opacity: 0.7; }
[data-level="low"] > .dcpa-q-track > .dcpa-q-fill { background: var(--dsw-alias-state-warn-primary); }
[data-level="empty"] > .dcpa-q-track > .dcpa-q-fill { background: var(--dsw-alias-state-error-primary); }
.dcpa-q-reset { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-q-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  text-align: right;
}
.dcpa-q-note[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-models { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.dcpa-q-models code {
  padding: 1px 8px;
  border-radius: 999px;
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 11px;
  line-height: 17px;
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-secondary);
}
.dcpa-q-models code[data-picker="true"] { color: var(--dsw-alias-label-primary); }
.dcpa-q-map { margin-top: 8px; }
.dcpa-q-map > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
  list-style: none;
  cursor: pointer;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dcpa-q-map > summary::-webkit-details-marker { display: none; }
.dcpa-q-map > summary::after {
  content: "";
  flex: none;
  width: 7px;
  height: 7px;
  margin-right: 4px;
  border-right: 1.5px solid var(--dsw-alias-label-secondary);
  border-bottom: 1.5px solid var(--dsw-alias-label-secondary);
  transform: rotate(45deg);
}
.dcpa-q-map[open] > summary::after { transform: rotate(-135deg); }
.dcpa-q-map-row {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(0, 1.5fr) 48px;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l1);
  font-size: 13px;
  line-height: 20px;
}
.dcpa-q-map-model {
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.dcpa-q-map-creds { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dcpa-q-map-pct { text-align: right; }

/* ---- Account page: bar, header, tabs, form rows, save bar ---- */
.dcpa-acct-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dcpa-acct-bar .dcpa-q-seg { margin: 0; }
.dcpa-q-seg-tab .dcpa-dot { width: 6px; height: 6px; }
.dcpa-account { display: flex; flex-direction: column; }
.dcpa-acct-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0 12px;
}
.dcpa-status-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dcpa-acct-tabs { margin: 8px 0 4px; }
.dcpa-tabbody { display: flex; flex-direction: column; }
.dcpa-frow {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  align-items: center;
  gap: 8px 16px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
@media (max-width: 620px) { .dcpa-frow { grid-template-columns: 1fr; } }
.dcpa-frow-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dcpa-frow-control { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dcpa-frow-control > .dcpa-q-input { flex: none; }
.dcpa-frow-control .dcpa-q-msg { margin: 0; }
.dcpa-inline { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dcpa-inline .dcpa-q-input { flex: 1; }
.dcpa-inline-narrow .dcpa-q-input { flex: 0 0 120px; }
select.dcpa-q-input { appearance: auto; padding-right: 8px; }
.dcpa-adv > summary {
  padding: 14px 0;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dcpa-adv > summary:hover { color: var(--dsw-alias-label-primary); }
.dcpa-panel { display: flex; flex-direction: column; padding-top: 16px; }
.dcpa-form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 16px; }
.dcpa-switch:disabled { opacity: 0.5; cursor: default; }
.dcpa-menu { position: relative; display: inline-flex; }
.dcpa-menu-btn { width: 28px; padding: 0; font-size: 16px; letter-spacing: 1px; }
.dcpa-menu-pop {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  isolation: isolate;
  min-width: 160px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  border-radius: var(--dsw-radius-lg, 12px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px var(--dsw-alias-border-l2));
}
.dcpa-menu-pop::before, .dcpa-info-pop::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-layer-1));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
}
.dcpa-menu-item {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-md, 10px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.dcpa-menu-item:hover:not(:disabled), .dcpa-menu-item:focus-visible { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); outline: none; }
.dcpa-menu-item:disabled { opacity: 0.4; cursor: default; }
.dcpa-menu-item[data-variant="danger"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-info { position: relative; display: inline-flex; align-items: center; }
.dcpa-info-btn {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  font: 600 10px/14px Georgia, "Times New Roman", serif;
  font-style: italic;
  text-align: center;
  cursor: help;
}
.dcpa-info-btn:hover, .dcpa-info-btn[aria-expanded="true"] {
  border-color: var(--dsw-alias-label-secondary);
  color: var(--dsw-alias-label-primary);
}
.dcpa-info-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 1px; }
.dcpa-info-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: -8px;
  z-index: 30;
  isolation: isolate;
  width: max-content;
  max-width: 280px;
  padding: 8px 10px;
  border-radius: var(--dsw-radius-md, 10px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  white-space: normal;
  text-align: left;
}
.dcpa-info-pop[data-align="end"] { left: auto; right: -8px; }
.dcpa-savebar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
}
.dcpa-savebar-text { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.dcpa-savebar-text[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.dcpa-savebar-text[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
/* Model tab: same flat rows as the other tabs. */
.dcpa-models { gap: 10px; padding-top: 12px; }
.dcpa-models .dcpa-input { height: 34px; border-radius: var(--dsw-radius-md, 10px); background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base)); border-color: var(--dsw-alias-border-l4, var(--dsw-alias-border-l2)); }
.dcpa-models .dcpa-btn { border: 0; background: transparent; height: 28px; border-radius: var(--dsw-radius-sm, 8px); }
.dcpa-models .dcpa-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dcpa-models .dcpa-seg { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); border: 0; padding: 3px; }
.dcpa-models .dcpa-seg-btn[data-active="true"] { background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-soft, none); }
.dcpa-models .dcpa-chip { border: 0; background: transparent; }
.dcpa-models .dcpa-chip[data-active="true"] { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); color: var(--dsw-alias-label-primary); }
.dcpa-models .dcpa-model-list { max-height: none; overflow: visible; gap: 0; }
.dcpa-models .dcpa-model-row,
.dcpa-models .dcpa-model-row[data-checked="true"] {
  padding: 10px 2px;
  border: 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 0;
  background: transparent;
}
.dcpa-models .dcpa-model-row:hover { background: var(--dsw-alias-interactive-bg-hover, transparent); }
.dcpa-models .dcpa-badge { border: 0; background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); border-radius: 999px; padding: 1px 8px; }
.dcpa-models .dcpa-editor { border-top: 0; padding: 4px 0 6px 25px; }
/* Generation tab: flat rows without checkboxes, kind select + switch on the right. */
.dcpa-media .dcpa-model-row { cursor: default; }
.dcpa-media .dcpa-model-left { flex-wrap: wrap; }
.dcpa-media-block { display: flex; flex-direction: column; }
.dcpa-media-group { display: flex; align-items: center; gap: 4px; margin: 12px 0 0; font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
select.dcpa-q-input.dcpa-media-kind { flex: none; width: auto; height: 28px; font-size: 12px; }
.dcpa-media-card { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dcpa-media-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dcpa-media-diag { display: flex; flex-direction: column; gap: 10px; }
.dcpa-media-diag-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 18px; }
.dcpa-media-diag-list { margin: 4px 0 0; padding-left: 16px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dcpa-media-raw > summary { font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dcpa-media-raw { display: flex; flex-direction: column; gap: 6px; }
/* Generation-model buttons and menus (composer / hero). */
.dcpa-m-chip-group { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.dcpa-m-chip-button { min-width: 0; max-width: 190px; }
.dcpa-m-chip-label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.dcpa-m-chip-button[data-compact] { max-width: none; }
.dcpa-m-chip-part { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.dcpa-m-chip-sep { flex: none; width: 1px; height: 14px; background: var(--dsw-alias-border-l1); }
.dcpa-m-section + .dcpa-m-section { margin-top: 4px; padding-top: 4px; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dcpa-m-section-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dcpa-m-chip svg { flex: none; }
.dcpa-m-chip:disabled { cursor: default; opacity: 0.6; }
.dcpa-m-group { padding: 8px 8px 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dcpa-m-option { display: flex; align-items: center; gap: 6px; width: 100%; }
.dcpa-m-option[aria-checked="true"] { font-weight: 500; }
.dcpa-m-check { width: 14px; flex: none; color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dcpa-m-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dcpa-m-link { font-size: 12px; color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.dcpa-m-foot { margin: 6px 4px 4px; padding-top: 6px; border-top: 0.5px solid var(--dsw-alias-border-l1); }
.dcpa-m-agent-open { display: flex; align-items: center; justify-content: flex-start; gap: 6px; width: 100%; }
.dcpa-m-agent-pane { display: flex; flex-direction: column; gap: 2px; padding: 0 8px 8px; }
.dcpa-m-agent-head { display: flex; align-items: center; gap: 6px; }
.dcpa-m-back { flex: none; }
/* /cpa-image chat row: the request as a user bubble, the result as a reply. */
.dcpa-chat { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 4px 0; }
.dcpa-chat-user { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.dcpa-chat-bubble {
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);
  padding: 10px 16px;
  border-radius: var(--dsw-radius-xl, 18px);
  background: var(--dsw-specific-bubble, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  white-space: pre-wrap;
  word-break: break-word;
}
.dcpa-chat-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-chat-tags button.dcpa-chat-copy { appearance: none; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
.dcpa-chat-tags button.dcpa-chat-copy:hover { color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary)); }
.dcpa-chat-tags button.dcpa-chat-copy:focus-visible { outline: 2px solid var(--dsw-alias-interactive-focus, var(--dsw-alias-label-secondary)); outline-offset: 2px; border-radius: 2px; }
.dcpa-chat-reply { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.dcpa-chat-head { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 22px; color: var(--dsw-alias-label-secondary); }
.dcpa-chat-head svg { flex: none; }
.dcpa-chat-model { color: var(--dsw-alias-label-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcpa-media-agent-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dcpa-media-agent-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.dcpa-media-card[data-agent="off"] .dcpa-media-agent-row { opacity: 0.6; }
.dcpa-m-policy-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dcpa-m-policy-row select { max-width: 60%; }
.dcpa-confirm-dock { width: 100%; min-width: 0; color: var(--dsw-alias-label-primary); }
.dcpa-chat-confirm { margin: 6px 0; padding: 10px 12px; border-radius: var(--dsw-radius-md, 8px); border: 1px solid var(--dsw-alias-border-default, var(--dsw-alias-label-tertiary)); background: var(--dsw-alias-bg-secondary, transparent); }
.dcpa-chat-confirm-title { margin: 0 0 4px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dcpa-chat-confirm-text { margin: 0 0 8px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dcpa-chat-mode { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dcpa-chat-sep { flex: none; width: 2px; height: 2px; border-radius: 1px; background: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-chat-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcpa-chat-status[data-tone="running"] {
  background: linear-gradient(90deg, var(--dsw-alias-label-tertiary, #888) 0%, var(--dsw-alias-label-primary, #444) 50%, var(--dsw-alias-label-tertiary, #888) 100%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: dcpa-shimmer 1.6s linear infinite;
}
.dcpa-chat-error { margin: 0; font-size: var(--dsh-content-font-size-secondary, 13px); line-height: 20px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dcpa-chat-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-chat-grid { display: flex; flex-wrap: wrap; gap: 8px; max-width: 100%; }
.dcpa-chat-thumb {
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg, 12px);
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
  cursor: zoom-in;
  max-width: 100%;
}
.dcpa-chat-thumb img { display: block; width: 200px; height: 200px; object-fit: cover; }
.dcpa-chat-grid[data-count="1"] .dcpa-chat-thumb img { width: auto; height: auto; max-width: min(100%, 420px); max-height: 420px; object-fit: contain; }
.dcpa-chat-skeleton {
  width: 200px;
  max-width: 100%;
  border-radius: var(--dsw-radius-lg, 12px);
  background: linear-gradient(90deg, var(--dsw-alias-bg-layer-2) 0%, var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-1)) 50%, var(--dsw-alias-bg-layer-2) 100%);
  background-size: 200% 100%;
  animation: dcpa-shimmer 1.6s linear infinite;
}
.dcpa-chat-grid[data-count="1"] .dcpa-chat-skeleton { width: 280px; }
.dcpa-chat[data-kind="video"] .dcpa-chat-skeleton { width: 360px; }
.dcpa-chat-videos { display: flex; flex-direction: column; gap: 8px; max-width: 100%; }
.dcpa-chat-edit { display: flex; flex-direction: column; gap: 6px; width: min(100%, 560px); }
.dcpa-chat-edit-input { width: 100%; box-sizing: border-box; resize: vertical; min-height: 56px; font: inherit; }
.dcpa-chat-video { display: block; width: min(100%, 560px); max-height: 480px; border-radius: var(--dsw-radius-lg, 12px); background: var(--dsw-alias-bg-layer-2); }
.dcpa-media-sublabel { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dcpa-media-select { width: auto; min-width: 88px; }
.dcpa-chat-thumb:focus-visible, .dcpa-chat-full-btn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 1px; }
.dcpa-chat-full { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: 100%; }
.dcpa-chat-full-btn { padding: 0; border: 0; background: transparent; cursor: zoom-out; max-width: 100%; }
.dcpa-chat-full-btn img { display: block; max-width: min(100%, 720px); max-height: 640px; border-radius: var(--dsw-radius-lg, 12px); }
.dcpa-q-pop.dcpa-chat-menu { width: 240px; display: flex; flex-direction: column; }
.dcpa-chat-menu .dcpa-menu-item { width: 100%; text-align: left; }
.dcpa-chat-menu-item { display: flex; align-items: center; gap: 8px; }
.dcpa-chat-menu-icon { width: 16px; height: 16px; flex: none; object-fit: contain; }
.dcpa-chat-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcpa-chat-menu-sep { height: 0.5px; margin: 4px 6px; background: var(--dsw-alias-border-l1); }
.dcpa-chat-menu-hint { padding: 4px 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-chat-link { padding: 0; border: 0; background: transparent; font: inherit; text-align: left; color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); cursor: pointer; overflow-wrap: anywhere; }
.dcpa-chat-link:hover { text-decoration: underline; }
.dcpa-chat-link:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 1px; }
.dcpa-chat-files { display: flex; flex-direction: column; gap: 2px; white-space: normal; }
.dcpa-chat-note[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-chat-details > summary { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); cursor: pointer; }
.dcpa-chat-details dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; margin: 4px 0 0; font-size: 12px; line-height: 18px; }
.dcpa-chat-details dt { color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dcpa-chat-details dd { margin: 0; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-wrap; }
@keyframes dcpa-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) {
  .dcpa-chat-status[data-tone="running"], .dcpa-chat-skeleton { animation: none; }
}
.dcpa-media-pre {
  margin: 6px 0;
  max-height: 280px;
  overflow: auto;
  padding: 8px;
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* ---- Composer badge: same metrics as the model selector trigger ---- */
.dcpa-q-wrap { display: inline-flex; align-items: center; flex: none; }
.dcpa-q-badge {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
}
.dcpa-q-badge:hover, .dcpa-q-badge[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dcpa-q-badge-pct { font-variant-numeric: tabular-nums; }
.dcpa-q-badge[data-level="low"] .dcpa-q-badge-pct { color: var(--dsw-alias-state-warn-primary); }
.dcpa-q-badge[data-level="empty"] .dcpa-q-badge-pct { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-bars { display: inline-flex; align-items: flex-end; gap: 1.5px; height: 11px; }
.dcpa-q-bars i { display: block; width: 3px; border-radius: 1px; background: var(--dsw-alias-label-tertiary, var(--dsw-alias-border-l2)); opacity: 0.45; }
.dcpa-q-bars i:nth-child(1) { height: 5px; }
.dcpa-q-bars i:nth-child(2) { height: 8px; }
.dcpa-q-bars i:nth-child(3) { height: 11px; }
.dcpa-q-bars[data-level="ok"] i { background: var(--dsw-alias-state-success-primary); opacity: 1; }
.dcpa-q-bars[data-level="mid"] i:nth-child(-n+2) { background: var(--dsw-alias-state-success-primary); opacity: 1; }
.dcpa-q-bars[data-level="low"] i:nth-child(1) { background: var(--dsw-alias-state-warn-primary); opacity: 1; }
.dcpa-q-bars[data-level="empty"] i { background: var(--dsw-alias-state-error-primary); }

/* ---- Composer peek: the DSH menu surface ---- */
.dcpa-q-pop {
  position: fixed;
  z-index: 1100;
  isolation: isolate;
  box-sizing: border-box;
  width: 340px;
  max-width: calc(100vw - 32px);
  max-height: min(440px, calc(100vh - 96px));
  overflow-y: auto;
  padding: 4px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 12px);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
  text-align: left;
}
.dcpa-q-pop::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-layer-1));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  pointer-events: none;
}
.dcpa-q-pop-head { padding: 8px 8px 6px; }
.dcpa-q-pop-model { font-weight: 500; overflow-wrap: anywhere; }
.dcpa-q-pop-sub { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dcpa-q-pop-cred {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: var(--dsw-radius-md, 10px);
}
.dcpa-q-pop-cred:hover { background: var(--dsw-alias-interactive-bg-hover, transparent); }
.dcpa-q-pop-who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
.dcpa-q-pop-who .dcpa-q-name { font-size: 13px; flex: 0 1 auto; }
.dcpa-q-pop-cred .dcpa-q-meters { justify-content: flex-start; gap: 8px 16px; }
.dcpa-q-pop-cred .dcpa-q-meter { width: 146px; }
.dcpa-q-pop-cred .dcpa-q-note { text-align: left; }
.dcpa-q-pop-text { margin: 0; padding: 4px 8px 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dcpa-q-pop-text[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.dcpa-q-pop-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  padding: 6px 4px 2px 8px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
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
      let payload = null;
      try { payload = await res.json(); } catch {}
      if (!res.ok || payload === null || typeof payload !== "object" || payload.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
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

    const SERVICE_UNAVAILABLE_STATUS = new Set([404, 405, 501]);
    const UPDATE_ERROR_KEYS = {
      "network-error": "updateNetworkError",
      "invalid-metadata": "updateMetadataError",
      "invalid-response": "updateMetadataError",
      "service-unavailable": "updateServiceUnavailableError",
      "forbidden-origin": "updateOriginError",
      "channel-unavailable": "updateChannelUnavailable",
      "unavailable-channel": "updateChannelUnavailable",
      "integrity-error": "updateIntegrityError",
      "invalid-package": "updateInvalidPackage",
      "storage-error": "updateStorageError",
      busy: "updateBusyError",
      "stale-version": "updateStaleVersion",
      disposed: "updateDisposedError",
      "linked-install": "updateLinkedHint",
      "unsupported-host": "updateUnsupportedHint",
      "not-installed": "updateNotInstalledHint",
    };

    function updateErrorText(t, failure, fallback) {
      const code = failure?.updateCode;
      if (typeof code === "string" && Object.prototype.hasOwnProperty.call(UPDATE_ERROR_KEYS, code)) {
        return t(UPDATE_ERROR_KEYS[code]);
      }
      if (failure?.httpStatus) {
        return t("updateHttpError").replace("{status}", String(failure.httpStatus));
      }
      // Server messages may be English or contain internal paths. Do not expose them.
      return t(fallback);
    }

    async function requestPluginUpdate(url, payload, signal) {
      let res;
      try {
        res = await fetch(url, {
          signal,
          cache: "no-store",
          ...(payload === undefined
            ? {}
            : {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              }),
        });
      } catch (err) {
        if (err?.name === "AbortError") throw err;
        const failure = new Error("Update network request failed");
        failure.updateCode = "network-error";
        throw failure;
      }
      let body;
      try {
        body = await res.json();
      } catch {
        const failure = new Error("Invalid update response");
        // A missing route (host plugin not reloaded) answers 404/405 with no
        // update payload; that is "service unavailable", not bad metadata.
        failure.updateCode = !res.ok && SERVICE_UNAVAILABLE_STATUS.has(res.status) ? "service-unavailable" : "invalid-response";
        if (!res.ok) failure.httpStatus = res.status;
        throw failure;
      }
      const validState = body?.update && typeof body.update === "object" && !Array.isArray(body.update);
      if (!res.ok || body?.ok === false || !validState ||
          payload !== undefined && (body.update.error || body.update.errorCode)) {
        const failure = new Error("Update request failed");
        failure.updateCode = body?.errorCode || body?.update?.errorCode ||
          (!validState ? (!res.ok && SERVICE_UNAVAILABLE_STATUS.has(res.status) ? "service-unavailable" : "invalid-response") : null);
        failure.httpStatus = !res.ok ? res.status : null;
        failure.updateState = validState ? body.update : null;
        throw failure;
      }
      return body.update;
    }

    // #region dshmarket installation (Update API v1)

    const MARKET_TERMINAL_STATES = new Set(["succeeded", "failed", "cancelled", "rolled-back"]);
    const MARKET_POLL_MS = 1500;
    const MARKET_MAX_POLL_FAILURES = 20;
    const MARKET_FORCEABLE = new Set(["RELEASE_TOO_FRESH", "VERSION_UNCHANGED"]);
    const AUTO_INSTALL_FIRST_MS = 15000;
    const AUTO_INSTALL_INTERVAL_MS = 5 * 60 * 1000;
    const AUTO_INSTALL_RETRY_MS = 6 * 60 * 60 * 1000;
    const AUTO_INSTALL_MEMORY_KEY = `${PACKAGE_NAME}:market-auto-install`;
    const MARKET_ERROR_KEYS = {
      OPERATION_BUSY: "updateMarketBusy",
      AGENTS_RUNNING: "updateMarketAgentsRunning",
      RELEASE_TOO_FRESH: "updateMarketTooFresh",
      VERSION_UNCHANGED: "updateMarketVersionUnchanged",
      DOWNGRADE_DETECTED: "updateMarketDowngrade",
      RESOLVED_VERSION_MISMATCH: "updateMarketMismatch",
      UPDATE_TIMEOUT: "updateMarketTimeout",
      UPDATE_FORBIDDEN: "updateMarketForbidden",
      PLUGIN_NOT_INSTALLED: "updateNotInstalledHint",
      OPERATION_LOST: "updateMarketLost",
      MARKET_UNREACHABLE: "updateMarketUnreachable",
      RESTART_FAILED: "updateMarketRestartFailed",
    };

    function parseVersion(value) {
      const match = typeof value === "string"
        ? /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
        : null;
      return match ? { parts: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split(".") : [] } : null;
    }

    /** SemVer precedence, or null when either side is not a version. */
    function compareVersions(a, b) {
      const x = parseVersion(a), y = parseVersion(b);
      if (!x || !y) return null;
      for (let i = 0; i < 3; i++) if (x.parts[i] !== y.parts[i]) return x.parts[i] > y.parts[i] ? 1 : -1;
      if (!x.pre.length || !y.pre.length) return x.pre.length ? -1 : y.pre.length ? 1 : 0;
      for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        const p = x.pre[i], q = y.pre[i];
        if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
        if (p === q) continue;
        const pn = /^\d+$/.test(p), qn = /^\d+$/.test(q);
        if (pn && qn) return Number(p) > Number(q) ? 1 : -1;
        if (pn !== qn) return pn ? -1 : 1;
        return p > q ? 1 : -1;
      }
      return 0;
    }

    function validMarketOperation(value) {
      return !!value && typeof value === "object" && value.schema === MARKET_SCHEMA &&
        typeof value.operationId === "string" && value.operationId !== "" &&
        value.packageName === PACKAGE_NAME && typeof value.state === "string";
    }

    const marketFailureCode = (operation) =>
      typeof operation?.failure?.code === "string" && operation.failure.code ? operation.failure.code : "UPDATE_FAILED";

    function marketErrorText(t, code) {
      return t(Object.prototype.hasOwnProperty.call(MARKET_ERROR_KEYS, code) ? MARKET_ERROR_KEYS[code] : "updateMarketFailed");
    }

    /**
     * Shared, page-wide client of the dshmarket Update API. One instance lives
     * per client activation so the settings card and the background
     * auto-install runner observe the same operation.
     */
    function createMarketUpdater(io = {}) {
      const doFetch = io.fetch ?? ((url, init) => fetch(url, init));
      const later = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const cancelLater = io.clearTimeout ?? ((id) => clearTimeout(id));
      let state = {
        phase: "unknown", // unknown | discovering | ready | unavailable
        runtime: null,
        restartSupported: false,
        installing: false,
        automatic: false,
        targetVersion: null,
        operation: null,
        errorCode: null,
        restarting: false,
        restartRequested: false,
      };
      const listeners = new Set();
      const controllers = new Set();
      let disposed = false;
      let discovering = null;
      let pollTimer = null;
      let pollFailures = 0;

      const set = (patch) => {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const listener of [...listeners]) listener(state);
      };
      const request = async (url, init = {}) => {
        const controller = new AbortController();
        controllers.add(controller);
        try {
          const res = await doFetch(url, { cache: "no-store", ...init, signal: controller.signal });
          let body = null;
          try { body = await res.json(); } catch {}
          return { status: res.status, ok: res.ok, body };
        } finally {
          controllers.delete(controller);
        }
      };
      const post = (url, payload) => request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const applyOperation = (operation) => {
        const done = MARKET_TERMINAL_STATES.has(operation.state);
        set({
          operation,
          installing: !done,
          errorCode: done && operation.state === "failed" ? marketFailureCode(operation) : null,
        });
        if (!done) schedulePoll();
      };
      const schedulePoll = () => {
        if (pollTimer !== null) cancelLater(pollTimer);
        pollTimer = later(poll, MARKET_POLL_MS);
      };
      const poll = async () => {
        pollTimer = null;
        const id = state.operation?.operationId;
        if (disposed || !id) return;
        try {
          const { status, body } = await request(`${MARKET_API.operations}?operationId=${encodeURIComponent(id)}`);
          if (disposed || state.operation?.operationId !== id) return;
          if (status === 404) {
            // Operations live in the current Host process only.
            set({ installing: false, errorCode: "OPERATION_LOST" });
            return;
          }
          if (status !== 200 || !validMarketOperation(body?.operation) || body.operation.operationId !== id) {
            throw new Error("Invalid market operation");
          }
          pollFailures = 0;
          applyOperation(body.operation);
        } catch (error) {
          if (disposed || error?.name === "AbortError") return;
          if (++pollFailures >= MARKET_MAX_POLL_FAILURES) set({ installing: false, errorCode: "OPERATION_LOST" });
          else schedulePoll();
        }
      };

      return {
        getState: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        /** Reads only the local capability document; never contacts a registry. */
        discover() {
          if (disposed) return Promise.resolve(state);
          if (discovering) return discovering;
          if (state.phase !== "ready") set({ phase: "discovering" });
          discovering = request(MARKET_API.capabilities)
            .then(({ ok, body }) => {
              const usable = ok && body?.schema === MARKET_SCHEMA && body.apiVersion === 1 && body.features?.update === true;
              set({
                phase: usable ? "ready" : "unavailable",
                runtime: usable && typeof body.runtime === "string" ? body.runtime : null,
                restartSupported: usable && body.features?.restart === true && body.restart?.supported === true,
              });
            }, () => {
              set({ phase: "unavailable", runtime: null, restartSupported: false });
            })
            .finally(() => { discovering = null; })
            .then(() => state);
          return discovering;
        },
        /** Starts one market update operation, then follows it until it settles. */
        async install({ targetVersion = null, force = false, automatic = false } = {}) {
          if (disposed || state.phase !== "ready" || state.installing) return state;
          set({ installing: true, automatic, targetVersion, operation: null, errorCode: null, restartRequested: false });
          try {
            const { status, body } = await post(
              MARKET_API.updates,
              force ? { packageName: PACKAGE_NAME, force: true } : { packageName: PACKAGE_NAME }
            );
            if (disposed) return state;
            if (status === 202 && validMarketOperation(body?.operation)) {
              pollFailures = 0;
              applyOperation(body.operation);
              return state;
            }
            const code = typeof body?.failure?.code === "string" && body.failure.code ? body.failure.code
              : status === 409 ? "OPERATION_BUSY"
              : status === 403 ? "UPDATE_FORBIDDEN"
              : status === 400 ? "UPDATE_REJECTED"
              : status === 404 ? "MARKET_UNREACHABLE"
              : "UPDATE_FAILED";
            set({ installing: false, errorCode: code });
          } catch (error) {
            if (!disposed) set({ installing: false, errorCode: error?.name === "AbortError" ? null : "MARKET_UNREACHABLE" });
          }
          return state;
        },
        /** Only offered when the market reports that it owns process restarts. */
        async restart() {
          if (disposed || !state.restartSupported || state.restarting) return state;
          set({ restarting: true, errorCode: null });
          try {
            const { ok } = await post(MARKET_API.restart, {});
            set({ restarting: false, restartRequested: ok, errorCode: ok ? null : "RESTART_FAILED" });
          } catch (error) {
            set({ restarting: false, errorCode: error?.name === "AbortError" ? null : "RESTART_FAILED" });
          }
          return state;
        },
        dispose() {
          disposed = true;
          if (pollTimer !== null) cancelLater(pollTimer);
          pollTimer = null;
          for (const controller of controllers) controller.abort();
          controllers.clear();
          listeners.clear();
        },
      };
    }

    function readAutoInstallMemory() {
      try {
        const raw = JSON.parse(globalThis.localStorage?.getItem(AUTO_INSTALL_MEMORY_KEY) ?? "null");
        return raw && typeof raw.version === "string" && Number.isFinite(raw.at) ? raw : null;
      } catch {
        return null;
      }
    }

    function writeAutoInstallMemory(record) {
      try { globalThis.localStorage?.setItem(AUTO_INSTALL_MEMORY_KEY, JSON.stringify(record)); } catch {}
    }

    /**
     * Opt-in automatic installation. The Host's own automatic check finds the
     * version (channel/region aware); dshmarket installs it. Runs only while a
     * DSH page is open, reads the local status endpoint only, and tries each
     * version at most once per {@link AUTO_INSTALL_RETRY_MS} across reloads.
     */
    function startAutoInstall(market, io = {}) {
      const later = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const cancelLater = io.clearTimeout ?? ((id) => clearTimeout(id));
      const now = io.now ?? (() => Date.now());
      const memory = io.memory ?? { read: readAutoInstallMemory, write: writeAutoInstallMemory };
      const controller = new AbortController();
      const readStatus = io.readStatus ?? ((signal) => requestPluginUpdate(API.updateStatus, undefined, signal));
      let stopped = false;
      let timer = null;
      const unsubscribe = market.subscribe((state) => {
        const operation = state.operation;
        if (state.automatic && operation?.state === "succeeded" && typeof state.targetVersion === "string" &&
            compareVersions(operation.installedVersion, operation.beforeVersion) === 1) {
          memory.write({ version: state.targetVersion, at: now(), done: true });
        }
      });
      const tick = async () => {
        timer = null;
        try {
          const status = await readStatus(controller.signal);
          if (stopped) return;
          const version = status?.latestVersion;
          if (status?.autoInstall !== true || status.autoCheck !== true || status.available !== true ||
              status.blockedReason || typeof version !== "string" || compareVersions(version, status.currentVersion) !== 1) return;
          const last = memory.read();
          if (last && last.version === version && (last.done === true || now() - last.at < AUTO_INSTALL_RETRY_MS)) return;
          if (market.getState().phase !== "ready") await market.discover();
          const snapshot = market.getState();
          if (stopped || snapshot.phase !== "ready" || snapshot.installing) return;
          memory.write({ version, at: now() });
          await market.install({ targetVersion: version, automatic: true });
        } catch {
          // Background work never surfaces errors; the card shows the market state.
        } finally {
          if (!stopped) timer = later(tick, AUTO_INSTALL_INTERVAL_MS);
        }
      };
      timer = later(tick, AUTO_INSTALL_FIRST_MS);
      return () => {
        stopped = true;
        if (timer !== null) cancelLater(timer);
        controller.abort();
        unsubscribe();
      };
    }

    let sharedMarket = null;

    // #endregion

    /** Update state is isolated: polling never reloads account data or drafts. */
    function PluginUpdatePanel({ t, market = null, initiallyOpen = false }) {
      const [update, setUpdate] = useState(null);
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(null);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [confirmVersion, setConfirmVersion] = useState(null);
      const lifecycle = useRef(null);

      const loadStatus = useCallback(async () => {
        const life = lifecycle.current;
        if (!life?.mounted || life.action || life.polling) return;
        life.polling = true;
        const serial = ++life.serial;
        const controller = new AbortController();
        life.controllers.add(controller);
        life.statusController = controller;
        try {
          // This GET is read-only. Only an explicit check action probes the registry.
          const next = await requestPluginUpdate(API.updateStatus, undefined, controller.signal);
          if (!life.mounted || serial !== life.serial) return;
          life.snapshot = next;
          setUpdate(next);
          setError((previous) => (previous?.source === "status" ? null : previous));
        } catch (failure) {
          if (!life.mounted || serial !== life.serial || failure?.name === "AbortError") return;
          setError((previous) =>
            previous && previous.source !== "status"
              ? previous
              : { failure, fallback: "updateLoadFailed", source: "status" }
          );
        } finally {
          life.controllers.delete(controller);
          if (life.statusController === controller) life.statusController = null;
          life.polling = false;
          if (life.mounted) setLoading(false);
        }
      }, []);

      useEffect(() => {
        // A fresh lifetime also prevents old StrictMode/HMR requests from winning.
        const life = {
          mounted: true,
          action: false,
          polling: false,
          serial: 0,
          controllers: new Set(),
          statusController: null,
          snapshot: null,
        };
        lifecycle.current = life;
        let timer;
        const poll = async () => {
          await loadStatus();
          if (life.mounted) {
            timer = setTimeout(poll, life.snapshot?.checking || life.snapshot?.downloading ? 2000 : 15000);
          }
        };
        void poll();
        return () => {
          life.mounted = false;
          life.serial += 1;
          clearTimeout(timer);
          for (const controller of life.controllers) controller.abort();
          life.controllers.clear();
        };
      }, [loadStatus]);

      const runAction = useCallback(async (kind, payload = {}) => {
        const life = lifecycle.current;
        if (!life?.mounted || life.action || life.snapshot?.checking || life.snapshot?.downloading) return;
        life.action = true;
        life.serial += 1;
        life.statusController?.abort();
        setBusy(kind);
        setError(null);
        setNotice(null);
        setConfirmVersion(null);
        const controller = new AbortController();
        life.controllers.add(controller);
        const url = kind === "save" ? API.updateSave : kind === "download" ? API.updateDownload : API.updateCheck;
        try {
          const next = await requestPluginUpdate(url, payload, controller.signal);
          if (!life.mounted) return;
          life.snapshot = next;
          setUpdate(next);
          if (kind === "save") setNotice("updateSaved");
          if (kind === "download" && !next.downloadedVersion) setNotice("updateDownloadRequested");
        } catch (failure) {
          if (!life.mounted || failure?.name === "AbortError") return;
          if (failure?.updateState && typeof failure.updateState === "object") {
            life.snapshot = failure.updateState;
            setUpdate(failure.updateState);
          }
          setError({
            failure,
            fallback: kind === "save" ? "updateSaveFailed" : kind === "download" ? "updateDownloadFailed" : "updateCheckFailed",
            source: kind,
          });
        } finally {
          life.controllers.delete(controller);
          life.action = false;
          if (life.mounted) setBusy(null);
        }
      }, []);

      // dshmarket state is shared with the background auto-install runner.
      const [marketState, setMarketState] = useState(() => market?.getState() ?? null);
      const [confirmInstall, setConfirmInstall] = useState(null);
      useEffect(() => {
        if (!market) return undefined;
        let live = true;
        const unsubscribe = market.subscribe((next) => { if (live) setMarketState(next); });
        setMarketState(market.getState());
        if (market.getState().phase === "unknown") void market.discover();
        return () => {
          live = false;
          unsubscribe();
        };
      }, [market]);

      const working = loading || busy !== null || update?.checking === true || update?.downloading === true;
      const blockedReason = update?.blockedReason;
      const downloadBlocked = !!blockedReason && blockedReason !== "linked-install";
      const blockedKey = blockedReason === "linked-install"
        ? "updateLinkedHint"
        : blockedReason === "unsupported-host"
        ? "updateUnsupportedHint"
        : blockedReason === "not-installed"
        ? "updateNotInstalledHint"
        : "updateBlockedHint";
      const canDownload = !!update?.available && typeof update.latestVersion === "string" && !!update.latestVersion && !downloadBlocked;
      const downloading = busy === "download" || update?.downloading === true;
      const checking = busy === "check" || update?.checking === true;
      const availableVersion = update?.latestVersion || t("updateNotChecked");
      const versionSummary = t("updateVersionSummary")
        .replace("{current}", update?.currentVersion || t("updateUnknownVersion"))
        .replace("{latest}", availableVersion);
      const statusError = update?.error || update?.errorCode
        ? { updateCode: update.errorCode }
        : null;
      const linkedInstall = blockedReason === "linked-install";
      const marketReady = marketState?.phase === "ready";
      const marketOperation = marketState?.operation ?? null;
      const marketInstalling = marketState?.installing === true;
      const marketInstalledVersion = marketOperation?.state === "succeeded" &&
        compareVersions(marketOperation.installedVersion, marketOperation.beforeVersion) === 1
        ? marketOperation.installedVersion : null;
      const canMarketInstall = marketReady && !linkedInstall && !downloadBlocked && !marketInstalling &&
        !marketInstalledVersion && !!update?.available && typeof update.latestVersion === "string" && !!update.latestVersion;
      const compactState = loading ? "loading" : marketInstalling ? "installing" : downloading ? "downloading" : checking ? "checking" :
        marketInstalledVersion ? "installed" :
        error || statusError ? "error" : update?.downloadedVersion && update.downloadedVersion === update.latestVersion ? "downloaded" :
          update?.available ? "available" : "idle";
      // Name the actual failure instead of a generic "update error": the
      // status endpoint missing (host not reloaded) reads very differently
      // from a registry that could not be reached.
      const failureCode = statusError?.updateCode ?? update?.errorCode ?? null;
      const compactErrorKey = error
        ? error.source === "status" ? "updateCompactStatusUnavailable" : "updateCompactError"
        : failureCode === "network-error" ? "updateCompactErrorNetwork"
        : failureCode === "service-unavailable" ? "updateCompactStatusUnavailable"
        : failureCode === "channel-unavailable" ? "updateCompactErrorChannel"
        : "updateCompactError";
      const compactText = loading ? t("updateLoading") : marketInstalling ? t("updateMarketInstalling") :
        downloading ? t("updateDownloading") : checking ? t("updateChecking") :
        marketInstalledVersion ? t("updateCompactInstalled").replace("{version}", marketInstalledVersion) :
        error || statusError ? t(compactErrorKey) : compactState === "downloaded"
          ? t("updateCompactDownloaded").replace("{version}", update.downloadedVersion)
          : update?.available ? t("updateCompactAvailable").replace("{version}", availableVersion)
          : update?.latestVersion ? t("updateUpToDate") : t("updateNotChecked");
      let checkedAt = t("updateNotChecked");
      if (update?.lastCheckedAt) {
        const date = new Date(update.lastCheckedAt);
        if (Number.isFinite(date.getTime())) checkedAt = date.toLocaleString();
      }
      const regionName = (region) => t(region === "cn" ? "updateRegionCn" : "updateRegionGlobal");
      const segmented = (field, label, options, selected) =>
        h(
          "div",
          { className: "dcpa-seg", role: "group", "aria-label": t(label) },
          options.map(([value, key]) =>
            h("button", {
              key: value,
              type: "button",
              className: "dcpa-seg-btn",
              disabled: working || !update,
              "aria-pressed": selected === value,
              "data-active": selected === value ? "true" : "false",
              onClick: () => { if (selected !== value) void runAction("save", { [field]: value }); },
            }, t(key))
          )
        );
      const toggle = (field, label, hint, checked, unavailable = false) =>
        h(
          "div",
          { className: "dcpa-update-row dcpa-switch-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t(label)),
            h("p", { className: "dcpa-hint" }, t(hint))
          ),
          h("button", {
            type: "button",
            role: "switch",
            className: "dcpa-switch",
            "aria-label": t(label),
            "aria-checked": checked,
            // An unavailable feature can still be switched off, never on.
            disabled: working || !update || unavailable && !checked,
            onClick: () => { void runAction("save", { [field]: !checked }); },
          }, h("span", { className: "dcpa-switch-thumb" }))
        );

      // One-click/automatic installation through dshmarket. Hidden entirely
      // when the card is rendered without a market client (tests, previews).
      let marketSection = null;
      if (market) {
        const phase = marketState?.phase ?? "unknown";
        const hintKey = phase === "ready"
          ? linkedInstall ? "updateMarketLinkedHint" : "updateMarketReadyHint"
          : phase === "unavailable" ? "updateMarketUnavailableHint" : "updateMarketDetecting";
        const operation = marketOperation;
        const progress = operation?.progress;
        const percent = typeof progress?.percent === "number" && Number.isFinite(progress.percent) ? Math.round(progress.percent) : null;
        const errorCode = marketState?.errorCode ?? null;
        const outcome = operation?.outcome ?? {};
        const target = marketState?.targetVersion;
        const prefix = marketState?.automatic ? `${t("updateMarketAutomaticPrefix")} ` : "";
        let result = null;
        if (marketInstalling) {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-label" }, prefix + (percent === null
              ? t("updateMarketInstalling")
              : t("updateMarketProgress").replace("{percent}", String(percent))))
          );
        } else if (marketInstalledVersion) {
          const restartHint = outcome.restartRequired
            ? marketState?.restartSupported ? "updateMarketRestartHint"
              : marketState?.runtime === "desktop" ? "updateMarketRestartDesktopHint" : "updateMarketRestartManualHint"
            : outcome.refreshRequired ? "updateMarketRefreshHint" : "updateMarketAppliedHint";
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-success" }, prefix + t("updateMarketInstalled").replace("{version}", marketInstalledVersion)),
            typeof target === "string" && compareVersions(marketInstalledVersion, target) === -1
              ? h("p", { className: "dcpa-hint" }, t("updateMarketVersionLower").replace("{installed}", marketInstalledVersion).replace("{target}", target))
              : null,
            h("p", { className: "dcpa-hint" }, t(marketState?.restartRequested ? "updateMarketRestartRequested" : restartHint)),
            outcome.restartRequired && marketState?.restartSupported && !marketState?.restartRequested
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    disabled: marketState?.restarting === true,
                    onClick: () => { void market.restart(); },
                  }, marketState?.restarting ? t("updateMarketRestarting") : t("updateMarketRestartBtn")))
              : !outcome.restartRequired && outcome.refreshRequired
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    onClick: () => { globalThis.location?.reload(); },
                  }, t("updateMarketRefreshBtn")))
              : null
          );
        } else if (operation?.state === "succeeded") {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-hint" }, prefix + t("updateMarketUnchanged")));
        } else if (operation?.state === "cancelled" || operation?.state === "rolled-back") {
          result = h("div", { className: "dcpa-update-notice", role: "status" },
            h("p", { className: "dcpa-hint" }, prefix + t(operation.state === "cancelled" ? "updateMarketCancelled" : "updateMarketRolledBack")));
        }
        const errorBlock = errorCode && !marketInstalling
          ? h("div", { className: "dcpa-update-notice" },
              h("p", { className: "dcpa-error", role: "alert" }, prefix + marketErrorText(t, errorCode)),
              MARKET_FORCEABLE.has(errorCode) && canMarketInstall
                ? h("div", { className: "dcpa-actions" },
                    h("button", {
                      type: "button",
                      className: "dcpa-btn",
                      disabled: working,
                      onClick: () => { void market.install({ targetVersion: update.latestVersion, force: true }); },
                    }, t("updateMarketForceBtn")))
                : null)
          : null;
        marketSection = h(React.Fragment, null,
          h("div", { className: "dcpa-update-row" },
            h("div", { className: "dcpa-field" },
              h("span", { className: "dcpa-label" }, t("updateMarketLabel")),
              h("p", { className: "dcpa-hint" }, t(hintKey))
            ),
            phase === "ready" && !linkedInstall
              ? h("div", { className: "dcpa-actions" },
                  h("button", {
                    type: "button",
                    className: "dcpa-btn dcpa-btn-primary",
                    disabled: working || !canMarketInstall,
                    onClick: () => { setConfirmVersion(null); setConfirmInstall(update.latestVersion); },
                  }, marketInstalling ? t("updateMarketInstalling")
                    : marketInstalledVersion ? t("updateMarketInstalledBtn") : t("updateMarketInstallBtn")))
              : phase === "unavailable"
              ? h("div", { className: "dcpa-actions" },
                  h("button", { type: "button", className: "dcpa-btn", onClick: () => { void market.discover(); } }, t("updateMarketRedetectBtn")))
              : null
          ),
          confirmInstall ? h("div", {
            className: "dcpa-update-notice",
            role: "alertdialog",
            "aria-modal": false,
            "aria-label": t("updateMarketConfirmTitle").replace("{version}", confirmInstall),
          },
            h("p", { className: "dcpa-label" }, t("updateMarketConfirmTitle").replace("{version}", confirmInstall)),
            h("p", { className: "dcpa-hint" }, t("updateMarketConfirmHint")),
            h("div", { className: "dcpa-actions" },
              h("button", {
                type: "button",
                className: "dcpa-btn dcpa-btn-primary",
                disabled: working || !canMarketInstall || confirmInstall !== update?.latestVersion,
                onClick: () => {
                  const version = confirmInstall;
                  setConfirmInstall(null);
                  void market.install({ targetVersion: version });
                },
              }, t("updateMarketConfirmBtn")),
              h("button", { type: "button", className: "dcpa-btn", onClick: () => setConfirmInstall(null) }, t("updateCancelBtn"))
            ),
            confirmInstall !== update?.latestVersion ? h("p", { className: "dcpa-hint" }, t("updateStaleVersion")) : null
          ) : null,
          result,
          errorBlock
        );
      }

      // Native details starts closed. Do not control `open`: polling and saves
      // must preserve the user's expanded/collapsed choice without remounting.
      // `initiallyOpen` (the update-only plugin page) passes a constant `true`
      // that never changes, so React never rewrites it after mount and the
      // user can still collapse the card.
      return h(
        "details",
        {
          className: "dcpa-card dcpa-update-card",
          "aria-label": t("updateTitle"),
          "aria-busy": working,
          ...(initiallyOpen ? { open: true } : {}),
        },
        h("summary", { className: "dcpa-update-summary", title: t("updateToggleDetails") },
          h("span", { className: "dcpa-update-summary-title" }, t("updateTitle")),
          h("span", { className: "dcpa-update-summary-current" },
            t("updateCompactCurrent").replace("{version}", update?.currentVersion || t("updateUnknownVersion"))),
          h("span", { className: "dcpa-update-summary-status", "data-state": compactState, role: "status", "aria-live": "polite" }, compactText)
        ),
        h("div", { className: "dcpa-update-content" },
        h("p", { className: "dcpa-subtitle" }, t("updateSubtitle")),
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateNewVersion")),
            h("span", { className: "dcpa-update-version", role: "status", "aria-live": "polite" },
              loading ? t("updateLoading") : downloading ? t("updateDownloading") : checking ? t("updateChecking") :
                update?.available ? availableVersion : update?.latestVersion ? t("updateUpToDate") : t("updateNotChecked")
            ),
            h("p", { className: "dcpa-hint" }, versionSummary),
            update?.available ? h("span", { className: "dcpa-hint" }, t("updateAvailable")) : null
          ),
          h("div", { className: "dcpa-actions" },
            h("button", {
              type: "button",
              className: "dcpa-btn",
              disabled: working,
              onClick: () => { if (update) void runAction("check"); else { setLoading(true); void loadStatus(); } },
            }, checking ? t("updateChecking") : !update && !loading ? t("updateRetryBtn") : t("updateCheckBtn")),
            h("button", {
              type: "button",
              className: marketReady && !linkedInstall ? "dcpa-btn" : "dcpa-btn dcpa-btn-primary",
              disabled: working || !canDownload,
              onClick: () => { setConfirmInstall(null); setConfirmVersion(update.latestVersion); },
            }, downloading ? t("updateDownloading") : update?.downloadedVersion === update?.latestVersion && update?.downloadedVersion
              ? t("updateDownloadedBtn") : t("updateDownloadBtn"))
          )
        ),
        confirmVersion ? h("div", {
          className: "dcpa-update-notice",
          role: "alertdialog",
          "aria-modal": false,
          "aria-label": t("updateConfirmTitle").replace("{version}", confirmVersion),
        },
          h("p", { className: "dcpa-label" }, t("updateConfirmTitle").replace("{version}", confirmVersion)),
          h("p", { className: "dcpa-hint" }, t(blockedReason === "linked-install" ? "updateLinkedConfirmHint" : "updateConfirmHint")),
          h("div", { className: "dcpa-actions" },
            h("button", {
              type: "button",
              className: "dcpa-btn dcpa-btn-primary",
              disabled: working || !canDownload || confirmVersion !== update?.latestVersion,
              onClick: () => { void runAction("download", { version: confirmVersion }); },
            }, t("updateConfirmBtn")),
            h("button", { type: "button", className: "dcpa-btn", onClick: () => setConfirmVersion(null) }, t("updateCancelBtn"))
          ),
          confirmVersion !== update?.latestVersion ? h("p", { className: "dcpa-hint" }, t("updateStaleVersion")) : null
        ) : null,
        marketSection,
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateChannelLabel")),
            h("p", { className: "dcpa-hint" }, t("updateChannelHint"))
          ),
          segmented("channel", "updateChannelLabel", [
            ["stable", "updateChannelStable"], ["beta", "updateChannelBeta"], ["dev", "updateChannelDev"],
          ], update?.channel || "stable")
        ),
        h("div", { className: "dcpa-update-row" },
          h("div", { className: "dcpa-field" },
            h("span", { className: "dcpa-label" }, t("updateRegionLabel")),
            h("p", { className: "dcpa-hint" }, t("updateRegionHint")),
            update?.effectiveRegion ? h("p", { className: "dcpa-hint" }, t("updateEffectiveRegion").replace("{region}", regionName(update.effectiveRegion))) : null
          ),
          segmented("region", "updateRegionLabel", [
            ["auto", "updateRegionAuto"], ["global", "updateRegionGlobal"], ["cn", "updateRegionCn"],
          ], update?.region || "auto")
        ),
        toggle("autoCheck", "updateAutoCheckLabel", "updateAutoCheckHint", update?.autoCheck !== false),
        toggle("autoDownload", "updateAutoDownloadLabel", "updateAutoDownloadHint", update?.autoDownload === true),
        toggle("autoInstall", "updateAutoInstallLabel", "updateAutoInstallHint", update?.autoInstall === true,
          !marketReady || linkedInstall || downloadBlocked),
        blockedReason ? h("div", { className: "dcpa-update-notice" }, h("p", { className: "dcpa-hint" }, t(blockedKey))) : null,
        update?.downloadedVersion && update?.downloadPath ? h("div", { className: "dcpa-update-notice", role: "status" },
          h("p", { className: "dcpa-label" }, t(blockedReason === "linked-install" ? "updateLinkedDownloadedHint" : "updateDownloadedHint").replace("{version}", update.downloadedVersion)),
          h("span", { className: "dcpa-label" }, t("updateDownloadPathLabel")),
          h("code", { className: "dcpa-update-code" }, update.downloadPath),
          blockedReason !== "linked-install" && update.upgradeCommand ? h(React.Fragment, null,
            h("span", { className: "dcpa-label" }, t("updateUpgradeCommandLabel")),
            h("pre", { className: "dcpa-update-code" }, h("code", null, update.upgradeCommand))
          ) : h("p", { className: "dcpa-hint" }, t(blockedReason === "linked-install" ? "updateLinkedSourceHint" : "updateCommandUnavailable"))
        ) : null,
        h("div", { className: "dcpa-update-footer" },
          error ? h("p", { className: "dcpa-error", role: "alert" }, updateErrorText(t, error.failure, error.fallback)) :
            statusError ? h("p", { className: "dcpa-error", role: "alert" }, updateErrorText(t, statusError, "updateCheckFailed")) : null,
          error?.source === "status" ? h("p", { className: "dcpa-hint", role: "note" }, t("updateStatusUnavailableHint")) : null,
          busy === "save" ? h("p", { className: "dcpa-hint", role: "status" }, t("updateSaving")) :
            notice ? h("p", { className: "dcpa-success", role: "status" }, t(notice)) : null,
          h("p", { className: "dcpa-hint" }, t("updateLastChecked").replace("{time}", checkedAt)),
          h("p", { className: "dcpa-hint" }, t("updateOfflineHint"))
        )
        )
      );
    }

    /**
     * The plugin's own page under Plugins (bundle page and Plugins tab): only
     * plugin updates. Account and model settings live in their own settings
     * section ({@link CpaSettingsPanel}).
     */
    function PluginUpdatePage({ t }) {
      return h(
        "div",
        { className: "dcpa-wrap", "data-dsh-plugin": MODULE_ID },
        h("p", { className: "dcpa-hint" }, t("updatePageHint")),
        h(PluginUpdatePanel, { t, market: sharedMarket, initiallyOpen: true })
      );
    }

    /**
     * Small "i" help button: the explanation opens on hover, keyboard focus or
     * click (touch), closes on Escape / leaving. The text stays in the locale
     * dictionaries and is announced through aria-describedby.
     */
    function InfoTip({ t, text }) {
      const [open, setOpen] = useState(false);
      const [alignEnd, setAlignEnd] = useState(false);
      const ref = useRef(null);
      const id = useMemo(() => `dcpa-tip-${Math.random().toString(36).slice(2, 9)}`, []);
      if (!text) return null;
      // Open towards the roomier side of the surrounding page.
      const show = () => {
        const el = ref.current;
        const box = el?.closest?.(".dcpa-wrap, .dcpa-q-pop")?.getBoundingClientRect?.();
        const r = el?.getBoundingClientRect?.();
        if (box && r) setAlignEnd(r.left - box.left > box.width / 2);
        setOpen(true);
      };
      return h(
        "span",
        {
          ref,
          className: "dcpa-info",
          onMouseEnter: show,
          onMouseLeave: () => setOpen(false),
        },
        h(
          "button",
          {
            type: "button",
            className: "dcpa-info-btn",
            "aria-label": t("infoLabel"),
            "aria-describedby": open ? id : undefined,
            "aria-expanded": open,
            onClick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (open) setOpen(false);
              else show();
            },
            onFocus: show,
            onBlur: () => setOpen(false),
            onKeyDown: (e) => {
              if (e.key === "Escape") setOpen(false);
            },
          },
          "i"
        ),
        open ? h("span", { id, role: "tooltip", className: "dcpa-info-pop", "data-align": alignEnd ? "end" : "start" }, text) : null
      );
    }

    /** One labelled form row: label (+ help) on the left, control on the right. */
    function FieldRow({ t, label, help, htmlFor, children, stack = false }) {
      return h(
        "div",
        { className: stack ? "dcpa-frow dcpa-frow-stack" : "dcpa-frow" },
        h(
          "div",
          { className: "dcpa-frow-label" },
          htmlFor ? h("label", { htmlFor }, label) : h("span", null, label),
          help ? h(InfoTip, { t, text: help }) : null
        ),
        h("div", { className: "dcpa-frow-control" }, children)
      );
    }

    function accountStateLabel(t, state) {
      return state === "connected"
        ? t("statusConnected")
        : state === "probing"
        ? t("statusProbing")
        : state === "error"
        ? t("statusError")
        : state === "disabled"
        ? t("statusDisabled")
        : t("statusIdle");
    }

    /** Lowest remaining percentage among an account's usable credentials (tab hint). */
    function accountQuotaFloor(quotaData, accountId) {
      const account = (quotaData?.accounts ?? []).find((a) => a.accountId === accountId);
      if (!account || account.keyConfigured !== true) return null;
      const values = (account.credentials ?? [])
        .filter((c) => c.status === "active")
        .map((c) => credentialHeadroom(c))
        .filter((v) => v !== null);
      return values.length > 0 ? Math.min(...values) : null;
    }

    /**
     * The CLIProxyAPI settings section: one account bar for every tab, then the
     * selected account's header, its 连接 / 模型 / 额度 tabs and one save bar.
     * Owns the account server data; the add-account form creates an account only
     * when the user connects it.
     */
    function CpaSettingsPanel({ t }) {
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState(null); // null | "refresh" | "save" | "patch" | "add" | "remove" | "test"
      const [loadError, setLoadError] = useState(null);
      const [notice, setNotice] = useState(null); // { tone: "ok" | "error", text }
      const [data, setData] = useState(null);
      const [activeId, setActiveId] = useState(null);
      // Bumped whenever the server's saved config should replace the drafts.
      const [rev, setRev] = useState(0);
      const [adding, setAdding] = useState(false);
      const dirtyRef = useRef(false);

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
          setLoadError(null);
        } catch (err) {
          setLoadError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        void fetchStatus();
      }, [fetchStatus]);

      // Success messages fade after a few seconds; errors stay until the next action.
      useEffect(() => {
        if (notice?.tone !== "ok") return undefined;
        const id = setTimeout(() => setNotice(null), 4000);
        return () => clearTimeout(id);
      }, [notice]);

      const confirmDiscard = useCallback(() => {
        if (!dirtyRef.current) return true;
        if (typeof window === "undefined" || typeof window.confirm !== "function") return true;
        return window.confirm(t("discardConfirm"));
      }, [t]);

      const run = useCallback(async (kind, fn) => {
        setBusy(kind);
        setNotice(null);
        try {
          return await fn();
        } catch (err) {
          setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
          return undefined;
        } finally {
          setBusy(null);
        }
      }, []);

      const selectAccount = (id) => {
        if (id === active?.id && !adding) return;
        if (!confirmDiscard()) return;
        dirtyRef.current = false;
        setAdding(false);
        setNotice(null);
        setActiveId(id);
        setRev((r) => r + 1);
      };

      const actions = {
        refresh: (accountId) =>
          run("refresh", async () => {
            setData(await postJson(API.refresh, { accountId }));
          }),
        save: (accountId, payload) =>
          run("save", async () => {
            setData(await postJson(API.save, { ...payload, accountId }));
            dirtyRef.current = false;
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: t("savedToast") });
          }),
        // One field, applied at once (enable switch, clear key); drafts stay.
        patch: (accountId, patch, okText) =>
          run("patch", async () => {
            setData(await postJson(API.save, { ...patch, accountId }));
            if (okText) setNotice({ tone: "ok", text: okText });
          }),
        test: (accountId, draft) =>
          run("test", async () => (await postJson(API.testAccount, { ...(accountId ? { accountId } : {}), ...draft })).test),
        remove: (account) => {
          const name = account.config?.displayName || account.id;
          if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(fmt(t, "removeConfirm", { name }))) return;
          void run("remove", async () => {
            const body = await postJson(API.removeAccount, { accountId: account.id });
            dirtyRef.current = false;
            setData(body);
            setActiveId(body.accounts?.[0]?.id ?? null);
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: t("removedToast") });
          });
        },
        // Fresh account status from another request (a media reclassification
        // re-synced routes); drafts stay, so `rev` is not bumped.
        adopt: (payload) => {
          if (Array.isArray(payload?.accounts)) setData(payload);
        },
        // Reload the drafts from the saved config.
        discard: () => {
          dirtyRef.current = false;
          setNotice(null);
          setRev((r) => r + 1);
        },
        add: (draft, enabled) =>
          run("add", async () => {
            const body = await postJson(API.addAccount, { ...draft, enabled });
            setData(body);
            if (body.createdId) setActiveId(body.createdId);
            setAdding(false);
            setRev((r) => r + 1);
            setNotice({ tone: "ok", text: enabled ? t("addedToast") : t("addedDisabledToast") });
          }),
      };

      const showAdd = adding || (!loading && data !== null && accounts.length === 0);

      return h(
        "div",
        { className: "dcpa-wrap dcpa-q", "data-dsh-plugin": MODULE_ID },
        h(
          "div",
          { className: "dcpa-acct-bar" },
          accounts.length > 0
            ? h(
                "div",
                { className: "dcpa-q-seg", role: "tablist", "aria-label": t("accountsLabel") },
                accounts.map((a) =>
                  h(
                    "button",
                    {
                      key: a.id,
                      type: "button",
                      role: "tab",
                      className: "dcpa-q-seg-tab",
                      "aria-selected": !showAdd && active?.id === a.id,
                      title: a.config?.provider,
                      onClick: () => selectAccount(a.id),
                    },
                    h("span", { className: stateDotClass(a.config?.enabled === false ? "idle" : a.status?.state) }),
                    a.config?.displayName || a.id
                  )
                )
              )
            : null,
          h(
            "button",
            {
              type: "button",
              className: "dcpa-q-btn",
              "data-variant": "outline",
              disabled: busy !== null || loading || showAdd,
              onClick: () => {
                if (!confirmDiscard()) return;
                dirtyRef.current = false;
                setNotice(null);
                setAdding(true);
              },
            },
            t("addAccountBtn")
          )
        ),
        loadError ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, loadError) : null,
        showAdd
          ? h(AddAccountForm, {
              t,
              busy,
              notice,
              canCancel: accounts.length > 0,
              onCancel: () => {
                setAdding(false);
                setNotice(null);
              },
              onTest: (draft) => actions.test(undefined, draft),
              onAdd: actions.add,
            })
          : active
          ? h(AccountPanel, {
              key: active.id,
              t,
              account: active,
              global: data?.global ?? {},
              rev,
              busy,
              notice,
              actions,
              onDirtyChange: (dirty) => {
                dirtyRef.current = dirty;
              },
            })
          : null
      );
    }

    /** Add an account: name, address, key → test, then create enabled (or disabled on request). */
    function AddAccountForm({ t, busy, notice, canCancel, onCancel, onTest, onAdd }) {
      const [displayName, setDisplayName] = useState("");
      const [baseURL, setBaseURL] = useState("");
      const [apiKey, setApiKey] = useState("");
      const [failure, setFailure] = useState(null);

      const draft = () => ({
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        baseURL: baseURL.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      const connect = async () => {
        setFailure(null);
        const result = await onTest({ baseURL: baseURL.trim(), apiKey: apiKey.trim() });
        if (result === undefined) return;
        if (result.ok) await onAdd(draft(), true);
        else setFailure(result.error || t("statusError"));
      };

      return h(
        "div",
        { className: "dcpa-panel" },
        h("h3", { className: "dcpa-q-h" }, t("addTitle")),
        h(
          FieldRow,
          { t, label: t("displayNameLabel"), help: t("displayNameHint"), htmlFor: "dcpa-add-name" },
          h("input", {
            id: "dcpa-add-name",
            className: "dcpa-q-input",
            value: displayName,
            placeholder: t("addNamePlaceholder"),
            onChange: (e) => setDisplayName(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("baseUrlLabel"), htmlFor: "dcpa-add-url" },
          h("input", {
            id: "dcpa-add-url",
            className: "dcpa-q-input",
            value: baseURL,
            placeholder: t("baseUrlPlaceholder"),
            onChange: (e) => setBaseURL(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("apiKeyLabel"), help: t("apiKeyHint"), htmlFor: "dcpa-add-key" },
          h("input", {
            id: "dcpa-add-key",
            className: "dcpa-q-input",
            type: "password",
            autoComplete: "new-password",
            value: apiKey,
            placeholder: t("apiKeyUnsetPlaceholder"),
            onChange: (e) => setApiKey(e.target.value),
          })
        ),
        failure ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "testFail", { error: failure })) : null,
        notice?.tone === "error" ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, notice.text) : null,
        h(
          "div",
          { className: "dcpa-form-actions" },
          canCancel ? h("button", { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: onCancel }, t("cancelBtn")) : null,
          failure
            ? h(
                "button",
                { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void onAdd(draft(), false) },
                t("addAnywayBtn")
              )
            : null,
          h(
            "button",
            { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy !== null, onClick: () => void connect() },
            busy === "test" || busy === "add" ? t("connectingBtn") : t("connectBtn")
          )
        )
      );
    }

    function AccountPanel({ t, account, global, rev, busy, notice, actions, onDirtyChange }) {
      const syncing = busy === "refresh";
      const saving = busy === "save";

      const [tab, setTab] = useState("connection");
      const [menuOpen, setMenuOpen] = useState(false);
      const menuRef = useRef(null);
      const [testResult, setTestResult] = useState(null);

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

      const savedConnection = (c = account.config ?? {}) => ({
        baseURL: c.baseURL ?? "",
        protocol: c.protocolMode === "fixed" ? c.protocol ?? "openai-completions" : "auto",
        provider: c.provider ?? "cli-proxy",
        displayName: c.displayName ?? "CLI Proxy API",
        apiKeyEnv: c.effectiveApiKeyEnv ?? c.apiKeyEnv ?? "CLI_PROXY_API_KEY",
        includePrefix: c.includePrefix ?? "",
        excludePrefix: c.excludePrefix ?? "",
        refreshIntervalSeconds: String(global?.refreshIntervalSeconds ?? 300),
      });

      // Load the drafts from the saved config on mount and after every save.
      useEffect(() => {
        const c = account.config ?? {};
        const saved = savedConnection(c);
        setBaseURL(saved.baseURL);
        setProtocol(saved.protocol);
        setProvider(saved.provider);
        setDisplayName(saved.displayName);
        setApiKeyEnv(saved.apiKeyEnv);
        setIncludePrefix(saved.includePrefix);
        setExcludePrefix(saved.excludePrefix);
        setRefreshIntervalSeconds(saved.refreshIntervalSeconds);
        setProbeTimeoutMs(String(global?.probeTimeoutMs ?? 5000));
        setApiKeyDraft("");
        setTestResult(null);

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

      useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        const onKey = (e) => {
          if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
        };
      }, [menuOpen]);

      const payload = () => ({
        baseURL: baseURL.trim(),
        protocolMode: protocol === "auto" ? "auto" : "fixed",
        ...(protocol === "auto" ? {} : { protocol }),
        provider: provider.trim() || account.config?.provider || "cli-proxy",
        displayName: displayName.trim() || account.config?.displayName || "CLI Proxy API",
        apiKeyEnv: apiKeyEnv.trim() || account.config?.apiKeyEnv || "CLI_PROXY_API_KEY",
        includePrefix: includePrefix.trim(),
        excludePrefix: excludePrefix.trim(),
        // Before the first catalog is seen, an empty draft is not a choice:
        // leave the selection unset so the first probe can recommend one.
        ...(selectedIds.size > 0 || (account.status?.allModels?.length ?? 0) > 0
          ? { selectedModels: [...selectedIds] }
          : {}),
        modelOverrides,
        refreshIntervalSeconds: Math.max(15, Number(refreshIntervalSeconds) || 300),
        probeTimeoutMs: Math.max(250, Number(probeTimeoutMs) || 5000),
        ...(apiKeyDraft.trim() !== "" ? { apiKey: apiKeyDraft.trim() } : {}),
      });

      const st = account.status ?? { state: "idle", modelCount: 0, models: [], allModels: [] };
      const cred = account.credential ?? { configured: false, ref: apiKeyEnv };
      const effectiveUrl = account.config?.effectiveBaseURL || "";
      const enabled = account.config?.enabled !== false;

      // Chat models only: image / video models live on the Generation tab.
      const allModels = useMemo(() => {
        const list =
          Array.isArray(st.allModels) && st.allModels.length > 0 ? st.allModels : Array.isArray(st.models) ? st.models : [];
        return list.filter((m) => (m.kind ?? "chat") === "chat");
      }, [st.allModels, st.models]);
      const mediaCount = useMemo(
        () => (Array.isArray(st.allModels) ? st.allModels.filter((m) => m.kind === "image" || m.kind === "video").length : 0),
        [st.allModels]
      );

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

      // A saved selection may still name a model that is now a media model; it
      // stays saved but is not counted here.
      const selectedChatCount = useMemo(
        () => allModels.reduce((n, m) => n + (selectedIds.has(m.id) ? 1 : 0), 0),
        [allModels, selectedIds]
      );
      const currentIdsKey = useMemo(() => [...selectedIds].sort().join("\0"), [selectedIds]);
      const currentOverridesKey = useMemo(() => overridesKey(modelOverrides), [modelOverrides]);
      const draftConnection = {
        baseURL,
        protocol,
        provider,
        displayName,
        apiKeyEnv,
        includePrefix,
        excludePrefix,
        refreshIntervalSeconds,
      };
      const dirty =
        currentIdsKey !== savedIdsKey ||
        currentOverridesKey !== savedOverridesKey ||
        apiKeyDraft.trim() !== "" ||
        JSON.stringify(draftConnection) !== JSON.stringify(savedConnection());

      useEffect(() => {
        onDirtyChange?.(dirty);
      }, [dirty, onDirtyChange]);

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

      // Computed by the Host from this account's own catalog: newest per family.
      const recommended = Array.isArray(account.recommendedModels) ? account.recommendedModels : [];
      const resetRecommended = useCallback(() => {
        setSelectedIds(new Set(recommended));
      }, [recommended]);

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
          if (Number.isInteger(merged.contextWindow) && merged.contextWindow > 0 && merged.contextWindow !== discovered.contextWindow) {
            normalized.contextWindow = merged.contextWindow;
          }
          if (Number.isInteger(merged.maxTokens) && merged.maxTokens > 0 && merged.maxTokens !== discovered.maxTokens) {
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
        (m) => modelOverrides[m.id]?.protocol ?? (protocol === "auto" ? m.nativeProtocol ?? "openai-completions" : protocol),
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

      const quotaSnap = useQuota(sharedQuota);
      const quotaFloor = accountQuotaFloor(quotaSnap.data, account.id);

      const discard = () => {
        setTestResult(null);
        actions.discard();
      };

      const testConnection = async () => {
        setTestResult(null);
        const result = await actions.test(account.id, { baseURL: baseURL.trim(), apiKey: apiKeyDraft.trim() });
        if (result !== undefined) setTestResult(result);
      };

      const statusParts = [
        accountStateLabel(t, enabled ? st.state : "disabled"),
        st.endpoint || effectiveUrl || null,
        allModels.length > 0 ? fmt(t, "modelsCountShort", { n: st.modelCount ?? 0, total: st.totalDiscovered ?? allModels.length }) : null,
      ].filter(Boolean);

      const tabs = [
        ["connection", t("tabConnection")],
        ["models", `${t("tabModels")} ${selectedChatCount}`],
        ["media", mediaCount > 0 ? `${t("tabMedia")} ${mediaCount}` : t("tabMedia")],
        ["quota", quotaFloor === null ? t("tabQuota") : `${t("tabQuota")} ${pctText(quotaFloor)}`],
      ];

      const connectionTab = h(
        "div",
        { className: "dcpa-tabbody" },
        h(
          FieldRow,
          { t, label: t("displayNameLabel"), help: t("displayNameHint"), htmlFor: `dcpa-name-${account.id}` },
          h("input", {
            id: `dcpa-name-${account.id}`,
            className: "dcpa-q-input",
            value: displayName,
            onChange: (e) => setDisplayName(e.target.value),
          })
        ),
        h(
          FieldRow,
          { t, label: t("baseUrlLabel"), htmlFor: `dcpa-url-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-url-${account.id}`,
              className: "dcpa-q-input",
              value: baseURL,
              placeholder: effectiveUrl || t("baseUrlPlaceholder"),
              onChange: (e) => {
                setBaseURL(e.target.value);
                setTestResult(null);
              },
            }),
            h(
              "button",
              { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void testConnection() },
              busy === "test" ? t("testingBtn") : t("testBtn")
            )
          ),
          testResult
            ? h(
                "p",
                { className: "dcpa-q-msg", "data-tone": testResult.ok ? "ok" : "error", role: "status" },
                testResult.ok
                  ? fmt(t, "testOk", { endpoint: testResult.endpoint, n: testResult.modelCount })
                  : fmt(t, "testFail", { error: testResult.error })
              )
            : null
        ),
        h(
          FieldRow,
          { t, label: t("apiKeyLabel"), help: fmt(t, "apiKeyHint", { ref: cred.ref || apiKeyEnv }), htmlFor: `dcpa-key-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-key-${account.id}`,
              type: "password",
              className: "dcpa-q-input",
              autoComplete: "new-password",
              value: apiKeyDraft,
              placeholder: cred.configured ? t("apiKeySetPlaceholder") : t("apiKeyUnsetPlaceholder"),
              onChange: (e) => {
                setApiKeyDraft(e.target.value);
                setTestResult(null);
              },
            }),
            cred.configured
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-q-btn",
                    "data-variant": "danger",
                    disabled: busy !== null,
                    onClick: () => {
                      if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("clearKeyConfirm"))) return;
                      void actions.patch(account.id, { clearApiKey: true }, t("clearedKeyToast"));
                    },
                  },
                  t("clearKeyBtn")
                )
              : null
          )
        ),
        h(
          FieldRow,
          { t, label: t("protocolLabel"), help: t("protocolHint"), htmlFor: `dcpa-proto-${account.id}` },
          h(
            "select",
            {
              id: `dcpa-proto-${account.id}`,
              className: "dcpa-q-input",
              value: protocol,
              onChange: (e) => setProtocol(e.target.value),
            },
            h("option", { value: "auto" }, t("protocolAuto")),
            PROTOCOLS.map((p) => h("option", { key: p, value: p }, `${t("protocolFixedPrefix")}${protocolName(p)}`))
          )
        ),
        h(
          "details",
          { className: "dcpa-adv" },
          h("summary", null, t("sectionAdvanced")),
          h(
            FieldRow,
            { t, label: t("providerIdLabel"), help: t("providerIdHint"), htmlFor: `dcpa-route-${account.id}` },
            h("input", { id: `dcpa-route-${account.id}`, className: "dcpa-q-input", value: provider, onChange: (e) => setProvider(e.target.value) })
          ),
          h(
            FieldRow,
            { t, label: t("apiKeyEnvLabel"), help: t("apiKeyEnvHint"), htmlFor: `dcpa-ref-${account.id}` },
            h("input", { id: `dcpa-ref-${account.id}`, className: "dcpa-q-input", value: apiKeyEnv, onChange: (e) => setApiKeyEnv(e.target.value) })
          ),
          h(
            FieldRow,
            { t, label: t("includePrefixLabel"), help: t("includePrefixHint"), htmlFor: `dcpa-inc-${account.id}` },
            h("input", {
              id: `dcpa-inc-${account.id}`,
              className: "dcpa-q-input",
              value: includePrefix,
              placeholder: t("includePrefixPlaceholder"),
              onChange: (e) => setIncludePrefix(e.target.value),
            })
          ),
          h(
            FieldRow,
            { t, label: t("excludePrefixLabel"), help: t("excludePrefixHint"), htmlFor: `dcpa-exc-${account.id}` },
            h("input", {
              id: `dcpa-exc-${account.id}`,
              className: "dcpa-q-input",
              value: excludePrefix,
              placeholder: t("excludePrefixPlaceholder"),
              onChange: (e) => setExcludePrefix(e.target.value),
            })
          )
        ),
        h(
          FieldRow,
          { t, label: t("refreshIntervalLabel"), htmlFor: `dcpa-interval-${account.id}` },
          h(
            "div",
            { className: "dcpa-inline dcpa-inline-narrow" },
            h("input", {
              id: `dcpa-interval-${account.id}`,
              type: "number",
              min: "15",
              className: "dcpa-q-input",
              value: refreshIntervalSeconds,
              onChange: (e) => setRefreshIntervalSeconds(e.target.value),
            }),
            h("span", { className: "dcpa-q-sub" }, t("secondsUnit"))
          )
        )
      );

      const modelsTab = h(
        "div",
        { className: "dcpa-tabbody dcpa-models" },
        h("p", { className: "dcpa-q-sub" }, t("modelsEmptyRule")),
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
                `${t("filterSelected")} (${selectedChatCount})`
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-seg-btn",
                  "data-active": tabFilter === "unselected" ? "true" : "false",
                  onClick: () => setTabFilter("unselected"),
                },
                `${t("filterUnselected")} (${Math.max(0, allModels.length - selectedChatCount)})`
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
                  disabled: recommended.length === 0,
                  onClick: resetRecommended,
                },
                `${t("selectRecommendedBtn")} (${recommended.length})`
              ),
              h(InfoTip, { t, text: t("selectRecommendedHint") })
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
                          h("div", { className: "dcpa-q-sub" }, t("paramsHintShort"), h(InfoTip, { t, text: t("paramsHint") })),
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
      );

      return h(
        "div",
        { className: "dcpa-account" },
        h(
          "div",
          { className: "dcpa-acct-head" },
          h(
            "div",
            { className: "dcpa-q-row-main" },
            h("h3", { className: "dcpa-q-h" }, account.config?.displayName || account.id),
            h(
              "div",
              { className: "dcpa-q-sub dcpa-status-line" },
              h("span", { className: stateDotClass(enabled ? st.state : "idle") }),
              statusParts.join(" · ")
            )
          ),
          h(
            "div",
            { className: "dcpa-q-actions" },
            h("span", { className: "dcpa-q-sub" }, t("enableShort")),
            h(InfoTip, { t, text: t("enabledHint") }),
            h(
              "button",
              {
                type: "button",
                role: "switch",
                className: "dcpa-switch",
                "aria-checked": enabled,
                "aria-label": t("enabledLabel"),
                disabled: busy !== null,
                onClick: () => void actions.patch(account.id, { enabled: !enabled }, enabled ? t("disabledToast") : t("enabledToast")),
              },
              h("span", { className: "dcpa-switch-thumb" })
            ),
            h(
              "span",
              { className: "dcpa-menu", ref: menuRef },
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-q-btn dcpa-menu-btn",
                  "aria-label": t("moreActions"),
                  "aria-haspopup": "menu",
                  "aria-expanded": menuOpen,
                  onClick: () => setMenuOpen((v) => !v),
                },
                "⋯"
              ),
              menuOpen
                ? h(
                    "div",
                    { className: "dcpa-menu-pop", role: "menu" },
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        className: "dcpa-menu-item",
                        disabled: busy !== null,
                        onClick: () => {
                          setMenuOpen(false);
                          void actions.refresh(account.id);
                        },
                      },
                      syncing ? t("refreshingBtn") : t("refreshBtn")
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        className: "dcpa-menu-item",
                        "data-variant": "danger",
                        disabled: busy !== null,
                        onClick: () => {
                          setMenuOpen(false);
                          actions.remove(account);
                        },
                      },
                      t("removeAccountBtn")
                    )
                  )
                : null
            )
          )
        ),
        !enabled ? h("p", { className: "dcpa-q-msg" }, t("disabledHint")) : null,
        st.error ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, st.error) : null,
        h(
          "div",
          { className: "dcpa-q-seg dcpa-acct-tabs", role: "tablist", "aria-label": t("tabsLabel") },
          tabs.map(([id, label]) =>
            h(
              "button",
              {
                key: id,
                id: `dcpa-tab-${account.id}-${id}`,
                type: "button",
                role: "tab",
                className: "dcpa-q-seg-tab",
                "aria-selected": tab === id,
                "aria-controls": `dcpa-tabpanel-${account.id}-${id}`,
                onClick: () => setTab(id),
              },
              label
            )
          )
        ),
        h(
          "div",
          { id: `dcpa-tabpanel-${account.id}-${tab}`, role: "tabpanel", "aria-labelledby": `dcpa-tab-${account.id}-${tab}` },
          tab === "connection"
            ? connectionTab
            : tab === "models"
            ? modelsTab
            : tab === "media"
            ? h(MediaPanel, { t, account, onStatus: actions.adopt })
            : h(QuotaPanel, { t, store: sharedQuota, accountId: account.id })
        ),
        dirty || notice
          ? h(
              "div",
              { className: "dcpa-savebar", role: "region", "aria-label": t("saveBarLabel") },
              h(
                "span",
                { className: "dcpa-savebar-text", "data-tone": notice && !dirty ? notice.tone : undefined, role: notice ? "status" : undefined },
                dirty ? (notice?.tone === "error" ? notice.text : t("unsavedChanges")) : notice?.text
              ),
              dirty
                ? h(
                    "div",
                    { className: "dcpa-q-actions" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dcpa-q-btn",
                        disabled: busy !== null,
                        onClick: discard,
                      },
                      t("discardBtn")
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dcpa-q-btn",
                        "data-variant": "primary",
                        disabled: busy !== null,
                        onClick: () => void actions.save(account.id, payload()),
                      },
                      saving ? t("savingBtn") : t("saveBtn")
                    )
                  )
                : null
            )
          : null
      );
    }

    // #region Media (生成): per-account media models and the read-only diagnostic

    const MEDIA_ERROR_KEYS = {
      "invalid-account": "mediaErrInvalidAccount",
      "invalid-request": "mediaErrInvalidRequest",
      "no-endpoint": "mediaErrNoEndpoint",
      "invalid-output-dir": "mediaErrInvalidOutputDir",
      "invalid-model": "mediaErrInvalidModel",
      "invalid-session": "mediaErrInvalidSession",
    };
    const MEDIA_KIND_KEYS = { image: "mediaKindImage", video: "mediaKindVideo", chat: "mediaKindChat" };

    function mediaErrorText(t, err) {
      const code = err instanceof Error ? err.message : String(err);
      return MEDIA_ERROR_KEYS[code] ? t(MEDIA_ERROR_KEYS[code]) : fmt(t, "mediaErrGeneric", { error: code });
    }

    function diagRouteText(t, route) {
      if (route.verdict === "present") return t("diagPresent");
      if (route.verdict === "missing") return t("diagMissing");
      if (route.verdict === "unreachable") return t("diagUnreachable");
      return fmt(t, "diagUnknown", { status: route.status ?? "?" });
    }

    function diagCatalogText(t, catalog) {
      if (catalog?.ok) return fmt(t, "diagCatalogOk", { n: catalog.count ?? 0, m: catalog.media?.length ?? 0 });
      return fmt(t, "diagCatalogFail", { reason: catalog?.status ? `HTTP ${catalog.status}` : catalog?.error ?? "?" });
    }

    function diagFieldsText(fields) {
      return Object.entries(fields ?? {})
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : String(value)}`)
        .join(" · ");
    }

    /**
     * The Generation tab of one account. Hook order matters for the test
     * harness, which seeds slot 0 (data) and slot 1 (loading).
     */
    /** Seconds limits offered for the agent's videos (plus the current value). */
    const MEDIA_BUDGET_CHOICES = [30, 60, 120, 300, 600, 1800, 3600];
    const budgetValue = (budget) => (budget?.mode === "limited" ? `limited:${budget.seconds}` : "unlimited");
    const budgetFromValue = (value) => (value === "unlimited" ? { mode: "unlimited" } : { mode: "limited", seconds: Number(String(value).split(":")[1]) });
    const budgetChoices = (current) => {
      const list = MEDIA_BUDGET_CHOICES.slice();
      if (current?.mode === "limited" && !list.includes(current.seconds)) list.push(current.seconds);
      return list.sort((a, b) => a - b);
    };

    function MediaPanel({ t, account, onStatus }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(null); // null | "save" | "diag"
      const [notice, setNotice] = useState(null);
      const [diag, setDiag] = useState(null);
      const [diagError, setDiagError] = useState(null);
      const [markId, setMarkId] = useState("");
      const [markKind, setMarkKind] = useState("image");
      const [copied, setCopied] = useState(false);
      // null = not edited; the saved value is shown.
      const [outputDraft, setOutputDraft] = useState(null);
      const mounted = useRef(true);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      const load = useCallback(async (signal) => {
        try {
          const res = await fetch(API.mediaStatus, { cache: "no-store", signal });
          const body = await res.json();
          if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
          if (signal?.aborted) return;
          setData(body.media ?? null);
          setError(null);
        } catch (err) {
          if (signal?.aborted) return;
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!signal?.aborted) setLoading(false);
        }
      }, []);

      // Reload when the account's catalog changes (a probe or save elsewhere).
      useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal);
        return () => controller.abort();
      }, [load, account.id, account.status?.refreshedAt, account.status?.totalDiscovered]);

      useEffect(() => {
        if (notice?.tone !== "ok") return undefined;
        const id = setTimeout(() => {
          if (mounted.current) setNotice(null);
        }, 4000);
        return () => clearTimeout(id);
      }, [notice]);

      useEffect(() => {
        if (!copied) return undefined;
        const id = setTimeout(() => {
          if (mounted.current) setCopied(false);
        }, 2000);
        return () => clearTimeout(id);
      }, [copied]);

      const mine = (data?.accounts ?? []).find((a) => a.id === account.id);
      const models = Array.isArray(mine?.models) ? mine.models : [];
      const images = models.filter((m) => m.kind === "image");
      const videos = models.filter((m) => m.kind === "video");
      const movedToChat = Object.entries(mine?.kindOverrides ?? {})
        .filter(([, kind]) => kind === "chat")
        .map(([id]) => id);
      const markable = (mine?.chatModelIds ?? []).filter((id) => !movedToChat.includes(id));

      const save = async (accountPatch) => {
        setBusy("save");
        setNotice(null);
        try {
          const body = await postJson(API.mediaSave, { account: { accountId: account.id, ...accountPatch } });
          if (!mounted.current) return;
          setData(body.media ?? null);
          if (body.status !== undefined) onStatus?.(body.status);
          setNotice({ tone: "ok", text: t(body.status !== undefined ? "mediaKindSaved" : "mediaSaved") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: mediaErrorText(t, err) });
        } finally {
          if (mounted.current) setBusy(null);
        }
      };

      // Global (all-account) preferences, each saved on its own.
      const saveGlobal = async (patch, after) => {
        setBusy("save");
        setNotice(null);
        try {
          const body = await postJson(API.mediaSave, patch);
          if (!mounted.current) return;
          setData(body.media ?? null);
          after?.();
          setNotice({ tone: "ok", text: t("mediaSaved") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: mediaErrorText(t, err) });
        } finally {
          if (mounted.current) setBusy(null);
        }
      };
      const saveOutputDir = async () => {
        if (outputDraft === null) return;
        await saveGlobal({ outputDir: outputDraft.trim() }, () => setOutputDraft(null));
      };

      const toggleEnabled = (model) => {
        const off = Array.isArray(mine?.disabledModels) ? mine.disabledModels : [];
        const next = model.enabled ? [...new Set([...off, model.id])] : off.filter((id) => id !== model.id);
        return save({ disabledModels: next });
      };

      const setKind = (model, kind) =>
        save({ kindOverrides: { [model.id]: kind === model.detectedKind ? null : kind } });

      const runDiagnostic = async () => {
        setBusy("diag");
        setDiagError(null);
        try {
          const body = await postJson(API.mediaDiagnose, { accountId: account.id });
          if (mounted.current) setDiag(body.diagnostic ?? null);
        } catch (err) {
          if (mounted.current) setDiagError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(null);
        }
      };

      const copyDiagnostic = async () => {
        try {
          if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") return;
          await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
          if (mounted.current) setCopied(true);
        } catch {}
      };

      const kindSelect = (model) =>
        h(
          "select",
          {
            className: "dcpa-q-input dcpa-media-kind",
            value: model.kind,
            "aria-label": fmt(t, "mediaKindFor", { model: model.id }),
            disabled: busy !== null,
            onChange: (e) => void setKind(model, e.target.value),
          },
          ["image", "video", "chat"].map((kind) => h("option", { key: kind, value: kind }, t(MEDIA_KIND_KEYS[kind])))
        );

      const modelRow = (model) =>
        h(
          "div",
          { key: model.id, className: "dcpa-model-row dcpa-media-row" },
          h(
            "div",
            { className: "dcpa-model-left" },
            h("span", { className: "dcpa-model-id" }, model.id),
            model.name && model.name !== model.id ? h("span", { className: "dcpa-model-name" }, model.name) : null,
            model.aliasOf
              ? h(
                  "span",
                  { className: "dcpa-model-tags" },
                  h("span", { className: "dcpa-q-tag", "data-tone": "info" }, fmt(t, "mediaAliasTag", { target: model.aliasOf })),
                  h(InfoTip, { t, text: fmt(t, "mediaAliasHint", { target: model.aliasOf }) })
                )
              : null,
            h(
              "span",
              { className: "dcpa-q-tag", ...(model.overridden ? { "data-tone": "warning" } : {}) },
              t(model.overridden ? "mediaOverriddenTag" : "mediaDetectedTag")
            )
          ),
          h(
            "div",
            { className: "dcpa-q-actions" },
            kindSelect(model),
            model.overridden
              ? h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void save({ kindOverrides: { [model.id]: null } }) },
                  t("mediaResetKind")
                )
              : null,
            h(
              "button",
              {
                type: "button",
                role: "switch",
                className: "dcpa-switch",
                "aria-checked": model.enabled === true,
                "aria-label": fmt(t, "mediaEnabledLabel", { model: model.id }),
                disabled: busy !== null,
                onClick: () => void toggleEnabled(model),
              },
              h("span", { className: "dcpa-switch-thumb" })
            )
          )
        );

      const group = (titleKey, list) =>
        list.length === 0
          ? null
          : h(
              "div",
              { className: "dcpa-media-block" },
              h("h4", { className: "dcpa-media-group" }, `${t(titleKey)} (${list.length})`),
              h("div", { className: "dcpa-model-list" }, list.map(modelRow))
            );

      const catalogRead = (mine?.discovered ?? 0) > 0;

      const diagnostic = h(
        "div",
        { className: "dcpa-media-card" },
        h(
          "div",
          { className: "dcpa-media-card-head" },
          h("span", { className: "dcpa-frow-label" }, t("diagTitle"), h(InfoTip, { t, text: t("diagHint") })),
          h(
            "button",
            { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy !== null, onClick: () => void runDiagnostic() },
            busy === "diag" ? t("diagRunning") : t("diagRun")
          )
        ),
        diagError ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, diagError) : null,
        diag
          ? h(
              "div",
              { className: "dcpa-media-diag" },
              diag.keyConfigured === false ? h("p", { className: "dcpa-q-sub" }, t("diagNoKey")) : null,
              [
                ["diagEnriched", diag.catalogs?.enriched],
                ["diagListing", diag.catalogs?.listing],
              ].map(([labelKey, catalog]) =>
                h(
                  "div",
                  { key: labelKey, className: "dcpa-media-diag-item" },
                  h(
                    "div",
                    { className: "dcpa-media-diag-row" },
                    h("span", null, t(labelKey)),
                    h("span", { className: "dcpa-q-sub" }, diagCatalogText(t, catalog))
                  ),
                  Array.isArray(catalog?.media) && catalog.media.length > 0
                    ? h(
                        "ul",
                        { className: "dcpa-media-diag-list" },
                        catalog.media.map((entry) =>
                          h(
                            "li",
                            { key: entry.id },
                            h("span", { className: "dcpa-model-id" }, entry.id),
                            ` · ${t(MEDIA_KIND_KEYS[entry.kind] ?? "mediaKindChat")}`,
                            entry.fields && Object.keys(entry.fields).length > 0 ? ` · ${diagFieldsText(entry.fields)}` : ""
                          )
                        )
                      )
                    : null
                )
              ),
              h(
                "div",
                { className: "dcpa-media-diag-item" },
                h("div", { className: "dcpa-media-diag-row" }, h("span", null, t("diagRoutes"))),
                h(
                  "ul",
                  { className: "dcpa-media-diag-list" },
                  (diag.routes ?? []).map((route) =>
                    h("li", { key: route.route }, h("span", { className: "dcpa-model-id" }, route.route), ` · ${diagRouteText(t, route)}`)
                  )
                )
              ),
              h(
                "details",
                { className: "dcpa-media-raw" },
                h("summary", null, t("diagRaw")),
                h("pre", { className: "dcpa-media-pre" }, JSON.stringify(diag, null, 2)),
                h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", "data-variant": "outline", onClick: () => void copyDiagnostic() },
                  copied ? t("diagCopied") : t("diagCopy")
                )
              )
            )
          : null
      );

      // The optional agent tool (generate_media): switch, confirmation and the video seconds limit.
      const agentOn = data?.settings?.agentTool === true;
      const confirmSelect = (field, labelKey) =>
        h(
          "label",
          { className: "dcpa-inline dcpa-media-agent-row" },
          h("span", { className: "dcpa-media-sublabel" }, t(labelKey)),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: data?.settings?.[field] ?? (field === "videoConfirm" ? "ask" : "auto"),
              disabled: busy !== null || !agentOn,
              onChange: (e) => void saveGlobal({ [field]: e.target.value }),
            },
            h("option", { value: "ask" }, t("mediaConfirmAsk")),
            h("option", { value: "auto" }, t("mediaConfirmAuto"))
          )
        );
      const globalBudget = data?.settings?.videoBudget ?? { mode: "limited", seconds: 60 };
      const agentCard = h(
        "div",
        { className: "dcpa-media-card", "data-agent": agentOn ? "on" : "off" },
        h(
          "div",
          { className: "dcpa-media-agent-head" },
          h("span", { className: "dcpa-frow-label" }, t("mediaAgentTitle"), h(InfoTip, { t, text: t("mediaAgentHint") })),
          h(
            "button",
            {
              type: "button",
              role: "switch",
              className: "dcpa-switch",
              "aria-checked": agentOn,
              "aria-label": t("mediaAgentTitle"),
              disabled: busy !== null,
              onClick: () => void saveGlobal({ agentTool: !agentOn }),
            },
            h("span", { className: "dcpa-switch-thumb" })
          )
        ),
        h("p", { className: "dcpa-q-sub" }, t(agentOn ? "mediaAgentOnNote" : "mediaAgentOffNote")),
        confirmSelect("videoConfirm", "mediaVideoConfirm"),
        confirmSelect("imageConfirm", "mediaImageConfirm"),
        h(
          "div",
          { className: "dcpa-inline dcpa-media-agent-row" },
          h("span", { className: "dcpa-media-sublabel" }, t("mediaVideoBudget"), h(InfoTip, { t, text: t("mediaVideoBudgetHint") })),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              "aria-label": t("mediaVideoBudget"),
              value: budgetValue(globalBudget),
              disabled: busy !== null || !agentOn,
              onChange: (e) => void saveGlobal({ videoBudget: budgetFromValue(e.target.value) }),
            },
            budgetChoices(globalBudget).map((n) => h("option", { key: n, value: `limited:${n}` }, fmt(t, "mediaBudgetSeconds", { n }))),
            h("option", { value: "unlimited" }, t("mediaBudgetUnlimited"))
          )
        )
      );

      if (loading && data === null) {
        return h("div", { className: "dcpa-tabbody dcpa-models dcpa-media" }, h("p", { className: "dcpa-q-sub" }, t("mediaLoading")));
      }

      return h(
        "div",
        { className: "dcpa-tabbody dcpa-models dcpa-media" },
        h("p", { className: "dcpa-q-sub" }, t("mediaIntro")),
        error ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "mediaLoadError", { error })) : null,
        data?.settingsError ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, t("mediaSettingsInvalid")) : null,
        notice ? h("p", { className: "dcpa-q-msg", "data-tone": notice.tone, role: notice.tone === "error" ? "alert" : "status" }, notice.text) : null,
        mine && models.length === 0
          ? h("p", { className: "dcpa-hint" }, t(catalogRead ? "mediaNone" : "mediaNoCatalog"))
          : null,
        group("mediaImageGroup", images),
        group("mediaVideoGroup", videos),
        movedToChat.length > 0
          ? h(
              "div",
              { className: "dcpa-media-block" },
              h("h4", { className: "dcpa-media-group" }, t("mediaMovedTitle"), h(InfoTip, { t, text: t("mediaMovedHint") })),
              h(
                "div",
                { className: "dcpa-model-list" },
                movedToChat.map((id) =>
                  h(
                    "div",
                    { key: id, className: "dcpa-model-row dcpa-media-row" },
                    h("div", { className: "dcpa-model-left" }, h("span", { className: "dcpa-model-id" }, id)),
                    h(
                      "button",
                      { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void save({ kindOverrides: { [id]: null } }) },
                      t("mediaResetKind")
                    )
                  )
                )
              )
            )
          : null,
        markable.length > 0
          ? h(
              "div",
              { className: "dcpa-media-card" },
              h("span", { className: "dcpa-frow-label" }, t("mediaMarkTitle"), h(InfoTip, { t, text: t("mediaMarkHint") })),
              h(
                "div",
                { className: "dcpa-inline" },
                h(
                  "select",
                  {
                    className: "dcpa-q-input",
                    value: markId,
                    "aria-label": t("mediaMarkSelect"),
                    onChange: (e) => setMarkId(e.target.value),
                  },
                  h("option", { value: "" }, t("mediaMarkSelect")),
                  markable.map((id) => h("option", { key: id, value: id }, id))
                ),
                h(
                  "select",
                  {
                    className: "dcpa-q-input dcpa-media-kind",
                    value: markKind,
                    "aria-label": t("mediaKindLabel"),
                    onChange: (e) => setMarkKind(e.target.value),
                  },
                  ["image", "video"].map((kind) => h("option", { key: kind, value: kind }, t(MEDIA_KIND_KEYS[kind])))
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dcpa-q-btn",
                    "data-variant": "outline",
                    disabled: busy !== null || markId === "",
                    onClick: () => {
                      const id = markId;
                      setMarkId("");
                      void save({ kindOverrides: { [id]: markKind } });
                    },
                  },
                  t("mediaMarkBtn")
                )
              )
            )
          : null,
        h(
          "div",
          { className: "dcpa-media-card" },
          h("label", { className: "dcpa-frow-label", htmlFor: `dcpa-media-out-${account.id}` }, t("mediaOutputTitle"), h(InfoTip, { t, text: t("mediaOutputHint") })),
          h(
            "div",
            { className: "dcpa-inline" },
            h("input", {
              id: `dcpa-media-out-${account.id}`,
              className: "dcpa-q-input",
              value: outputDraft ?? data?.settings?.outputDir ?? "",
              onChange: (e) => setOutputDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") void saveOutputDir();
              },
            }),
            h(
              "button",
              {
                type: "button",
                className: "dcpa-q-btn",
                "data-variant": "outline",
                disabled: busy !== null || outputDraft === null || outputDraft.trim() === (data?.settings?.outputDir ?? ""),
                onClick: () => void saveOutputDir(),
              },
              t("mediaOutputSave")
            )
          )
        ),
        videos.length > 0
          ? h(
              "div",
              { className: "dcpa-media-card" },
              h("div", { className: "dcpa-frow-label" }, t("mediaVideoDefaults"), h(InfoTip, { t, text: t("mediaVideoDefaultsHint") })),
              h(
                "div",
                { className: "dcpa-inline" },
                h("label", { className: "dcpa-media-sublabel", htmlFor: `dcpa-media-vs-${account.id}` }, t("mediaVideoSeconds")),
                h(
                  "select",
                  {
                    id: `dcpa-media-vs-${account.id}`,
                    className: "dcpa-q-input dcpa-media-select",
                    value: String(data?.settings?.defaultVideoSeconds ?? 6),
                    disabled: busy !== null,
                    onChange: (e) => void saveGlobal({ defaultVideoSeconds: Number(e.target.value) }),
                  },
                  Array.from({ length: 15 }, (_, i) => h("option", { key: i + 1, value: String(i + 1) }, fmt(t, "mediaSecondsOption", { n: i + 1 })))
                ),
                h("label", { className: "dcpa-media-sublabel", htmlFor: `dcpa-media-vr-${account.id}` }, t("mediaVideoResolution")),
                h(
                  "select",
                  {
                    id: `dcpa-media-vr-${account.id}`,
                    className: "dcpa-q-input dcpa-media-select",
                    value: data?.settings?.defaultVideoResolution ?? "720p",
                    disabled: busy !== null,
                    onChange: (e) => void saveGlobal({ defaultVideoResolution: e.target.value }),
                  },
                  ["480p", "720p"].map((r) => h("option", { key: r, value: r }, r))
                )
              )
            )
          : null,
        images.length + videos.length > 0 ? agentCard : null,
        diagnostic
      );
    }

    // #endregion

    // #region Quota (额度): shared store, model matching, tab page, composer badge

    const QUOTA_POLL_MS = 60 * 1000;
    // While the host is still collecting a refresh, look again soon.
    const QUOTA_BUSY_POLL_MS = 4 * 1000;
    const PROVIDER_NAMES = {
      claude: "Claude",
      anthropic: "Claude",
      codex: "Codex",
      openai: "OpenAI",
      devin: "Devin",
      antigravity: "Antigravity",
      "gemini-cli": "Gemini CLI",
      gemini: "Gemini",
      vertex: "Vertex",
      aistudio: "AI Studio",
      kimi: "Kimi",
      meta: "Meta",
      xai: "xAI / Grok",
      qwen: "Qwen",
      iflow: "iFlow",
      glm: "GLM",
      deepseek: "DeepSeek",
      copilot: "GitHub Copilot",
    };
    const WINDOW_KEYS = { "5h": "qWin5h", "7d": "qWin7d", "30d": "qWin30d", "1d": "qWin1d" };
    const QUOTA_ERROR_KEYS = {
      unauthorized: "qErrUnauthorized",
      forbidden: "qErrForbidden",
      network: "qErrNetwork",
      timeout: "qErrTimeout",
      http: "qErrHttp",
      "invalid-response": "qErrInvalid",
      "no-endpoint": "qErrNoEndpoint",
    };
    const STATUS_KEYS = {
      active: "qStatusActive",
      disabled: "qStatusDisabled",
      unavailable: "qStatusUnavailable",
      error: "qStatusError",
    };
    const MATCH_KEYS = { "model-list": "qMatchModelList", prefix: "qMatchPrefix", family: "qMatchFamily" };

    function fmt(t, key, vars = {}) {
      let out = String(t(key));
      for (const [name, value] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(value));
      return out;
    }

    function providerName(t, provider) {
      const key = String(provider ?? "").toLowerCase();
      return PROVIDER_NAMES[key] ?? (key === "" ? t("qProviderOther") : key);
    }

    function quotaErrorText(t, account) {
      const key = QUOTA_ERROR_KEYS[account?.errorCode];
      if (key === undefined) return null;
      return fmt(t, key, { status: account.errorStatus ?? "?" });
    }

    function windowLabel(t, w) {
      const base = WINDOW_KEYS[w.kind] !== undefined ? t(WINDOW_KEYS[w.kind]) : w.label || t("qWinOther");
      return w.group ? `${w.group} · ${base}` : base;
    }

    function durationText(t, ms) {
      const total = Math.max(1, Math.ceil(ms / 60000));
      const d = Math.floor(total / 1440);
      const hrs = Math.floor((total % 1440) / 60);
      const m = total % 60;
      if (d > 0) return fmt(t, "qDurDH", { d, h: hrs });
      if (hrs > 0) return fmt(t, "qDurHM", { h: hrs, m });
      return fmt(t, "qDurM", { m });
    }

    function resetText(t, iso, now) {
      const at = Date.parse(iso ?? "");
      if (!Number.isFinite(at)) return "";
      return at <= now ? t("qResetSoon") : fmt(t, "qResetIn", { time: durationText(t, at - now) });
    }

    function agoText(t, iso, now) {
      const at = Date.parse(iso ?? "");
      if (!Number.isFinite(at)) return "";
      const s = Math.max(0, Math.floor((now - at) / 1000));
      if (s < 10) return t("qAgoJustNow");
      if (s < 60) return fmt(t, "qAgoSeconds", { n: s });
      if (s < 3600) return fmt(t, "qAgoMinutes", { n: Math.floor(s / 60) });
      if (s < 86400) return fmt(t, "qAgoHours", { n: Math.floor(s / 3600) });
      return fmt(t, "qAgoDays", { n: Math.floor(s / 86400) });
    }

    function quotaLevel(pct) {
      if (typeof pct !== "number" || !Number.isFinite(pct)) return "unknown";
      if (pct <= 0) return "empty";
      if (pct < 20) return "low";
      if (pct < 50) return "mid";
      return "ok";
    }

    function pctText(pct) {
      return typeof pct === "number" && Number.isFinite(pct) ? `${Math.round(pct)}%` : "—";
    }

    function bareModel(id) {
      const lower = String(id ?? "").toLowerCase();
      const slash = lower.indexOf("/");
      return slash >= 0 ? lower.slice(slash + 1) : lower;
    }

    /** Whether a quota window applies to `modelId` (untagged windows apply to every model). */
    function windowAppliesTo(w, modelId) {
      if (!modelId) return true;
      const full = String(modelId).toLowerCase();
      const bare = bareModel(modelId);
      if (Array.isArray(w.modelIds) && w.modelIds.length > 0) {
        return w.modelIds.some((m) => {
          const x = String(m).toLowerCase();
          return x === full || x === bare || bareModel(x) === bare;
        });
      }
      if (Array.isArray(w.modelPrefixes) && w.modelPrefixes.length > 0) {
        return w.modelPrefixes.some((p) => bare.startsWith(String(p).toLowerCase()));
      }
      return true;
    }

    function credentialWindows(cred, modelId) {
      const windows = Array.isArray(cred?.windows) ? cred.windows : [];
      return modelId ? windows.filter((w) => windowAppliesTo(w, modelId)) : windows;
    }

    /** The tightest remaining percentage of the windows that apply, or null. */
    function credentialHeadroom(cred, modelId) {
      const values = credentialWindows(cred, modelId)
        .map((w) => w.remainingPercent)
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      return values.length > 0 ? Math.min(...values) : null;
    }

    function quotaAccountForRoute(data, route) {
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      return accounts.find((a) => Array.isArray(a.routes) && a.routes.includes(route)) ?? null;
    }

    function byHeadroomDesc(a, b) {
      const ua = a.cred.status === "active" ? 0 : 1;
      const ub = b.cred.status === "active" ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const ha = a.headroom ?? -1;
      const hb = b.headroom ?? -1;
      return hb - ha;
    }

    /**
     * Quota for one picker selection: the account owning the route, then
     * exactly the credentials the host matched for this model id on that
     * server (modelIndex), never credentials of another account.
     */
    function summarizeModelQuota(data, route, modelId) {
      const account = quotaAccountForRoute(data, route);
      if (account === null) return null;
      const credentials = Array.isArray(account.credentials) ? account.credentials : [];
      const byId = new Map(credentials.map((c) => [c.id, c]));
      const ids = Array.isArray(account.modelIndex?.[modelId]) ? account.modelIndex[modelId] : [];
      const entries = ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((cred) => ({ cred, headroom: credentialHeadroom(cred, modelId), windows: credentialWindows(cred, modelId) }))
        .sort(byHeadroomDesc);
      const usable = entries.filter((e) => e.cred.status === "active");
      const known = usable.map((e) => e.headroom).filter((v) => v !== null);
      return {
        account,
        entries,
        usableCount: usable.length,
        best: known.length > 0 ? Math.max(...known) : null,
      };
    }

    /** Totals for the overview tiles. */
    function quotaStats(credentials) {
      const out = { total: 0, healthy: 0, low: 0, empty: 0, issue: 0, unknown: 0 };
      for (const cred of credentials) {
        out.total++;
        if (cred.status !== "active" || cred.quotaState === "error") {
          out.issue++;
          continue;
        }
        const level = quotaLevel(credentialHeadroom(cred));
        if (level === "empty") out.empty++;
        else if (level === "low") out.low++;
        else if (level === "ok" || level === "mid") out.healthy++;
        else out.unknown++;
      }
      return out;
    }

    /**
     * One page-wide quota client: GET the host snapshot (cached by the host,
     * which refreshes stale accounts in the background) while anything is
     * subscribed; POST refresh / key changes. Disposed with the activation.
     */
    function createQuotaStore(io = {}) {
      const fetchImpl = io.fetch ?? ((...args) => fetch(...args));
      const setT = io.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
      const clearT = io.clearTimeout ?? ((id) => clearTimeout(id));
      const listeners = new Set();
      let state = { data: null, loading: false, error: null, busy: null, busyAccount: null, loadedAt: 0 };
      let timer = null;
      let disposed = false;
      let seq = 0;
      const inflight = new Set();

      const emit = (patch) => {
        if (disposed) return;
        state = { ...state, ...patch };
        for (const fn of [...listeners]) fn();
      };

      const request = async (url, init) => {
        const controller = new AbortController();
        inflight.add(controller);
        try {
          const res = await fetchImpl(url, { cache: "no-store", ...init, signal: controller.signal });
          let body = null;
          try {
            body = await res.json();
          } catch {}
          if (!res.ok || body === null || body.ok === false) {
            throw new Error(body?.error || `HTTP ${res.status}`);
          }
          return body;
        } finally {
          inflight.delete(controller);
        }
      };

      const schedule = () => {
        if (timer !== null) clearT(timer);
        timer = null;
        if (disposed || listeners.size === 0) return;
        const delay = state.data?.refreshing ? QUOTA_BUSY_POLL_MS : QUOTA_POLL_MS;
        timer = setT(() => {
          timer = null;
          void load().finally(schedule);
        }, delay);
      };

      const load = async () => {
        const mine = ++seq;
        emit({ loading: true });
        try {
          const body = await request(API.quotaStatus);
          if (mine === seq) emit({ data: body.quota ?? null, error: null, loading: false, loadedAt: Date.now() });
        } catch (error) {
          if (disposed) return;
          if (mine === seq) emit({ error: error instanceof Error ? error.message : String(error), loading: false });
        }
      };

      const mutate = async (kind, url, payload) => {
        const mine = ++seq;
        emit({ busy: kind, busyAccount: payload?.accountId ?? null, error: null });
        try {
          const body = await request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? {}),
          });
          if (mine === seq) emit({ data: body.quota ?? state.data, loadedAt: Date.now() });
          emit({ busy: null, busyAccount: null });
          schedule();
          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit({ busy: null, busyAccount: null, ...(mine === seq ? { error: message } : {}) });
          return { ok: false, error: message };
        }
      };

      return {
        getSnapshot: () => state,
        subscribe(fn) {
          listeners.add(fn);
          if (listeners.size === 1) {
            if (state.data === null || Date.now() - state.loadedAt > QUOTA_POLL_MS) void load().finally(schedule);
            else schedule();
          }
          return () => {
            listeners.delete(fn);
            if (listeners.size === 0 && timer !== null) {
              clearT(timer);
              timer = null;
            }
          };
        },
        load,
        refresh: (accountId) => mutate("refresh", API.quotaRefresh, accountId ? { accountId } : {}),
        saveKey: (accountId, managementKey) => mutate("save", API.quotaSave, { accountId, managementKey }),
        clearKey: (accountId) => mutate("clear", API.quotaSave, { accountId, clear: true }),
        dispose() {
          disposed = true;
          if (timer !== null) clearT(timer);
          timer = null;
          for (const c of inflight) c.abort();
          inflight.clear();
          listeners.clear();
        },
      };
    }

    let sharedQuota = null;

    /** Subscribe a component to the shared quota store (null when inactive). */
    function useQuota(store) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (store === null || store === undefined) return undefined;
        let alive = true;
        const off = store.subscribe(() => {
          if (alive) setTick((n) => n + 1);
        });
        return () => {
          alive = false;
          off();
        };
      }, [store]);
      return store ? store.getSnapshot() : { data: null, loading: false, error: null, busy: null };
    }

    /**
     * Which sessions currently have a composer badge mounted. The composer
     * renders conversation.input.right only once the session is bound (its
     * input state exists), but the New Session hero shows the model selector
     * earlier. The hero badge (conversation.hero.options) therefore renders
     * only while no composer badge is mounted for the same session, so the
     * user always sees exactly one badge. Plain in-memory counts; no DOM.
     */
    function createBadgePresence() {
      const counts = new Map();
      const listeners = new Set();
      const notify = () => {
        for (const fn of [...listeners]) fn();
      };
      return {
        add(id) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
          notify();
          let done = false;
          return () => {
            if (done) return;
            done = true;
            const n = (counts.get(id) ?? 1) - 1;
            if (n > 0) counts.set(id, n);
            else counts.delete(id);
            notify();
          };
        },
        has: (id) => (counts.get(id) ?? 0) > 0,
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };
    }
    const composerBadges = createBadgePresence();
    // The generation-model button has its own composer/hero presence.
    const mediaChips = createBadgePresence();

    /**
     * Composer placement announces itself for its session; hero placement
     * reports whether a composer badge already covers the session.
     */
    function useBadgePlacement(placement, sessionId, presence = composerBadges) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (typeof sessionId !== "string" || sessionId === "") return undefined;
        if (placement === "hero") {
          let alive = true;
          const off = presence.subscribe(() => {
            if (alive) setTick((n) => n + 1);
          });
          setTick((n) => n + 1);
          return () => {
            alive = false;
            off();
          };
        }
        return presence.add(sessionId);
      }, [placement, sessionId, presence]);
      return placement === "hero" && typeof sessionId === "string" && presence.has(sessionId);
    }

    /**
     * The session's model-directory store, resolved at render time. DSH caches
     * a slot entry's inject() result per session binding, and right after a
     * page load, host restart or session switch `directoryFor()` can still
     * throw (no scope/binding yet). Resolving inside inject would cache that
     * miss for good, so inject hands over a resolver and this hook retries
     * (1 s for the first 30 s, then every 5 s) until the directory exists.
     */
    function useDirectory(direct, resolve) {
      const [, setTick] = useState(0);
      let resolved = direct ?? null;
      if (resolved === null && typeof resolve === "function") {
        try {
          resolved = resolve() ?? null;
        } catch {
          resolved = null;
        }
      }
      const missing = resolved === null && typeof resolve === "function";
      useEffect(() => {
        if (!missing) return undefined;
        let alive = true;
        let id = null;
        let tries = 0;
        const tick = () => {
          id = null;
          if (!alive) return;
          tries += 1;
          setTick((n) => n + 1);
          id = setTimeout(tick, tries < 30 ? 1000 : 5000);
        };
        id = setTimeout(tick, 300);
        return () => {
          alive = false;
          if (id !== null) clearTimeout(id);
        };
      }, [missing, resolve]);
      return resolved;
    }

    /** Re-render every `ms` so relative times stay current. */
    function useNow(ms) {
      const [now, setNow] = useState(() => Date.now());
      useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(id);
      }, [ms]);
      return now;
    }

    function QuotaMeter({ t, w, now }) {
      const pct = typeof w.remainingPercent === "number" ? Math.max(0, Math.min(100, w.remainingPercent)) : null;
      const level = quotaLevel(pct);
      const reset = resetText(t, w.resetAt, now);
      const label = windowLabel(t, w);
      return h(
        "div",
        { className: "dcpa-q-meter", "data-level": level },
        h(
          "div",
          { className: "dcpa-q-meter-top" },
          h("span", { title: label }, label),
          h("span", { className: "dcpa-q-pct" }, pctText(pct))
        ),
        h(
          "div",
          {
            className: "dcpa-q-track",
            role: "meter",
            "aria-label": label,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            ...(pct === null ? {} : { "aria-valuenow": Math.round(pct) }),
          },
          h("span", { className: "dcpa-q-fill", style: { width: `${pct ?? 0}%` } })
        ),
        reset ? h("span", { className: "dcpa-q-reset" }, reset) : null
      );
    }

    function CredentialTags({ t, cred }) {
      return [
        cred.plan ? h("span", { key: "plan", className: "dcpa-q-tag", "data-tone": "info" }, cred.plan) : null,
        cred.prefix ? h("span", { key: "prefix", className: "dcpa-q-tag" }, `${cred.prefix}/`) : null,
        cred.status && cred.status !== "active"
          ? h("span", { key: "status", className: "dcpa-q-tag", "data-tone": "danger" }, t(STATUS_KEYS[cred.status] ?? "qStatusError"))
          : null,
      ];
    }

    function CredentialWindows({ t, cred, windows, now }) {
      if (windows.length > 0) {
        return h(
          "div",
          { className: "dcpa-q-meters" },
          windows.map((w, i) => h(QuotaMeter, { key: w.id ?? i, t, w, now }))
        );
      }
      const lines = [
        cred.quotaState === "error"
          ? h("p", { key: "q", className: "dcpa-q-note", "data-tone": "error" }, t("qQuotaError"))
          : h("p", { key: "q", className: "dcpa-q-note" }, t(cred.quotaState === "unsupported" ? "qQuotaUnsupported" : "qQuotaNone")),
        cred.recent ? h("p", { key: "r", className: "dcpa-q-note" }, fmt(t, "qRecent", cred.recent)) : null,
      ];
      return h("div", { className: "dcpa-q-meters" }, h("div", null, lines));
    }

    function CredentialRow({ t, cred, now, pickerIds }) {
      const [open, setOpen] = useState(false);
      const models = Array.isArray(cred.models) ? cred.models : null;
      return h(
        "div",
        { className: "dcpa-q-cred", "data-status": cred.status ?? "active" },
        h(
          "div",
          { className: "dcpa-q-who" },
          h("div", { className: "dcpa-q-name", title: cred.label || cred.id }, cred.label || cred.id),
          h(
            "div",
            { className: "dcpa-q-meta" },
            CredentialTags({ t, cred }),
            models === null
              ? h("span", null, t("qModelsUnknown"))
              : h(
                  "button",
                  { type: "button", className: "dcpa-q-link", "aria-expanded": open, onClick: () => setOpen((v) => !v) },
                  open ? t("qHideModels") : fmt(t, "qShowModels", { n: models.length })
                ),
            cred.statusMessage ? h("span", { title: cred.statusMessage }, cred.statusMessage) : null
          )
        ),
        h(CredentialWindows, { t, cred, windows: credentialWindows(cred), now }),
        open && models !== null
          ? h(
              "div",
              { className: "dcpa-q-models" },
              models.map((m) => h("code", { key: m, "data-picker": pickerIds.has(m) ? "true" : "false" }, m))
            )
          : null
      );
    }

    function ModelChannelMap({ t, account }) {
      const picker = Array.isArray(account.pickerModels) ? account.pickerModels : [];
      return h(
        "details",
        { className: "dcpa-q-map" },
        h(
          "summary",
          null,
          h(
            "div",
            { className: "dcpa-q-row-main" },
            h("div", { className: "dcpa-q-title" }, t("qMapTitle"), h(InfoTip, { t, text: t("qMapHint") }))
          )
        ),
        picker.length === 0
          ? h("p", { className: "dcpa-q-msg" }, t("qMapEmpty"))
          : picker.map((m) => {
              const summary = summarizeModelQuota({ accounts: [account] }, m.route, m.id);
              const entries = summary?.entries ?? [];
              const matchedBy = account.modelMatch?.[m.id];
              return h(
                "div",
                { key: `${m.route}:${m.id}`, className: "dcpa-q-map-row" },
                h("span", { className: "dcpa-q-map-model" }, m.id),
                h(
                  "span",
                  { className: "dcpa-q-map-creds" },
                  entries.length === 0
                    ? h("span", null, t("qMapNone"))
                    : entries.map(({ cred }) =>
                        h(
                          "span",
                          { key: cred.id, className: "dcpa-q-tag", "data-tone": cred.status === "active" ? undefined : "danger", title: cred.label || cred.id },
                          `${providerName(t, cred.provider)} · ${cred.label || cred.id}`
                        )
                      ),
                  matchedBy && MATCH_KEYS[matchedBy] ? h("span", null, t(MATCH_KEYS[matchedBy])) : null
                ),
                h("span", { className: "dcpa-q-map-pct dcpa-q-pct" }, pctText(summary?.best))
              );
            })
      );
    }

    function QuotaSummary({ t, credentials }) {
      const stats = quotaStats(credentials);
      const parts = [
        ["ok", stats.healthy, "qStatHealthy"],
        ["low", stats.low, "qStatLow"],
        ["empty", stats.empty, "qStatEmpty"],
        ["issue", stats.issue, "qStatIssue"],
        ["unknown", stats.unknown, "qStatUnknown"],
      ];
      return h(
        "div",
        { className: "dcpa-q-summary" },
        h(
          "div",
          { className: "dcpa-q-dist", role: "img", "aria-label": fmt(t, "qTotalCreds", { n: stats.total }) },
          parts.filter(([, n]) => n > 0).map(([level, n]) => h("span", { key: level, "data-level": level, style: { flex: `${n} 1 0` } }))
        ),
        h(
          "div",
          { className: "dcpa-q-legend" },
          h("span", null, fmt(t, "qTotalCreds", { n: stats.total })),
          parts.filter(([level, n]) => level !== "unknown" || n > 0).map(([level, n, key]) =>
            h("span", { key: level, "data-level": level }, h("i", { className: "dcpa-q-swatch" }), t(key), h("b", null, String(n)))
          )
        )
      );
    }

    /** The "额度" tab: flat DSH settings rows, one account at a time. */
    function QuotaPanel({ t, store = sharedQuota, accountId }) {
      const snap = useQuota(store);
      const now = useNow(30 * 1000);
      const [activeId, setActiveId] = useState(null);
      const [keyDraft, setKeyDraft] = useState("");
      const [notice, setNotice] = useState(null);
      const [providerFilter, setProviderFilter] = useState("all");
      const [search, setSearch] = useState("");

      const accounts = Array.isArray(snap.data?.accounts) ? snap.data.accounts : [];
      const scoped = accountId !== undefined;
      const account = scoped
        ? accounts.find((a) => a.accountId === accountId) ?? null
        : accounts.find((a) => a.accountId === activeId) ?? accounts[0] ?? null;
      const credentials = Array.isArray(account?.credentials) ? account.credentials : [];
      const pickerIds = useMemo(() => new Set((account?.pickerModels ?? []).map((m) => m.id)), [account]);
      const busy = snap.busy !== null;

      const providers = useMemo(() => {
        const counts = new Map();
        for (const c of credentials) counts.set(c.provider || "", (counts.get(c.provider || "") ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      }, [credentials]);

      const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const map = new Map();
        for (const c of credentials) {
          if (providerFilter !== "all" && (c.provider || "") !== providerFilter) continue;
          if (
            q !== "" &&
            !String(c.label ?? "").toLowerCase().includes(q) &&
            !String(c.id ?? "").toLowerCase().includes(q) &&
            !(Array.isArray(c.models) && c.models.some((m) => String(m).toLowerCase().includes(q)))
          ) continue;
          const key = c.provider || "";
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(c);
        }
        // Problems first, then least remaining, so what needs attention is on top.
        const rank = (c) => (c.status !== "active" ? 1 : 0);
        return [...map.entries()].map(([key, list]) => [
          key,
          [...list].sort((a, b) => rank(a) - rank(b) || (credentialHeadroom(a) ?? 101) - (credentialHeadroom(b) ?? 101)),
        ]);
      }, [credentials, providerFilter, search]);

      if (store === null || store === undefined) return null;

      const saveKey = async () => {
        if (account === null || keyDraft.trim() === "") return;
        setNotice(null);
        const result = await store.saveKey(account.accountId, keyDraft.trim());
        if (result.ok) {
          setKeyDraft("");
          setNotice(t("qKeySaved"));
        }
      };
      const clearKey = async () => {
        if (account === null) return;
        const name = account.displayName || account.accountId;
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(fmt(t, "qKeyClearConfirm", { name }))) return;
        setNotice(null);
        const result = await store.clearKey(account.accountId);
        if (result.ok) setNotice(t("qKeyCleared"));
      };

      const errorText = account ? quotaErrorText(t, account) : null;
      const refreshing = account?.refreshing === true || (snap.busy === "refresh" && snap.busyAccount === account?.accountId);
      const shown = groups.reduce((n, [, list]) => n + list.length, 0);

      return h(
        "div",
        { className: "dcpa-q", "data-dsh-plugin": MODULE_ID },
        scoped
          ? null
          : h(
              "div",
              { className: "dcpa-q-head" },
              h("h3", { className: "dcpa-q-h" }, t("qTitle")),
              h("p", { className: "dcpa-q-desc" }, t("qSubtitle"))
            ),
        scoped && account === null ? h("p", { className: "dcpa-q-msg" }, t("qPeekLoading")) : null,
        !scoped && accounts.length > 1
          ? h(
              "div",
              { className: "dcpa-q-seg", role: "tablist", "aria-label": t("qAccountsLabel") },
              accounts.map((a) =>
                h(
                  "button",
                  {
                    key: a.accountId,
                    type: "button",
                    role: "tab",
                    className: "dcpa-q-seg-tab",
                    "aria-selected": account?.accountId === a.accountId,
                    onClick: () => {
                      setActiveId(a.accountId);
                      setKeyDraft("");
                      setNotice(null);
                      setProviderFilter("all");
                      setSearch("");
                    },
                  },
                  a.displayName || a.accountId,
                  a.keyConfigured ? null : h("span", { className: "dcpa-q-seg-note" }, t("qKeyStatusUnset"))
                )
              )
            )
          : null,
        snap.data !== null && accounts.length === 0 ? h("p", { className: "dcpa-q-msg" }, t("qNoAccounts")) : null,
        account
          ? h(
              "div",
              { className: "dcpa-q-row" },
              h(
                "div",
                { className: "dcpa-q-row-main" },
                h(
                  "div",
                  { className: "dcpa-q-title" },
                  h("label", { htmlFor: `dcpa-q-key-${account.accountId}` }, t("qKeyLabel")),
                  h(InfoTip, { t, text: fmt(t, "qKeyHint", { ref: account.keyRef ?? "" }) })
                )
              ),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h(
                  "span",
                  { className: "dcpa-q-tag", "data-tone": account.keyConfigured ? "success" : undefined },
                  account.keyConfigured ? t("qKeyStatusSet") : t("qKeyStatusUnset")
                )
              )
            )
          : null,
        account
          ? h(
              "div",
              { className: "dcpa-q-form" },
              h("input", {
                id: `dcpa-q-key-${account.accountId}`,
                className: "dcpa-q-input",
                type: "password",
                autoComplete: "off",
                spellCheck: false,
                value: keyDraft,
                placeholder: account.keyConfigured ? t("qKeySetPlaceholder") : t("qKeyUnsetPlaceholder"),
                onChange: (e) => setKeyDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") void saveKey();
                },
              }),
              h(
                "button",
                { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy || keyDraft.trim() === "", onClick: () => void saveKey() },
                snap.busy === "save" ? t("qKeySaving") : t("qKeySave")
              ),
              account.keyConfigured
                ? h(
                    "button",
                    { type: "button", className: "dcpa-q-btn", "data-variant": "danger", disabled: busy, onClick: () => void clearKey() },
                    t("qKeyClear")
                  )
                : null
            )
          : null,
        account && account.keyConfigured
          ? h(
              "div",
              { className: "dcpa-q-row" },
              h(
                "div",
                { className: "dcpa-q-row-main" },
                h("div", { className: "dcpa-q-title" }, t("qDataLabel")),
                h(
                  "div",
                  { className: "dcpa-q-sub" },
                  refreshing
                    ? t("qRefreshing")
                    : account.fetchedAt
                    ? fmt(t, "qUpdated", { time: agoText(t, account.fetchedAt, now) })
                    : t("qNeverUpdated"),
                  account.enabled === false ? ` · ${t("qAccountDisabled")}` : ""
                )
              ),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h(
                  "button",
                  { type: "button", className: "dcpa-q-btn", "data-variant": "outline", disabled: busy || refreshing, onClick: () => void store.refresh(account.accountId) },
                  t("qRefresh")
                )
              )
            )
          : null,
        errorText ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, errorText, credentials.length > 0 ? ` ${t("qStale")}` : "") : null,
        snap.error ? h("p", { className: "dcpa-q-msg", "data-tone": "error", role: "alert" }, fmt(t, "qErrLoad", { error: snap.error })) : null,
        notice ? h("p", { className: "dcpa-q-msg", "data-tone": "ok", role: "status" }, notice) : null,
        account && account.keyConfigured && credentials.length === 0 && account.state === "ok"
          ? h("p", { className: "dcpa-q-msg" }, t("qNoCredentials"))
          : null,
        account && account.keyConfigured && credentials.length > 0 ? h(QuotaSummary, { t, credentials }) : null,
        account && account.keyConfigured && (providers.length > 1 || credentials.length > 8)
          ? h(
              "div",
              { className: "dcpa-q-tools" },
              providers.length > 1
                ? [["all", credentials.length], ...providers].map(([key, count]) =>
                    h(
                      "button",
                      {
                        key: key || "_",
                        type: "button",
                        className: "dcpa-q-filter",
                        "aria-pressed": providerFilter === key,
                        onClick: () => setProviderFilter(key),
                      },
                      key === "all" ? t("qFilterAll") : providerName(t, key),
                      h("small", null, String(count))
                    )
                  )
                : null,
              credentials.length > 8
                ? h("input", {
                    className: "dcpa-q-input",
                    type: "search",
                    value: search,
                    placeholder: t("qSearchPlaceholder"),
                    "aria-label": t("qSearchPlaceholder"),
                    onChange: (e) => setSearch(e.target.value),
                  })
                : null
            )
          : null,
        account && account.keyConfigured && credentials.length > 0 && shown === 0 ? h("p", { className: "dcpa-q-msg" }, t("qNoMatch")) : null,
        account && account.keyConfigured
          ? groups.map(([key, list]) =>
              h(
                "section",
                { key: key || "_", "aria-label": providerName(t, key) },
                h("div", { className: "dcpa-q-group-title" }, providerName(t, key), h("small", null, String(list.length))),
                list.map((cred) => h(CredentialRow, { key: cred.id, t, cred, now, pickerIds }))
              )
            )
          : null,
        account && account.keyConfigured && credentials.length > 0 ? h(ModelChannelMap, { t, account }) : null
      );
    }

    /** The CLIProxyAPI settings section: accounts, each with 连接 / 模型 / 额度 tabs. */
    function CpaSectionPage({ t }) {
      return h(CpaSettingsPanel, { t });
    }

    /** Snapshot of the session's model directory (current or pending selection). */
    function useSelection(directory) {
      const [, setTick] = useState(0);
      useEffect(() => {
        if (!directory || typeof directory.subscribe !== "function") return undefined;
        let alive = true;
        const off = directory.subscribe(() => {
          if (alive) setTick((n) => n + 1);
        });
        return () => {
          alive = false;
          off?.();
        };
      }, [directory]);
      const snapshot = directory && typeof directory.getSnapshot === "function" ? directory.getSnapshot() : null;
      const current = snapshot?.pending ?? snapshot?.current ?? null;
      return current && typeof current.provider === "string" && typeof current.model === "string" ? current : null;
    }

    /**
     * Composer badge left of the model picker: signal bars + best remaining
     * percentage of the credentials that serve the selected model on the
     * selected model's own CPA account; click opens a peek list. Accounts
     * without a management key show nothing.
     */
    function QuotaBadge({ t, directory: directProp = null, resolveDirectory = null, store = sharedQuota, sessionId = null, placement = "composer", presence = composerBadges }) {
      const shadowed = useBadgePlacement(placement, sessionId, presence);
      const directory = useDirectory(directProp, shadowed ? null : resolveDirectory);
      const selection = useSelection(shadowed ? null : directory);
      const snap = useQuota(selection ? store : null);
      const now = useNow(60 * 1000);
      const [open, setOpen] = useState(false);
      const [pos, setPos] = useState(null);
      const wrapRef = useRef(null);
      const buttonRef = useRef(null);

      const summary = selection ? summarizeModelQuota(snap.data, selection.provider, selection.model) : null;
      const visible = !shadowed && summary !== null && summary.account.keyConfigured === true;

      useEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const rect = buttonRef.current?.getBoundingClientRect?.();
          if (!rect || typeof window === "undefined") return;
          const width = Math.min(340, window.innerWidth - 32);
          const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
          setPos({ left, bottom: Math.max(16, window.innerHeight - rect.top + 6), width });
        };
        place();
        const onDown = (e) => {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            setOpen(false);
            buttonRef.current?.focus?.();
          }
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", place);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", place);
        };
      }, [open]);

      useEffect(() => {
        if (!visible && open) setOpen(false);
      }, [visible, open]);

      if (!visible) return null;
      const { account, entries, best, usableCount } = summary;
      const loadingFirst = account.fetchedAt === undefined && (account.state === "loading" || account.refreshing === true || account.state === "idle");
      const level = quotaLevel(best);
      const label = fmt(t, "qBadgeLabel", { model: selection.model });
      const errorText = quotaErrorText(t, account);
      const refreshing = account.refreshing === true || snap.busy === "refresh";

      const peek = open
        ? h(
            "div",
            {
              className: "dcpa-q-pop",
              role: "dialog",
              "aria-label": label,
              style: pos ? { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px` } : { visibility: "hidden" },
            },
            h(
              "div",
              { className: "dcpa-q-pop-head" },
              h("div", { className: "dcpa-q-pop-model" }, selection.model),
              h("div", { className: "dcpa-q-pop-sub" }, `${account.displayName || account.accountId} · ${fmt(t, "qPeekCreds", { n: usableCount })}`)
            ),
            errorText ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error" }, errorText) : null,
            loadingFirst ? h("p", { className: "dcpa-q-pop-text" }, t("qPeekLoading")) : null,
            !loadingFirst && entries.length === 0 ? h("p", { className: "dcpa-q-pop-text" }, t("qPeekNoCreds")) : null,
            entries.map(({ cred, windows, headroom }, index) =>
              h(
                "div",
                { key: cred.id, className: "dcpa-q-pop-cred" },
                h(
                  "div",
                  { className: "dcpa-q-pop-who" },
                  h("span", { className: "dcpa-q-tag" }, providerName(t, cred.provider)),
                  h("span", { className: "dcpa-q-name", title: cred.label || cred.id }, cred.label || cred.id),
                  index === 0 && cred.status === "active" && headroom !== null && entries.length > 1
                    ? h("span", { className: "dcpa-q-tag", "data-tone": "success" }, t("qPeekBest"))
                    : null,
                  CredentialTags({ t, cred })
                ),
                h(CredentialWindows, { t, cred, windows, now })
              )
            ),
            h(
              "div",
              { className: "dcpa-q-pop-foot" },
              h("span", null, account.fetchedAt ? fmt(t, "qUpdated", { time: agoText(t, account.fetchedAt, now) }) : t("qPeekFooter")),
              h(
                "button",
                {
                  type: "button",
                  className: "dcpa-q-btn",
                  disabled: snap.busy !== null || account.refreshing === true,
                  onClick: () => void store?.refresh(account.accountId),
                },
                refreshing ? t("qRefreshing") : t("qRefresh")
              )
            )
          )
        : null;

      return h(
        "span",
        { ref: wrapRef, className: "dcpa-q-wrap", "data-placement": placement, "data-dsh-plugin": MODULE_ID },
        h(
          "button",
          {
            ref: buttonRef,
            type: "button",
            className: "dcpa-q-badge",
            "data-level": level,
            "aria-label": label,
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            title: label,
            onClick: () => setOpen((v) => !v),
          },
          h("span", { className: "dcpa-q-bars", "data-level": level, "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          h("span", { className: "dcpa-q-badge-pct" }, loadingFirst ? "…" : pctText(best))
        ),
        peek
      );
    }

    // #endregion

    // #region Generation-model button (composer / hero)

    function mediaFileURL(sessionId, id) {
      return `${API.mediaFile}?sessionId=${encodeURIComponent(sessionId)}&id=${encodeURIComponent(id)}`;
    }

    function mediaSessionURL(sessionId) {
      return typeof sessionId === "string" && sessionId !== "" ? `${API.mediaSession}?sessionId=${encodeURIComponent(sessionId)}` : API.mediaSession;
    }

    const IMAGE_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("rect", { x: 1.75, y: 2.75, width: 12.5, height: 10.5, rx: 2, stroke: "currentColor", strokeWidth: 1.3 }),
        h("circle", { cx: 5.5, cy: 6.25, r: 1.25, fill: "currentColor" }),
        h("path", { d: "M2.5 12l3.6-3.4 2.4 2.2 2.2-2 2.8 2.6", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })
      );

    /** Composer row width (px) below which the image / video buttons show icons only. */
    const MEDIA_COMPACT_WIDTH = 640;

    const VIDEO_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("rect", { x: 1.75, y: 3.75, width: 9, height: 8.5, rx: 2, stroke: "currentColor", strokeWidth: 1.3 }),
        h("path", { d: "M10.75 7l3.5-2v6l-3.5-2", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })
      );

    const AGENT_ICON = () =>
      h(
        "svg",
        { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
        h("circle", { cx: 8, cy: 8, r: 2.15, stroke: "currentColor", strokeWidth: 1.25 }),
        h("path", {
          d: "M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1",
          stroke: "currentColor",
          strokeWidth: 1.2,
          strokeLinecap: "round",
        })
      );

    /**
     * Pick the session's image and video models next to the composer (results
     * show in the /cpa-image and /cpa-video chat rows). Each kind has its own
     * button and menu; the agent rules are a secondary menu of either one.
     * Renders nothing without a generation model.
     * Hook order: slot 0 = data, slot 1 = loading (test harness).
     */
    function MediaChip({ t, sessionId = null, placement = "composer", presence = mediaChips }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      // Which kind's model menu is open (image / video), or null.
      const [openKind, setOpenKind] = useState(null);
      const [pos, setPos] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      // Bumped to reload while no image model is known yet.
      const [retry, setRetry] = useState(0);
      // Secondary menu: this session's agent tool rules.
      const [agentPane, setAgentPane] = useState(false);
      const wrapRef = useRef(null);
      const buttonRef = useRef(null);
      const mounted = useRef(true);
      const shadowed = useBadgePlacement(placement, sessionId, presence);
      // Icon-only buttons while the composer row is narrow (names move to aria-label).
      const [compact, setCompact] = useState(false);
      useEffect(() => {
        // Measure the composer card (the nearest ancestor holding the text input),
        // not the small button cluster this chip sits in.
        if (typeof document === "undefined") return undefined;
        let row = wrapRef.current?.parentElement ?? null;
        for (let el = row; el && el !== document.body; el = el.parentElement) {
          if (el.querySelector?.("textarea, [contenteditable='true'], [contenteditable='plaintext-only']")) { row = el; break; }
        }
        if (!row || typeof ResizeObserver === "undefined") return undefined;
        const measure = () => setCompact(row.clientWidth > 0 && row.clientWidth < MEDIA_COMPACT_WIDTH);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        return () => observer.disconnect();
      }, [shadowed, data !== null]);

      const closeMenu = () => {
        setOpenKind(null);
        setAgentPane(false);
      };

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      // Load on mount, on session change and whenever a model menu opens. While
      // the host reports no generation model, or says its catalog missed the
      // plain listing that carries some image models, look again after 3 s,
      // 10 s, then every 30 s; otherwise there is no background polling.
      useEffect(() => {
        if (shadowed) return undefined;
        const controller = new AbortController();
        let again = null;
        (async () => {
          let needsRetry = true;
          try {
            const res = await fetch(mediaSessionURL(sessionId), { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok || body.ok === false) throw new Error(body.error || `HTTP ${res.status}`);
            setData(body.session ?? null);
            needsRetry = body.session?.catalogIncomplete === true ||
              !["image", "video"].some((kind) => Array.isArray(body.session?.options?.[kind]) && body.session.options[kind].length > 0);
          } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
          // 3 s, 10 s, then every 30 s (the host also syncs once on this request).
          if (needsRetry && !controller.signal.aborted) again = setTimeout(() => setRetry((n) => n + 1), [3000, 10000][retry] ?? 30 * 1000);
        })();
        return () => {
          controller.abort();
          if (again !== null) clearTimeout(again);
        };
      }, [sessionId, shadowed, openKind, retry]);

      useEffect(() => {
        if (openKind === null) return undefined;
        const place = () => {
          // Anchor the menu to the whole two-button group; it sits left of the
          // model selector either way.
          const rect = wrapRef.current?.getBoundingClientRect?.();
          if (!rect || typeof window === "undefined") return;
          const width = Math.min(340, window.innerWidth - 32);
          const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
          setPos({ left, bottom: Math.max(16, window.innerHeight - rect.top + 6), width });
        };
        place();
        const onDown = (e) => {
          if (wrapRef.current && !wrapRef.current.contains(e.target)) closeMenu();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            closeMenu();
            buttonRef.current?.focus?.();
          }
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", place);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", place);
        };
      }, [openKind]);

      const hasSession = typeof sessionId === "string" && sessionId !== "";
      const agent = data?.agent ?? null;
      const agentAvailable = agent?.enabled === true && hasSession;
      const kinds = ["image", "video"]
        .map((kind) => {
          const options = Array.isArray(data?.options?.[kind]) ? data.options[kind] : [];
          const currentRef = data?.current?.[kind]?.ref ?? null;
          const current = options.find((o) => o.ref === currentRef) ?? null;
          return { kind, options, currentRef, source: data?.current?.[kind]?.source ?? null, name: current ? current.name || current.modelId : null };
        })
        .filter((k) => k.options.length > 0);
      if (shadowed || kinds.length === 0) return null;

      const imageKind = kinds.find((k) => k.kind === "image") ?? null;
      const videoKind = kinds.find((k) => k.kind === "video") ?? null;
      const activeKind = openKind === "image" ? imageKind : openKind === "video" ? videoKind : null;
      const showingAgent = openKind !== null && agentPane && agentAvailable;
      const kindLabel = (k) =>
        k.name
          ? fmt(t, k.kind === "image" ? "mediaChipLabel" : "mediaChipVideoLabel", { model: k.name })
          : t(k.kind === "image" ? "mediaChipChoose" : "mediaChipVideoChoose");
      const openMenu = (kind, element) => {
        if (openKind === kind) {
          closeMenu();
          return;
        }
        buttonRef.current = element ?? null;
        setAgentPane(false);
        setOpenKind(kind);
      };

      const pick = async (kind, ref) => {
        setBusy(true);
        setError(null);
        try {
          const body = await postJson(API.mediaSessionSave, { ...(hasSession ? { sessionId } : {}), kind, ref });
          if (mounted.current) setData(body.session ?? null);
        } catch (err) {
          if (mounted.current) setError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };

      const optionGroups = (k) => {
        const groups = [];
        for (const option of k.options) {
          const group = groups.find((g) => g.accountId === option.accountId);
          if (group) group.items.push(option);
          else groups.push({ accountId: option.accountId, name: option.accountName, items: [option] });
        }
        return h(
          "div",
          { className: "dcpa-m-section", "data-kind": k.kind },
          k.source !== null && k.source !== "session" && hasSession ? h("p", { className: "dcpa-q-pop-text" }, t("mediaChipInherited")) : null,
          groups.map((group) =>
            h(
              "div",
              { key: group.accountId, role: "group", "aria-label": group.name },
              groups.length > 1 ? h("div", { className: "dcpa-m-group" }, group.name) : null,
              group.items.map((option) =>
                h(
                  "button",
                  {
                    key: option.ref,
                    type: "button",
                    role: "menuitemradio",
                    "aria-checked": option.ref === k.currentRef,
                    className: "dcpa-menu-item dcpa-m-option",
                    disabled: busy,
                    onClick: () => void pick(k.kind, option.ref),
                  },
                  h("span", { className: "dcpa-m-check", "aria-hidden": "true" }, option.ref === k.currentRef ? "✓" : ""),
                  h("span", { className: "dcpa-m-name" }, option.name || option.modelId),
                  option.aliasOf ? h("span", { className: "dcpa-q-tag", "data-tone": "info" }, fmt(t, "mediaAliasTag", { target: option.aliasOf })) : null
                )
              )
            )
          )
        );
      };

      // This session's rules for the agent tool: a secondary menu reached from
      // either model menu, never mixed into the model lists.
      const setPolicy = async (patch) => {
        setBusy(true);
        setError(null);
        try {
          const body = await postJson(API.mediaSessionSave, { sessionId, ...patch });
          if (mounted.current) setData(body.session ?? null);
        } catch (err) {
          if (mounted.current) setError(mediaErrorText(t, err));
        } finally {
          if (mounted.current) setBusy(false);
        }
      };
      const policySelect = (field, labelKey) =>
        h(
          "label",
          { className: "dcpa-m-policy-row" },
          h("span", null, t(labelKey)),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: agent.sources?.[field] === "session" ? agent[field] : "inherit",
              disabled: busy,
              onChange: (e) => void setPolicy({ [field]: e.target.value }),
            },
            h("option", { value: "inherit" }, fmt(t, "mediaFollowGlobal", { value: t((agent.global?.[field] ?? agent[field]) === "ask" ? "mediaConfirmAsk" : "mediaConfirmAuto") })),
            h("option", { value: "ask" }, t("mediaConfirmAsk")),
            h("option", { value: "auto" }, t("mediaConfirmAuto"))
          )
        );
      const sessionBudget = agent?.videoBudget ?? null;
      const agentSettings = !agentAvailable ? null : h(
        "div",
        { className: "dcpa-m-agent-pane", "data-kind": "agent" },
        policySelect("videoConfirm", "mediaVideoConfirm"),
        policySelect("imageConfirm", "mediaImageConfirm"),
        h(
          "label",
          { className: "dcpa-m-policy-row" },
          h("span", null, t("mediaVideoBudget")),
          h(
            "select",
            {
              className: "dcpa-q-input dcpa-media-select",
              value: agent.sources?.videoBudget === "session" ? budgetValue(sessionBudget) : "inherit",
              disabled: busy,
              onChange: (e) => void setPolicy({ videoBudget: e.target.value === "inherit" ? "inherit" : budgetFromValue(e.target.value) }),
            },
            h(
              "option",
              { value: "inherit" },
              fmt(t, "mediaFollowGlobal", { value: (agent.global?.videoBudget ?? sessionBudget)?.mode === "limited" ? fmt(t, "mediaBudgetSeconds", { n: (agent.global?.videoBudget ?? sessionBudget).seconds }) : t("mediaBudgetUnlimited") })
            ),
            budgetChoices(sessionBudget).map((n) => h("option", { key: n, value: `limited:${n}` }, fmt(t, "mediaBudgetSeconds", { n }))),
            h("option", { value: "unlimited" }, t("mediaBudgetUnlimited"))
          )
        ),
        h(
          "p",
          { className: "dcpa-q-pop-text", "data-agent-used": String(agent.used ?? 0) },
          sessionBudget?.mode === "limited"
            ? fmt(t, "mediaAgentUsed", { used: agent.used ?? 0, limit: sessionBudget.seconds })
            : fmt(t, "mediaAgentUsedUnlimited", { used: agent.used ?? 0 })
        )
      );
      const agentButton = h(
        "button",
        { type: "button", className: "dcpa-q-btn dcpa-m-agent-open", onClick: () => setAgentPane(true) },
        h(AGENT_ICON),
        h("span", null, t("mediaAgentSettings"))
      );
      const popVisible = openKind !== null && (showingAgent || activeKind !== null);
      const head = !popVisible
        ? null
        : showingAgent
        ? h(
            "div",
            { className: "dcpa-q-pop-head dcpa-m-agent-head" },
            h(
              "button",
              { type: "button", className: "dcpa-q-btn dcpa-m-back", "aria-label": t("mediaBack"), onClick: () => setAgentPane(false) },
              "‹ ",
              t("mediaBack")
            ),
            h("div", { className: "dcpa-q-pop-model" }, t("mediaAgentSection"))
          )
        : h(
            "div",
            { className: "dcpa-q-pop-head" },
            h("div", { className: "dcpa-q-pop-model" }, t(activeKind.kind === "image" ? "mediaImageGroup" : "mediaVideoGroup")),
            h("div", { className: "dcpa-q-pop-sub" }, t(activeKind.kind === "image" ? "mediaChipHint" : "mediaChipVideoHint"))
          );

      const pop = popVisible
          ? h(
              "div",
              {
                className: "dcpa-q-pop dcpa-m-pop",
                role: "dialog",
                "aria-label": showingAgent ? t("mediaAgentSection") : t(activeKind.kind === "image" ? "mediaImageGroup" : "mediaVideoGroup"),
                style: pos ? { left: `${pos.left}px`, bottom: `${pos.bottom}px`, width: `${pos.width}px` } : { visibility: "hidden" },
              },
              head,
              ...(showingAgent ? [agentSettings] : [optionGroups(activeKind), agentAvailable ? h("div", { className: "dcpa-m-foot" }, agentButton) : null]),
              error ? h("p", { className: "dcpa-q-pop-text", "data-tone": "error", role: "alert" }, fmt(t, "mediaPickFailed", { error })) : null
            )
          : null;

      const chipButton = (k) =>
        h(
          "button",
          {
            type: "button",
            className: "dcpa-q-badge dcpa-m-chip dcpa-m-chip-button",
            "data-kind": k.kind,
            "data-compact": compact ? "true" : undefined,
            "aria-label": kindLabel(k),
            "aria-haspopup": "dialog",
            "aria-expanded": openKind === k.kind,
            disabled: loading && data === null,
            onClick: (e) => openMenu(k.kind, e?.currentTarget ?? null),
          },
          h(
            "span",
            { className: "dcpa-m-chip-part" },
            h(k.kind === "image" ? IMAGE_ICON : VIDEO_ICON),
            compact ? null : h("span", { className: "dcpa-m-chip-label" }, k.name ?? t(k.kind === "image" ? "mediaChipChoose" : "mediaChipVideoChoose"))
          )
        );

      return h(
        "span",
        { ref: wrapRef, className: "dcpa-q-wrap dcpa-m-chip-group", "data-placement": placement, "data-dsh-plugin": MODULE_ID },
        imageKind !== null ? chipButton(imageKind) : null,
        imageKind !== null && videoKind !== null ? h("span", { className: "dcpa-m-chip-sep", "aria-hidden": "true" }) : null,
        videoKind !== null ? chipButton(videoKind) : null,
        pop
      );
    }
    // #endregion

    // #region generate_media tool rows (tool.call.toolview, key "generate_media")

    /** The run id the host derives from a tool call id (mirrors lib/media.js toolRunId). */
    function toolRunId(callId) {
      const raw = String(callId ?? "").replace(/[^A-Za-z0-9._:-]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 119);
      return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(raw) ? raw : null;
    }

    // Compatibility path for profiles without the native question service.
    // Only the composer owns these controls; chat rows never ask for consent.
    function MediaConfirmationDock({ t, sessionId = null }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [notice, setNotice] = useState(null);
      const [busy, setBusy] = useState(null);
      const lifetime = useRef(null);
      const answering = useRef(null);
      const answered = useRef(new Set());
      useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        answering.current = null;
        answered.current = new Set();
        setData(null);
        setNotice(null);
        setBusy(null);
        let timer;
        const load = async () => {
          try {
            const res = await fetch(mediaSessionURL(sessionId), { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (!res.ok || body.ok === false) throw new Error(`HTTP ${res.status}`);
            setData(body.session?.sessionId === sessionId ? body.session : null);
          } catch {
            // Missing/offline service is not an empty consent grant. Retry;
            // pending Host requests still time out closed.
          } finally {
            if (!controller.signal.aborted) {
              setLoading(false);
              timer = setTimeout(load, 2000);
            }
          }
        };
        if (typeof sessionId === "string" && sessionId !== "") void load();
        return () => { controller.abort(); clearTimeout(timer); };
      }, [sessionId]);
      const confirms = data?.sessionId === sessionId && Array.isArray(data.pendingConfirmations)
        ? data.pendingConfirmations.filter((item) => !answered.current.has(item.commandId)) : [];
      const answer = async (commandId, allow) => {
        if (answering.current !== null || answered.current.has(commandId)) return;
        const controller = lifetime.current;
        if (!controller || controller.signal.aborted) return;
        answering.current = commandId;
        setBusy(commandId);
        try {
          await postJson(API.mediaConfirm, { sessionId, commandId, allow });
          if (controller.signal.aborted) return;
          answered.current.add(commandId);
          setData((current) => current ? { ...current, pendingConfirmations: current.pendingConfirmations.filter((item) => item.commandId !== commandId) } : current);
          setNotice(null);
        } catch {
          if (!controller.signal.aborted) setNotice(t("mediaConfirmDeliveryFailed"));
        } finally {
          if (!controller.signal.aborted) { answering.current = null; setBusy(null); }
        }
      };
      if (loading || confirms.length === 0) return null;
      return h("section", { className: "dcpa-confirm-dock", role: "region", "aria-label": t("mediaConfirmWaiting") },
        ...confirms.map((confirm) => h("div", { className: "dcpa-chat-confirm", key: confirm.commandId, role: "group", "aria-label": t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle") },
          h("p", { className: "dcpa-chat-confirm-title" }, t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle")),
          h("p", { className: "dcpa-chat-confirm-text" }, t("mediaLocale") === "zh" ? confirm.zh : confirm.en),
          h("div", { className: "dcpa-q-actions" },
            h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: busy !== null, onClick: () => void answer(confirm.commandId, true) }, t("mediaConfirmAllow")),
            h("button", { type: "button", className: "dcpa-q-btn", disabled: busy !== null, onClick: () => void answer(confirm.commandId, false) }, t("mediaConfirmDecline"))),
          h("p", { className: "dcpa-chat-note" }, t("mediaConfirmNote")))),
        notice ? h("p", { role: "alert", className: "dcpa-chat-note" }, notice) : null);
    }

    const MEDIA_NODE_KIND = "dsh-cliproxyapi-media";

    // Fold the actual durable tool lifecycle, not an invented user command.
    // A tool result carries no tool name, so unrelated result-only contexts
    // intentionally remain invisible until a matching start is loaded.
    const mediaEventResult = (event) => event.type === "tool/result" ? event.data : event.type === "tool/ptc-dispatch" ? {
      message: { content: event.data.content ?? [], isError: event.data.isError === true },
      meta: event.data.meta,
    } : null;
    const mediaDispatchMatch = (event) => event.data?.name === "generate_media" && typeof event.data.subCallId === "string"
      ? { id: event.data.subCallId, role: "start" } : null;
    const mediaConversationDefinition = {
      kind: MEDIA_NODE_KIND,
      target: "chat",
      match: {
        "tool/call": (event) => event.data?.name === "generate_media" && typeof event.data.callId === "string"
          ? { id: event.data.callId, role: "start" } : null,
        "tool/result": (event) => event.surfaceOp === "append" && typeof event.data?.message?.source?.callId === "string"
          ? { id: event.data.message.source.callId, role: "update" } : null,
        "tool/ptc-dispatch-start": mediaDispatchMatch,
        "tool/ptc-dispatch": mediaDispatchMatch,
      },
      start: (_context, match) => ({
        callId: match.event.data.callId ?? match.event.data.subCallId,
        argsRaw: typeof match.event.data.arguments === "string" ? match.event.data.arguments : JSON.stringify(match.event.data.arguments ?? {}),
        result: mediaEventResult(match.event),
      }),
      update: (context, match) => {
        if (context.state == null) return null;
        const result = mediaEventResult(match.event);
        return result === null ? context.state : { ...context.state, result };
      },
      buildViewNode: (context) => {
        if (context.state == null || context.start === undefined) return null;
        const { callId, argsRaw, result } = context.state;
        const location = context.start.location;
        const interrupted = result === null && (
          location?.kind === "step" && location.step.status === "closed" ||
          (location?.kind === "step" || location?.kind === "turn") && location.turn.status === "closed"
        );
        const done = result !== null || interrupted;
        const block = done ? {
          kind: "tool-result", callId,
          call: { name: "generate_media", argsRaw },
          content: result?.message?.content ?? [],
          isError: interrupted || result?.message?.isError === true,
          ...(interrupted ? { error: { code: "interrupted" } } : {}),
          meta: result?.meta,
        } : { callId, phase: "start", argsRaw };
        return {
          key: context.key, id: context.id, kind: MEDIA_NODE_KIND, target: "chat",
          anchorSeq: context.start.event.seq, location,
          visibility: "visible",
          // Explicitly outside process. Keeping the source step location alone
          // (as the old synthetic command did) leaves it inside thinking.
          groupTree: "turn",
          data: { callId, phase: done ? "result" : "start", block },
        };
      },
    };

    /** Read only the typed, wrapped chat nodes, never flat legacy payloads. */
    function hasMediaNode(snapshot, runId) {
      return runId !== null && Array.isArray(snapshot?.order) && typeof snapshot.nodes?.get === "function" &&
        snapshot.order.some((key) => {
          const node = snapshot.nodes.get(key);
          return node?.kind === MEDIA_NODE_KIND && toolRunId(node.data?.callId) === runId;
        });
    }

    /**
     * The agent tool's call row, drawn like the matching slash command's row:
     * the request as a bubble, then progress and the result (polled through
     * `media/command` with the run id derived from the call id).
     * Owner props from DSH: `{ callId, phase, block }`.
     */
    function MediaToolRow({ t, owner = {}, sessionId = null, fileActions = null, runCommand = null, useChat = null, standalone = false }) {
      const block = owner.block ?? null;
      const done = block !== null && typeof block === "object" && "kind" in block;
      const runId = toolRunId(owner.callId ?? block?.callId);
      // New calls are mirrored as a top-level command row by the host. If that
      // row exists, drawing the full card here as well showed the same run
      // twice: once inside the folded process group and once as the command
      // row. Older calls have no mirrored row, so they keep their card.
      const mirrored = typeof useChat === "function"
        ? useChat((snapshot) => {
            return hasMediaNode(snapshot, runId);
          })
        : false;
      if (!standalone && mirrored) return null;
      let args = null;
      try {
        const raw = done ? block.call?.argsRaw : block?.argsRaw;
        const parsed = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : null;
        args = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        args = null;
      }
      const video = args?.kind === "video";
      const name = !video ? "cpa-image" : args.mode === "edit" ? "cpa-video-edit" : args.mode === "extend" ? "cpa-video-extend" : "cpa-video";
      const errorText = done && block.isError
        ? (Array.isArray(block.content) ? block.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : "").replace(/^Error:\s*/, "") || t("mediaCardFailed")
        : null;
      const outcome = errorText !== null ? { kind: "error", text: errorText } : done ? { kind: "success" } : owner.phase === "preparing" || args === null ? null : { kind: "success" };
      const node = { name, commandId: toolRunId(owner.callId ?? block?.callId), args: typeof args?.prompt === "string" ? `-- ${args.prompt}` : "", outcome };
      return h(ImageCommandCard, { t, node, sessionId, fileActions, runCommand, pending: !done, label: "generate_media", showCopy: false, showConfirm: false });
    }

    function MediaCommandRow({ useChat = null, node = null, ...props }) {
      const mirrored = typeof useChat === "function" ? useChat((snapshot) => hasMediaNode(snapshot, node?.commandId ?? null)) : false;
      return mirrored ? null : h(ImageCommandCard, { ...props, node, showConfirm: false });
    }

    // #endregion

    // #region /cpa-image and /cpa-video chat rows (conversation.chat.commandview, keys "cpa-image" / "cpa-video")

    /** Leading `/cpa-image` / `/cpa-video` options of a recorded command line, then the prompt (mirrors the host parsers, never throws). */
    function splitImageArgs(raw) {
      let rest = String(raw ?? "").trim();
      const out = { prompt: "" };
      for (;;) {
        if (rest.startsWith("-- ") || rest === "--") {
          rest = rest.slice(2).trim();
          break;
        }
        const match = rest.match(/^(-m|--model|--aspect|-n|--count|-s|--seconds|-r|--resolution)(?:=|\s+)(\S+)(?:\s+|$)/);
        if (match === null) break;
        if (match[1] === "-m" || match[1] === "--model") out.model = match[2];
        else if (match[1] === "--aspect") out.aspect = match[2];
        else if (match[1] === "-s" || match[1] === "--seconds") out.seconds = Number(match[2]) || undefined;
        else if (match[1] === "-r" || match[1] === "--resolution") out.resolution = match[2].toLowerCase();
        else out.count = Number(match[2]) || undefined;
        rest = rest.slice(match[0].length);
      }
      out.prompt = rest;
      return out;
    }

    const RUN_ERROR_KEYS = {
      interrupted: "mediaRunErrInterrupted",
      timeout: "mediaRunErrTimeout",
      network: "mediaRunErrNetwork",
      "no-image": "mediaRunErrNoImage",
      "invalid-image": "mediaRunErrInvalid",
      "invalid-response": "mediaRunErrInvalid",
      "write-failed": "mediaRunErrWrite",
      expired: "mediaRunErrExpired",
      "invalid-video": "mediaRunErrInvalidVideo",
      "video-too-large": "mediaRunErrVideoTooLarge",
    };

    /** "9 秒" / "1 分 23 秒" (zh), "9 s" / "1 min 23 s" (en). */
    const elapsedText = (t, seconds) => {
      const s = Math.max(0, Math.round(seconds));
      return s < 60 ? fmt(t, "mediaDurationS", { s }) : fmt(t, "mediaDurationMS", { m: Math.floor(s / 60), s: s % 60 });
    };

    const secondsBetween = (from, to) => {
      const start = Date.parse(from ?? "");
      return Number.isFinite(start) ? Math.max(0, Math.round((to - start) / 1000)) : 0;
    };

    const REVEAL_KEYS = { explorer: "mediaActRevealExplorer", finder: "mediaActRevealFinder", filemanager: "mediaActRevealFiles" };

    /** An application icon the Host reported: images by data URL or same-origin path only. */
    function safeIconSource(value) {
      if (typeof value !== "string" || value === "" || value.length > 200000) return null;
      if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);/i.test(value)) return value;
      return /^(\/|\.{0,2}\/|[a-z0-9-]+\/)/i.test(value) && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : null;
    }

    /** Copy one generated image as PNG (the clipboard takes PNG only, so other types are re-encoded). */
    async function copyImageToClipboard(url) {
      if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("clipboard unavailable");
      const png = (async () => {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.type === "image/png") return blob;
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));
      })();
      // A pending blob keeps the click's user activation for the write.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    }

    async function copyTextToClipboard(text) {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
    }

    /**
     * Replaces the generic command row of `/cpa-image` with a short exchange:
     * the request as a user bubble, then the result as a reply — progress while
     * the background job runs (polled through `media/command`), the images
     * when done (click to enlarge, right-click for open / show in folder /
     * copy), or the reason it failed. `fileActions` opens and reveals paths
     * through DSH's Session Remote; without it those items are hidden.
     * Hook order: slot 0 = data ({ run, files, folderPath }), slot 1 = loading (test harness).
     */
    // `pending`: an agent tool call still executing (its run record may not exist yet);
    // `label` replaces the command tag; `showCopy` hides "Copy original input" for tool rows.
    function ImageCommandCard({ t, node = null, sessionId = null, fileActions = null, runCommand = null, pending = false, label = null, showCopy = true, showConfirm = false }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [expanded, setExpanded] = useState(null);
      const [now, setNow] = useState(() => Date.now());
      const [menu, setMenu] = useState(null);
      const [notice, setNotice] = useState(null);
      const [canOpen, setCanOpen] = useState(false);
      // path → Host applications for it (array), "loading", or null after a failure.
      const [apps, setApps] = useState({});
      // Inline "edit / extend this video" form: null | "edit" | "extend".
      const [editMode, setEditMode] = useState(null);
      const [editDraft, setEditDraft] = useState("");
      const [editSeconds, setEditSeconds] = useState(6);
      const [editBusy, setEditBusy] = useState(false);
      const [confirmBusy, setConfirmBusy] = useState(false);
      const menuRef = useRef(null);
      const mounted = useRef(true);
      const outcome = node?.outcome ?? null;
      const commandId = typeof node?.commandId === "string" ? node.commandId : null;
      const admitted = outcome?.kind === "success";
      const canLoad = admitted && typeof sessionId === "string" && sessionId !== "" && commandId !== null;
      const run = data?.run ?? null;
      const kind = String(node?.name ?? "").startsWith("cpa-video") || run?.kind === "video" ? "video" : "image";
      const video = kind === "video";
      const running = outcome === null || (admitted && (run === null ? pending || (canLoad && loading) : run.status === "running"));
      const files = Array.isArray(data?.files) ? data.files : [];
      // The generated files this row shows (images, or the one video).
      const images = files.filter((f) => f.kind === kind);

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
        };
      }, []);

      // Load once; while the run is still going, look again every 2 s.
      useEffect(() => {
        if (!canLoad) return undefined;
        const controller = new AbortController();
        let timer = null;
        let failures = 0;
        const load = async () => {
          let again = false;
          try {
            const url = `${API.mediaCommand}?sessionId=${encodeURIComponent(sessionId)}&commandId=${encodeURIComponent(commandId)}`;
            const res = await fetch(url, { cache: "no-store", signal: controller.signal });
            const body = await res.json();
            if (controller.signal.aborted) return;
            if (res.ok && body.ok !== false) {
              setData({
                run: body.run ?? null,
                files: Array.isArray(body.files) ? body.files : [],
                folderPath: typeof body.folderPath === "string" ? body.folderPath : null,
                desktop: typeof body.desktop === "string" ? body.desktop : null,
                ...(body.confirm && typeof body.confirm === "object" ? { confirm: body.confirm } : {}),
                ...(body.actions && typeof body.actions === "object" ? { actions: body.actions } : {}),
              });
              again = body.run?.status === "running" || (pending && (body.run ?? null) === null);
            }
          } catch {
            if (controller.signal.aborted) return;
            again = ++failures < 5;
          } finally {
            if (!controller.signal.aborted) setLoading(false);
          }
          if (again && !controller.signal.aborted) timer = setTimeout(load, video ? 3000 : 2000);
        };
        void load();
        return () => {
          controller.abort();
          if (timer !== null) clearTimeout(timer);
        };
      }, [canLoad, sessionId, commandId, video, pending]);

      // The elapsed-time clock, only while running.
      useEffect(() => {
        if (!running) return undefined;
        const timer = setTimeout(() => setNow(Date.now()), 1000);
        return () => clearTimeout(timer);
      }, [running, now]);

      // Whether the Host desktop can open paths (asked once per page by fileActions).
      const hasFiles = images.length > 0;
      useEffect(() => {
        if (!hasFiles || fileActions === null) return undefined;
        let live = true;
        fileActions.available().then((value) => {
          if (live) setCanOpen(value === true);
        }, () => {});
        return () => {
          live = false;
        };
      }, [hasFiles, fileActions]);

      // A transient notice ("Copied", a failure) under the images.
      useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), 2500);
        return () => clearTimeout(timer);
      }, [notice]);

      // The context menu closes on an outside press, Escape, scroll or resize.
      useEffect(() => {
        if (menu === null || typeof document === "undefined") return undefined;
        const close = () => setMenu(null);
        const onDown = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) close();
        };
        const onKey = (e) => {
          if (e.key === "Escape") close();
        };
        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("resize", close);
        window.addEventListener("scroll", close, true);
        return () => {
          document.removeEventListener("mousedown", onDown, true);
          document.removeEventListener("keydown", onKey, true);
          window.removeEventListener("resize", close);
          window.removeEventListener("scroll", close, true);
        };
      }, [menu]);

      const say = (tone, text) => {
        if (mounted.current) setNotice({ tone, text });
      };
      const act = async (action, file, application) => {
        setMenu(null);
        try {
          if (action === "copy-image") {
            await copyImageToClipboard(mediaFileURL(sessionId, file.id));
            say("ok", t("mediaActCopied"));
          } else if (action === "copy-path") {
            await copyTextToClipboard(file.path);
            say("ok", t("mediaActCopied"));
          } else if (fileActions !== null) {
            const ok = await fileActions.open(file.path, action === "reveal" ? "reveal" : "open", action === "app" ? application : undefined);
            if (!ok) say("error", t("mediaActOpenFailed"));
          }
        } catch (err) {
          say("error", fmt(t, "mediaActCopyFailed", { error: err instanceof Error ? err.message : String(err) }));
        }
      };
      // The Host desktop's file manager names the reveal item (Explorer / Finder / Files).
      const revealLabel = t(REVEAL_KEYS[data?.desktop] ?? "mediaActReveal");
      /** The always-available actions: the buttons under an enlarged image. */
      const baseEntries = (file) => [
        ...(canOpen && file.path
          ? [
              { key: "open", label: t("mediaActOpen"), run: () => act("open", file) },
              { key: "reveal", label: revealLabel, run: () => act("reveal", file) },
            ]
          : []),
        ...(file.kind === "image" ? [{ key: "copy-image", label: t("mediaActCopyImage"), run: () => act("copy-image", file) }] : []),
        ...(file.path ? [{ key: "copy-path", label: t("mediaActCopyPath"), run: () => act("copy-path", file) }] : []),
      ];
      /**
       * The context menu: the Host's applications for this file (default
       * first, as DSH's document preview lists them), the file manager, then
       * the copy actions. While the list loads or when it is empty or failed,
       * a single "open with the default app" item stands in.
       */
      const menuEntries = (file) => {
        const out = [];
        if (canOpen && file.path) {
          const list = Array.isArray(apps[file.path]) ? apps[file.path] : [];
          const sorted = [...list.filter((app) => app.default), ...list.filter((app) => !app.default)];
          if (sorted.length > 0) {
            for (const app of sorted) {
              out.push({
                key: `app:${app.id}`,
                label: fmt(t, app.default ? "mediaActOpenWithDefault" : "mediaActOpenWith", { app: app.name }),
                icon: safeIconSource(app.icon),
                run: () => act("app", file, app.id),
              });
            }
          } else {
            out.push({ key: "open", label: t("mediaActOpen"), run: () => act("open", file) });
          }
          out.push({ key: "reveal", label: revealLabel, separated: true, run: () => act("reveal", file) });
        }
        if (file.kind === "image") out.push({ key: "copy-image", label: t("mediaActCopyImage"), separated: out.length > 0, run: () => act("copy-image", file) });
        if (file.path) out.push({ key: "copy-path", label: t("mediaActCopyPath"), separated: file.kind !== "image" && out.length > 0, run: () => act("copy-path", file) });
        return out;
      };
      const openMenu = (file) => (e) => {
        e.preventDefault?.();
        // Ask the Host which applications open this file (once per path).
        if (canOpen && file.path && fileActions?.applications && apps[file.path] === undefined) {
          setApps((current) => ({ ...current, [file.path]: "loading" }));
          fileActions.applications(file.path).then(
            (list) => {
              if (mounted.current) setApps((current) => ({ ...current, [file.path]: Array.isArray(list) ? list.slice(0, 12) : null }));
            },
            () => {
              if (mounted.current) setApps((current) => ({ ...current, [file.path]: null }));
            }
          );
        }
        const width = 240;
        const height = 64 + 32 * (6 + (Array.isArray(apps[file.path]) ? apps[file.path].length : 1));
        const vw = (typeof window === "undefined" ? 0 : window.innerWidth) || 1024;
        const vh = (typeof window === "undefined" ? 0 : window.innerHeight) || 768;
        setMenu({ id: file.id, left: Math.max(8, Math.min(e.clientX ?? 0, vw - width - 8)), top: Math.max(8, Math.min(e.clientY ?? 0, vh - height - 8)) });
      };
      const parsed = splitImageArgs(node?.args);
      const rawArgs = typeof node?.args === "string" ? node.args.trim() : "";
      const rawLine = showCopy && rawArgs !== "" ? `/${node?.name ?? "cpa-image"} ${rawArgs}` : null;
      const prompt = run?.prompt || parsed.prompt;
      const aspect = run?.aspect ?? parsed.aspect;
      const count = video ? 1 : run?.count ?? parsed.count ?? 1;
      const seconds = run?.seconds ?? parsed.seconds;
      const resolution = run?.resolution ?? parsed.resolution;
      const references = run?.references ?? 0;
      const modelName = run?.modelName || parsed.model || node?.name || "cpa-image";
      const shown = expanded ? images.find((f) => f.id === expanded) : undefined;
      const menuFile = menu ? images.find((f) => f.id === menu.id) : undefined;

      let errorText = null;
      if (outcome?.kind === "error") errorText = String(outcome.text ?? "").replace(/^\/cpa-image:\s*/, "") || t("mediaCardFailed");
      else if (run?.status === "error") errorText = RUN_ERROR_KEYS[run.errorCode] ? t(RUN_ERROR_KEYS[run.errorCode]) : run.error || t("mediaCardFailed");

      let status;
      if (errorText !== null) status = t("mediaCardFailed");
      else if (run === null && data?.confirm) status = t("mediaConfirmWaiting");
      else if (outcome === null || (run === null && (pending || (canLoad && loading)))) status = t("mediaCardSubmitting");
      else if (run?.status === "running") {
        const time = elapsedText(t, secondsBetween(run.startedAt, now));
        if (run.phase === "interpreting") status = fmt(t, "mediaCardInterpreting", { time });
        else if (!video) status = fmt(t, references > 0 ? "mediaCardEditing" : "mediaCardRunning", { time });
        else if (run.phase === "submitting") status = t("mediaCardSubmitting");
        else if (run.phase === "downloading") status = fmt(t, "mediaCardVideoSaving", { time });
        else if (run.phase === "queued") status = fmt(t, "mediaCardVideoQueued", { time });
        else status = run.progress !== undefined ? fmt(t, "mediaCardVideoProgress", { time, progress: run.progress }) : fmt(t, "mediaCardRunning", { time });
      } else if (run?.status === "done" && run.folder) {
        status = fmt(t, "mediaCardDone", { time: elapsedText(t, secondsBetween(run.startedAt, Date.parse(run.finishedAt ?? "") || now)), folder: run.folder });
      }
      else status = t("mediaCardDoneShort");
      const tone = errorText !== null ? "error" : running ? "running" : "done";

      const mode = run?.mode ?? (node?.name === "cpa-video-edit" ? "edit" : node?.name === "cpa-video-extend" ? "extend" : undefined);
      // What was actually sent, stated in the reply: the mode the host chose
      // (from the images and flags) and, for edits / extensions, the source.
      // Runs recorded before modes existed: an attached image was the first frame.
      const sentMode = video ? mode ?? (references > 0 ? "first-frame" : "text") : references > 0 ? "image-edit" : "image-text";
      const sourceName = typeof run?.sourceName === "string" && run.sourceName !== "" ? run.sourceName : null;
      const sourceText =
        run?.sourceKind === "upload" ? fmt(t, "mediaSourceUpload", { name: sourceName ?? "" })
        : run?.sourceKind === "url" ? fmt(t, "mediaSourceUrl", { name: sourceName ?? "" })
        : run?.sourceKind === "link" ? t("mediaSourceLink")
        : sourceName !== null ? fmt(t, "mediaSourceTag", { name: sourceName })
        : null;
      const modeLine = run === null
        ? null
        : sentMode === "reference" ? fmt(t, "mediaSentReference", { n: references })
        : sentMode === "edit" || sentMode === "extend"
          ? fmt(t, sentMode === "edit" ? "mediaSentEdit" : "mediaSentExtend", { n: seconds ?? 6, source: sourceText ?? t("mediaSourceSession") })
        : sentMode === "image-edit" ? fmt(t, "mediaSentImageEdit", { n: references })
        : t({ text: "mediaSentText", "first-frame": "mediaSentFirstFrame", "first-last": "mediaSentFirstLast", "last-frame": "mediaSentLastFrame", "image-text": "mediaSentImageText" }[sentMode] ?? "mediaSentText");
      // A generate_media call waiting for the user's confirmation in this row.
      const confirm = showConfirm && run === null && data?.confirm ? data.confirm : null;
      const answerConfirm = async (allow) => {
        if (confirm === null || commandId === null || confirmBusy) return;
        setConfirmBusy(true);
        try {
          await postJson(API.mediaConfirm, { sessionId, commandId, allow });
          if (mounted.current) setData((current) => (current ? { ...current, confirm: undefined } : current));
          if (mounted.current) setNotice({ tone: "ok", text: t(allow ? "mediaConfirmAllowed" : "mediaConfirmDeclined") });
        } catch (err) {
          if (mounted.current) setNotice({ tone: "error", text: fmt(t, "mediaConfirmFailed", { error: err instanceof Error ? err.message : String(err) }) });
        } finally {
          if (mounted.current) setConfirmBusy(false);
        }
      };
      const confirmBox =
        confirm !== null
          ? h(
              "div",
              { className: "dcpa-chat-confirm", role: "group", "aria-label": t("mediaConfirmTitle") },
              h("p", { className: "dcpa-chat-confirm-title" }, t(confirm.kind === "video" ? "mediaConfirmTitleVideo" : "mediaConfirmTitle")),
              h("p", { className: "dcpa-chat-confirm-text" }, t("mediaLocale") === "zh" ? confirm.zh : confirm.en),
              h(
                "div",
                { className: "dcpa-q-actions" },
                h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: confirmBusy, onClick: () => void answerConfirm(true) }, t("mediaConfirmAllow")),
                h("button", { type: "button", className: "dcpa-q-btn", disabled: confirmBusy, onClick: () => void answerConfirm(false) }, t("mediaConfirmDecline"))
              ),
              h("p", { className: "dcpa-chat-note" }, t("mediaConfirmNote"))
            )
          : null;
      // Which parameters the session's chat model read from the prompt.
      const interp = run?.interpreted ?? null;
      const interpretLine = interp === null || typeof interp.by !== "string"
        ? null
        : interp.failed ? fmt(t, "mediaInterpretFailed", { by: interp.by })
        : (Array.isArray(interp.items) && interp.items.length > 0 ? fmt(t, "mediaInterpreted", { by: interp.by, items: interp.items.join(" · ") }) : fmt(t, "mediaInterpretedNone", { by: interp.by }))
          + (interp.prompt ? t("mediaInterpretedPrompt") : "");
      const tags = [
        label ?? "/" + (node?.name ?? "cpa-image"),
        ...(aspect ? [aspect] : []),
        ...(video && seconds && mode !== "edit" && mode !== "extend" ? [fmt(t, "mediaSecondsOption", { n: seconds })] : []),
        ...(video && resolution ? [resolution] : []),
        ...(count > 1 ? [fmt(t, "mediaCardCount", { n: count })] : []),
        ...(video && Array.isArray(run?.ignored) && run.ignored.length > 0 ? [fmt(t, "mediaIgnoredTag", { words: run.ignored.join(" ") })] : []),
      ];

      const ratio = /^(\d+):(\d+)$/.exec(aspect ?? (video ? "16:9" : ""));
      const skeletons = running && errorText === null
        ? h(
            "div",
            { className: "dcpa-chat-grid", "data-count": String(count), "aria-hidden": "true" },
            Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, index) =>
              h("div", { key: index, className: "dcpa-chat-skeleton", style: { aspectRatio: ratio ? `${ratio[1]} / ${ratio[2]}` : "1 / 1" } })
            )
          )
        : null;

      const actionButtons = (file) =>
        baseEntries(file).map((entry) => h("button", { key: entry.key, type: "button", className: "dcpa-q-btn", onClick: () => void entry.run() }, entry.label));

      const gallery = video
        ? images.length > 0
          ? h(
              "div",
              { className: "dcpa-chat-videos" },
              images.map((file) =>
                h("video", {
                  key: file.id,
                  className: "dcpa-chat-video",
                  src: mediaFileURL(sessionId, file.id),
                  controls: true,
                  preload: "metadata",
                  playsInline: true,
                  "aria-label": file.name,
                  onContextMenu: openMenu(file),
                })
              )
            )
          : null
        : shown
        ? h(
            "div",
            { className: "dcpa-chat-full" },
            h(
              "button",
              { type: "button", className: "dcpa-chat-full-btn", "aria-label": t("mediaClosePreview"), onClick: () => setExpanded(null), onContextMenu: openMenu(shown) },
              h("img", { src: mediaFileURL(sessionId, shown.id), alt: shown.name })
            ),
            h(
              "div",
              { className: "dcpa-q-actions" },
              actionButtons(shown),
              h("button", { type: "button", className: "dcpa-q-btn", onClick: () => setExpanded(null) }, t("mediaClosePreview"))
            )
          )
        : images.length > 0
        ? h(
            "div",
            { className: "dcpa-chat-grid", "data-count": String(images.length) },
            images.map((file, index) =>
              h(
                "button",
                {
                  key: file.id,
                  type: "button",
                  className: "dcpa-chat-thumb",
                  "aria-label": fmt(t, "mediaCardImage", { n: index + 1 }),
                  onClick: () => setExpanded(file.id),
                  onContextMenu: openMenu(file),
                },
                h("img", { src: mediaFileURL(sessionId, file.id), alt: file.name, loading: "lazy" })
              )
            )
          )
        : null;

      const contextMenu = menuFile
        ? h(
            "div",
            { ref: menuRef, className: "dcpa-q-pop dcpa-chat-menu", role: "menu", "aria-label": t("mediaActMenu"), style: { left: `${menu.left}px`, top: `${menu.top}px` } },
            menuEntries(menuFile).flatMap((entry) => [
              entry.separated ? h("div", { key: `${entry.key}-sep`, role: "separator", className: "dcpa-chat-menu-sep" }) : null,
              h(
                "button",
                { key: entry.key, type: "button", role: "menuitem", className: "dcpa-menu-item dcpa-chat-menu-item", onClick: () => void entry.run() },
                entry.icon ? h("img", { className: "dcpa-chat-menu-icon", src: entry.icon, alt: "", "aria-hidden": "true" }) : h("span", { className: "dcpa-chat-menu-icon", "aria-hidden": "true" }),
                h("span", { className: "dcpa-chat-menu-label" }, entry.label)
              ),
            ]),
            menuFile.path && canOpen && apps[menuFile.path] === "loading" ? h("div", { key: "loading", className: "dcpa-chat-menu-hint", role: "status" }, t("mediaActAppsLoading")) : null
          )
        : null;

      const pathLink = (path, label, action) =>
        canOpen
          ? h("button", { type: "button", className: "dcpa-chat-link", onClick: () => void act(action, { path }) }, label)
          : h("span", null, label);

      const finished = admitted && !running && errorText === null;
      const actions = finished && video ? data?.actions ?? null : null;
      const submitEdit = async () => {
        const prompt = editDraft.trim();
        if (prompt === "" || runCommand === null || commandId === null) return;
        setEditBusy(true);
        const line = `/cpa-video-${editMode} --from ${commandId} ${editMode === "extend" ? `-s ${editSeconds} ` : ""}-- ${prompt}`;
        const outcome = await runCommand(sessionId, line);
        if (!mounted.current) return;
        setEditBusy(false);
        if (outcome.ok) {
          setEditMode(null);
          setEditDraft("");
          say("ok", t("mediaEditSubmitted"));
        } else {
          say("error", outcome.text || t("mediaEditFailed"));
        }
      };
      const editForm =
        editMode !== null
          ? h(
              "div",
              { className: "dcpa-chat-edit" },
              h("textarea", {
                className: "dcpa-q-input dcpa-chat-edit-input",
                rows: 2,
                value: editDraft,
                placeholder: t(editMode === "extend" ? "mediaExtendPlaceholder" : "mediaEditPlaceholder"),
                "aria-label": t(editMode === "extend" ? "mediaExtendPlaceholder" : "mediaEditPlaceholder"),
                disabled: editBusy,
                onChange: (e) => setEditDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
                    e.preventDefault?.();
                    void submitEdit();
                  }
                },
              }),
              h(
                "div",
                { className: "dcpa-q-actions" },
                editMode === "extend"
                  ? h(
                      "select",
                      {
                        className: "dcpa-q-input dcpa-media-select",
                        "aria-label": t("mediaExtendSeconds"),
                        value: String(editSeconds),
                        disabled: editBusy,
                        onChange: (e) => setEditSeconds(Number(e.target.value)),
                      },
                      Array.from({ length: 9 }, (_, i) => h("option", { key: i + 2, value: String(i + 2) }, fmt(t, "mediaModeExtend", { n: i + 2 })))
                    )
                  : null,
                h("button", { type: "button", className: "dcpa-q-btn", "data-variant": "primary", disabled: editBusy || editDraft.trim() === "", onClick: () => void submitEdit() }, t(editMode === "extend" ? "mediaExtendSubmit" : "mediaEditSubmit")),
                h("button", { type: "button", className: "dcpa-q-btn", disabled: editBusy, onClick: () => setEditMode(null) }, t("mediaEditCancel"))
              ),
              h("p", { className: "dcpa-chat-note" }, t("mediaEditNote"))
            )
          : null;
      const editButtons =
        actions !== null && runCommand !== null && editMode === null && (actions.edit || actions.extend)
          ? [
              actions.edit ? h("button", { key: "edit", type: "button", className: "dcpa-q-btn", onClick: () => setEditMode("edit") }, t("mediaEditOpen")) : null,
              actions.extend ? h("button", { key: "extend", type: "button", className: "dcpa-q-btn", onClick: () => setEditMode("extend") }, t("mediaExtendOpen")) : null,
            ]
          : [];
      const folderPath = typeof data?.folderPath === "string" ? data.folderPath : null;
      const details = finished && (images.length > 0 || run?.revisedPrompt)
        ? h(
            "details",
            { className: "dcpa-chat-details" },
            h("summary", null, t("mediaCardDetails")),
            h(
              "dl",
              null,
              folderPath ? [h("dt", { key: "dt" }, t("mediaCardFolder")), h("dd", { key: "dd" }, pathLink(folderPath, folderPath, "open"))] : null,
              images.length > 0
                ? [
                    h("dt", { key: "ft" }, t("mediaCardFiles")),
                    h("dd", { key: "fd", className: "dcpa-chat-files" }, images.map((f) => h("span", { key: f.id }, f.path ? pathLink(f.path, f.name, "open") : f.name))),
                  ]
                : null,
              run?.revisedPrompt ? [h("dt", { key: "rt" }, t("mediaCardRevised")), h("dd", { key: "rd" }, run.revisedPrompt)] : null
            )
          )
        : null;

      return h(
        "div",
        { className: "dcpa-chat", "data-dsh-plugin": MODULE_ID, "data-state": tone, "data-kind": kind },
        h(
          "div",
          { className: "dcpa-chat-user" },
          prompt !== "" ? h("div", { className: "dcpa-chat-bubble" }, prompt) : null,
          h(
            "div",
            { className: "dcpa-chat-tags" },
            tags.map((tag, index) => h("span", { key: index }, tag)),
            // The command line exactly as typed (the bubble shows the parsed prompt).
            rawLine !== null
              ? h(
                  "button",
                  {
                    key: "copy",
                    type: "button",
                    className: "dcpa-chat-copy",
                    onClick: () => {
                      copyTextToClipboard(rawLine).then(
                        () => say("ok", t("mediaCopiedInput")),
                        (err) => say("error", fmt(t, "mediaActCopyFailed", { error: err instanceof Error ? err.message : String(err) }))
                      );
                    },
                  },
                  t("mediaCopyInput")
                )
              : null
          )
        ),
        h(
          "div",
          { className: "dcpa-chat-reply" },
          h(
            "div",
            { className: "dcpa-chat-head" },
            h(IMAGE_ICON),
            h("span", { className: "dcpa-chat-model" }, run?.accountName ? `${modelName} · ${run.accountName}` : modelName),
            h("span", { className: "dcpa-chat-sep", "aria-hidden": "true" }),
            h("span", { className: "dcpa-chat-status", "data-tone": tone, role: running ? "status" : undefined }, status)
          ),
          modeLine !== null ? h("p", { className: "dcpa-chat-mode", "data-mode": sentMode }, modeLine) : null,
          interpretLine !== null ? h("p", { className: "dcpa-chat-mode", "data-interpreted": interp.failed ? "failed" : "ok" }, interpretLine) : null,
          confirmBox,
          errorText !== null ? h("p", { className: "dcpa-chat-error", role: "alert" }, errorText) : null,
          skeletons,
          running && errorText === null && admitted && run !== null ? h("p", { className: "dcpa-chat-note" }, t(video ? "mediaCardVideoNoStop" : "mediaCardNoStop")) : null,
          video && finished && images.length > 0 ? h("div", { className: "dcpa-q-actions" }, actionButtons(images[0]), editButtons) : null,
          editForm,
          gallery,
          notice ? h("p", { className: "dcpa-chat-note", role: "status", "data-tone": notice.tone }, notice.text) : null,
          finished && !loading && data !== null && images.length === 0 ? h("p", { className: "dcpa-chat-note" }, t("mediaCardMissing")) : null,
          details
        ),
        contextMenu
      );
    }
    // #endregion
    const inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-cliproxyapi: dictionaries");
      const t = ctx.locale.bind(NS);

      // Open / reveal generated files through DSH's own Session Remote (the
      // same calls the document preview uses); the Host re-verifies each path.
      // Desktop availability is asked once per activation.
      let desktopAvailable = null;
      // The generated Remote namespace is its own service, "remote.session".
      const sessionRemote = () => {
        try {
          return ctx.get?.("remote.session") ?? ctx.get?.("remote")?.session;
        } catch {
          return undefined;
        }
      };
      // Run a follow-up slash command (edit / extend a video) in the session,
      // the way the composer does; its row appears in the conversation.
      const runCommand = async (sessionId, line) => {
        try {
          const commands = ctx.get?.("remote.commands") ?? ctx.get?.("remote")?.commands;
          if (typeof commands?.execute !== "function" || typeof sessionId !== "string") return { ok: false };
          const result = await commands.execute(sessionId, line, []);
          if (result?.ok !== true || result.value === undefined) return { ok: false, text: result?.error?.message };
          const outcome = result.value.result;
          return outcome?.kind === "error" ? { ok: false, text: outcome.text } : { ok: true };
        } catch (error) {
          return { ok: false, text: error instanceof Error ? error.message : String(error) };
        }
      };
      const fileActions = {
        available() {
          if (desktopAvailable !== null) return desktopAvailable;
          const remote = sessionRemote();
          // Not mounted yet: answer no for now and ask again next time.
          if (typeof remote?.canOpenWorkspacePath !== "function") return Promise.resolve(false);
          desktopAvailable = (async () => {
            try {
              const result = await remote.canOpenWorkspacePath();
              return result?.ok === true && result.value === true;
            } catch {
              desktopAvailable = null;
              return false;
            }
          })();
          return desktopAvailable;
        },
        async applications(path) {
          try {
            const result = await sessionRemote()?.workspacePathApplications?.({ path });
            return result?.ok === true && Array.isArray(result.value)
              ? result.value.filter((app) => app && typeof app.id === "string" && typeof app.name === "string")
              : null;
          } catch {
            return null;
          }
        },
        async open(path, action, application) {
          try {
            const result = await sessionRemote()?.openWorkspacePath?.(
              action === "reveal" ? { path, action } : application === undefined ? { path } : { path, application }
            );
            return result?.ok === true;
          } catch {
            return false;
          }
        },
      };

      // Each activation owns its stylesheet. A hot reload can start the new
      // activation before the old one is disposed; sharing one element would
      // let the old disposal remove the new activation's styles.
      if (typeof document !== "undefined") {
        ctx.effect(() => {
          const styleEl = document.createElement("style");
          styleEl.dataset.plugin = MODULE_ID;
          styleEl.textContent = CSS;
          document.head.appendChild(styleEl);
          return () => styleEl.remove();
        }, "dsh-cliproxyapi: styles");
      }

      // List and keyed slots reject a second entry with the same id/key at the
      // same priority. During a hot reload the previous activation may still
      // hold it, so register one priority lower instead of losing the entry:
      // the lowest priority renders, and this entry takes over once the old
      // activation is disposed. The id/key itself stays stable.
      const registerListEntry = (slots, options, render) => {
        let priority = options.priority ?? 0;
        for (let attempt = 0; ; attempt++) {
          try {
            return slots.register(priority === 0 ? options : { ...options, priority }, render);
          } catch (error) {
            if (attempt >= 4 || !/already has an? (entry|registration)/.test(String(error?.message ?? error))) throw error;
            priority += 1;
          }
        }
      };

      // dshmarket installation client, shared by the card and the opt-in
      // background auto-install runner. No DOM writes; timers and requests
      // are disposed with this activation (HMR/unmount).
      ctx.effect(() => {
        const market = createMarketUpdater();
        sharedMarket = market;
        const stopAutoInstall = startAutoInstall(market);
        return () => {
          stopAutoInstall();
          market.dispose();
          if (sharedMarket === market) sharedMarket = null;
        };
      }, "dsh-cliproxyapi: market updates");

      // Quota client shared by the "额度" tab and every composer badge; it
      // polls only while something is subscribed and aborts on dispose.
      ctx.effect(() => {
        const store = createQuotaStore();
        sharedQuota = store;
        return () => {
          store.dispose();
          if (sharedQuota === store) sharedQuota = null;
        };
      }, "dsh-cliproxyapi: quota");

      // Composer: the badge sits in conversation.input.right, which the
      // composer renders immediately before the model selector. The session's
      // model directory (ui-model-selection) tells it the selected route/model.
      // The composer renders that list only once the session is bound, so a
      // New Session hero (model selector already visible) gets a second entry
      // in conversation.hero.options; it steps aside while the composer badge
      // of the same session is mounted (see createBadgePresence).
      if (typeof ctx.inject === "function") {
        ctx.inject(["slots", "modelDirectories"], (scope) => {
          const models = scope.modelDirectories;
          // Never resolve the directory here: DSH caches this result per
          // session binding, so an early miss would hide the badge for good.
          const injectDirectory = (sessionId) => ({
            resolveDirectory: () => models.directoryFor(sessionId).store,
            sessionId: typeof sessionId === "string" ? sessionId : null,
          });
          const badgeEntry = (name, id, placement) =>
            scope.slots.inject(name, () =>
              registerListEntry(
                scope.slots,
                {
                  name,
                  id,
                  order: 10000,
                  label: () => t("tabQuota"),
                  locale: NS,
                  inject: injectDirectory,
                },
                (props = {}) =>
                  h(QuotaBadge, {
                    t,
                    directory: props.directory ?? null,
                    resolveDirectory: typeof props.resolveDirectory === "function" ? props.resolveDirectory : null,
                    sessionId: props.sessionId ?? null,
                    placement,
                    store: sharedQuota,
                  })
              )
            );
          badgeEntry("conversation.input.right", `${NS}:quota`, "composer");
          badgeEntry("conversation.hero.options", `${NS}:quota-hero`, "hero");
        });
      }

      // Generation-model button, left of the quota badge. It only needs the
      // session id; like the badge, the hero copy steps aside while the
      // composer copy of the same session is mounted.
      const mediaEntry = (name, id, placement) =>
        ctx.slots.inject(name, () =>
          registerListEntry(
            ctx.slots,
            {
              name,
              id,
              order: 9990,
              label: () => t("tabMedia"),
              locale: NS,
              inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
            },
            (props = {}) => h(MediaChip, { t, sessionId: props.sessionId ?? null, placement })
          )
        );
      mediaEntry("conversation.input.right", `${NS}:media`, "composer");
      mediaEntry("conversation.hero.options", `${NS}:media-hero`, "hero");

      // A real Conversation node explicitly escapes both process folds. Its
      // definition is replayed by DSH; no session rescans or synthetic events.
      if (typeof ctx.inject === "function") {
        ctx.inject(["uiConversation"], (scope) => {
          if (typeof scope.uiConversation?.events?.register !== "function") return;
          scope.effect(() => scope.uiConversation.events.register(mediaConversationDefinition), "cpa: media conversation");
          scope.slots.inject("conversation.chat.node", () => registerListEntry(scope.slots, {
            name: "conversation.chat.node", key: MEDIA_NODE_KIND, locale: NS,
            inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
          }, (props = {}) => h(MediaToolRow, {
            t, owner: props.node?.data ?? {}, sessionId: props.sessionId ?? null,
            fileActions, runCommand, standalone: true,
          })));
        });
      }

      ctx.slots.inject("conversation.composer.dock", () => registerListEntry(ctx.slots, {
        name: "conversation.composer.dock", id: `${NS}:media-confirmation`, order: -10, locale: NS,
        inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
      }, (props = {}) => h(MediaConfirmationDock, { t, sessionId: props.sessionId ?? null })));

      // The /cpa-image and /cpa-video chat rows, keyed by command name; other
      // commands keep the generic row.
      for (const key of ["cpa-image", "cpa-video", "cpa-video-edit", "cpa-video-extend"]) {
        ctx.slots.inject("conversation.chat.commandview", () =>
          registerListEntry(
            ctx.slots,
            {
              name: "conversation.chat.commandview",
              key,
              locale: NS,
              inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
            },
            (props = {}) => h(MediaCommandRow, { t, node: props.node ?? null, sessionId: props.sessionId ?? null, fileActions, runCommand, useChat: props.useChat ?? null })
          )
        );
      }

      // The generate_media agent tool's call row (replaces DSH's generic tool row).
      ctx.slots.inject("tool.call.toolview", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "tool.call.toolview",
            key: "generate_media",
            locale: NS,
            inject: (sessionId) => ({ sessionId: typeof sessionId === "string" ? sessionId : null }),
          },
          (props = {}) => h(MediaToolRow, { t, owner: props, sessionId: props.sessionId ?? null, fileActions, runCommand, useChat: props.useChat ?? null })
        )
      );

      // 1. Accounts and models: a page of its own in the Settings dialog's left
      //    navigation (like dshmarket's "Market" section). The slot owner gives
      //    unregistered ids the default nav glyph; no DOM is touched here.
      ctx.slots.inject("settings.section", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "settings.section",
            id: SETTINGS_SECTION_ID,
            order: 45,
            label: () => t("nav"),
            locale: NS,
          },
          () => h(CpaSectionPage, { t })
        )
      );

      // 2. Plugin updates only, on the bundle page in Sidebar -> Plugins.
      ctx.slots.inject("plugins.bundle.config", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "plugins.bundle.config",
            key: MODULE_ID,
            locale: NS,
          },
          (ownerProps = {}) => (ownerProps.view === "summary" ? null : h(PluginUpdatePage, { t }))
        )
      );

      // 3. Plugin updates only, as a tab in Settings -> Plugins.
      ctx.slots.inject("settings.plugins.tab", () =>
        registerListEntry(
          ctx.slots,
          {
            name: "settings.plugins.tab",
            id: NS,
            order: 50,
            label: () => t("nav"),
            locale: NS,
          },
          () => h(PluginUpdatePage, { t })
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = MODULE_ID;
    return module.exports;
  },
});
