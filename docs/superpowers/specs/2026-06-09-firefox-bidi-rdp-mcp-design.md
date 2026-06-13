# JSReverser-Firefox-MCP 设计文档

| 项 | 值 |
|---|---|
| Spec 日期 | 2026-06-09 |
| 项目名 | JSReverser-Firefox-MCP |
| npm 包名 | camoufox-jsreverser-mcp |
| 运行时 | Node.js 20+ |
| 主语言 | TypeScript |
| 源参考 | https://github.com/lwjjike/JSReverser-Strong-MCP (Chrome CDP 版) |

## 1. 目标与范围

### 1.1 项目目标
在不使用 Chrome DevTools Protocol 的前提下，用 Firefox 提供的两条远程协议（WebDriver BiDi + Firefox Remote Debugging Protocol，下称 RDP）实现与 JSReverser-Strong-MCP 功能对等（除 WASM 整组外）的 MCP 服务，承载相同的前端 JavaScript 逆向方法论。

### 1.2 方法论承诺
延续原项目的 6 条工作流原则：`Observe-first`、`Hook-preferred`、`Breakpoint-last`、`Rebuild-oriented`、`Evidence-first`、`Pure-extraction-after-pass`。

### 1.3 v1 范围
- 工具总数：82 个。
- 提供：页面观察、脚本定位、Hook 与运行时采样、暂停式调试、网络与 WebSocket 观察（含 worker 内 ws）、控制台、Storage 与 Session 快照、DOM 交互、Stealth 反检测、Rebuild 与 Evidence、AST 与 AI 辅助分析、运行时 pref 拨档（JS / CSP）。
- 不提供：WASM 整组（7 个工具）。

### 1.4 非目标
- 不做对真实风控站点的内置 case 回归（保留为示例代码而非测试）。
- 不做多浏览器并发 fanout，一个 MCP 进程对应一个浏览器实例。
- 不自动重启已死的 Firefox 进程。
- 不做用户级 profile 持久化；launch 模式始终用临时 profile。

## 2. 架构

### 2.1 总览

```
┌──────────────────────────────────────────────────────┐
│  MCP Server  (stdio, @modelcontextprotocol/sdk)      │
│  - tool-registry / error-translator / argv           │
├──────────────────────────────────────────────────────┤
│  Tools 层  (src/tools/**)                            │
│  - 一个工具一个文件                                    │
│  - 仅依赖 Capability，不直接访问协议                   │
├──────────────────────────────────────────────────────┤
│  Capabilities 层  (src/capabilities/**)              │
│  - 每个 capability 一个 interface                    │
│  - 由 1~2 个 Driver 拼出具体实现                      │
├──────────────────────────────────────────────────────┤
│  Drivers 层  (src/drivers/**)                        │
│  - BidiDriver        (ws, 主路)                       │
│  - RdpDriver         (tcp, 懒连, Debugger 等)         │
│  - FirefoxLauncher   (子进程 + 临时 profile)          │
└──────────────────────────────────────────────────────┘
```

四层分工原则：
1. **工具只看 Capability**：工具不知道下面是 BiDi 还是 RDP。
2. **Capability 是 interface**：未来 BiDi 补齐 Debugger 能力，只需替换 `pauseController` 一个 capability 的实现。
3. **Driver 不暴露给工具**：所有 driver 实例由 Session 单例持有。
4. **进程内单 Session**：一个 MCP 进程对应一个 Firefox + 一组工具调用。

### 2.2 协议组合理由

- **BiDi 为主路**：W3C 标准、Firefox 长期支持、`script.addPreloadScript` 在文档创建前必中（stealth 关键依赖）。
- **RDP 兜底 Debugger 与细粒度检视**：提供 thread actor（含 column 级断点、callframe scope 内 evaluate）、grip 体系（懒展开、internal slots）、性能 actor、网络 initiator stacktrace、worker target 上的资源观察，覆盖 BiDi 不提供的所有原项目能力。
- **不用 Puppeteer / WebDriver client 抽象**：手写 driver，避免被库的封装挡住协议细节。

### 2.3 Driver 层

#### 2.3.1 BidiDriver
- 维护一条 `/session` WebSocket，做 BiDi 协议的请求/响应配对（`id` → Promise）与事件广播（`method` → EventEmitter）。
- 维护 **subscription registry**：每次 `session.subscribe` / `session.unsubscribe` 的事件名 + contexts 列表都记一份；断连重连后按本表对 Firefox 重放，恢复事件订阅（BiDi 协议本身不持久化订阅）。
- 暴露：`send(method, params): Promise<result>`、`subscribe(events, contexts?)`、`unsubscribe(events, contexts?)`、`on(event, handler)`、`close()`。
- 不做业务语义、不持有状态缓存、不翻译错误。
- 依赖：`ws` 包、`FirefoxLauncher`（取 ws 地址）。

#### 2.3.2 RdpDriver
- 懒连接到 `tcp://127.0.0.1:<rdpPort>`，按 RDP length-prefixed JSON 帧协议收发。
- 维护 actor 树：`root` → `descriptor` → `watcher` → `target` / `resource`。
- 请求/响应配对走 `from`/`to`；每个 actor 维护独立 FIFO 队列（同一 actor 上的请求不可并发）。
- 把 notify 包（`tabListChanged`、`target-available-form`、`resource-available-array` 等）翻成 EventEmitter 事件。
- 第一次需要 RDP 能力的 capability 触发 `ensureConnected()`。
- 暴露：`ensureConnected()`、`getRoot()`、`call(actor, request)`、`on(event, handler)`、`close()`。
- 依赖：Node `net`、`FirefoxLauncher`（取 rdp port）。

#### 2.3.3 FirefoxLauncher
- 在 launch 模式下：
  1. 创建临时 profile 目录。
  2. 写入 prefs：`devtools.debugger.remote-enabled=true`、`devtools.debugger.prompt-connection=false`、`devtools.chrome.enabled=true`、`remote.enabled=true`、`remote.active-protocols=binary`，以及 stealth 相关默认值。
  3. 启动子进程：`firefox --remote-debugging-port=<bidiPort> --start-debugger-server <rdpPort> --profile <tmpProfile>`。
  4. 解析 stderr 拿到 `WebDriver BiDi listening on ws://…` 与 `Remote Debugging Server listening on port …`，把端点交给 driver。
- 在 attach 模式下：读取用户传入的 `--bidi-url` 与 `--rdp-port`，不起进程。
- BidiDriver 在 launch / attach 后调用 `session.new` 时，capabilities 默认带 `acceptInsecureCerts: true`，避免自签证书 / mitm 代理调试场景失败。
- 启动完成后调用 `browser.setDownloadBehavior({ destinationFolder: '<artifacts>/downloads' })`，让 wasm / 静态资源下载落到任务目录便于后续 rebuild 引用。
- 关闭流程：撤销所有 preload script、删除 breakpoint、调 BiDi `browser.close`（优雅退出）；5 秒未退则 SIGTERM；再 5 秒未退则 SIGKILL；删除临时 profile。

### 2.4 Capabilities 层

| Capability | 职责 | 实现路径 |
|---|---|---|
| `scriptHost` | 列脚本、取脚本源码、指定 realm 内执行 JS | BiDi `script.*` + `browsingContext.*` |
| `preloadInjector` | 注册「文档创建时立刻执行」脚本；可向 worker target 追注 | BiDi `script.addPreloadScript` + RDP worker target evaluate |
| `networkObserver` | 订阅请求/响应/失败、登记响应体收集器、读取 body、按 XHR 条件中断、强制请求失败 | BiDi `network.addIntercept` / `continueRequest` / `continueResponse` / `continueWithAuth` / `provideResponse` / `failRequest` / `setExtraHeaders` / `setCacheBehavior` / `addDataCollector` / `disownData` / `getData`；事件 `beforeRequestSent` / `responseStarted` / `responseCompleted` / `authRequired` / `fetchError` |
| `wsObserver` | 抓 WebSocket 连接与帧（含 worker 内 ws） | RDP WEBSOCKET resource（page + worker target）+ preload hook 回退 |
| `logSink` | 聚合 console / 异常 / 网络日志 | BiDi `log.entryAdded` |
| `storageAccess` | cookie / localStorage / sessionStorage / IndexedDB 读写 | BiDi `storage.*`（cookie，含 partition key）+ `script.evaluate`（localStorage / sessionStorage / IndexedDB 间接读写）|
| `pageController` | 新建/选中/激活页签、navigate、reload、前进后退（history）、截图、PDF、viewport、自动应答 native dialog | BiDi `browsingContext.create` / `close` / `activate` / `navigate` / `reload` / `traverseHistory` / `captureScreenshot` / `print` / `setViewport` / `handleUserPrompt`；事件 `userPromptOpened` / `userPromptClosed` |
| `domAccess` | querySelector / click / type / waitForElement | BiDi `input.performActions`（真实输入事件）+ `script.callFunction`（节点定位与等待）|
| `pauseController` | breakpoint、pause/resume、step、callframe evaluate、当前页冻结 | RDP thread actor |
| `objectInspector` | 对象懒展开与 internal slot 检视 | RDP grip / ObjectActor |
| `eventMonitor` | DOM/CSS 引擎级事件订阅 | RDP walker / inspector / styleSheets actor |
| `performanceProbe` | 底层引擎性能指标 | RDP performance actor |
| `initiatorTracer` | 网络 initiator 的完整调用栈 | RDP NetworkEvent stacktrace |
| `stealth` | preset / feature 管理、注入指纹覆盖脚本、UA/地理/时区/语言/触摸/屏幕/网络条件覆盖 | `preloadInjector`（指纹位、`__webdriver_*` 清理）+ BiDi `emulation.setUserAgentOverride` / `setTimezoneOverride` / `setGeolocationOverride` / `setLocaleOverride` / `setTouchOverride` / `setScreenOrientationOverride` / `setNetworkConditions`；viewport 走 `browsingContext.setViewport` |
| `sessionState` | 浏览器会话快照 save/restore/dump/load | `storageAccess` 之上的快照 |
| `hookRegistry` | hook 定义、脚本渲染、数据回流 | `preloadInjector` + `logSink` |
| `workerTopology` | 列 worker、按 type 过滤、attach 指定 worker | RDP watcher target-available-form |
| `astAnalyzer` | parse JS → AST、运行 transform pipelines | 本地 babel |
| `cryptoSignatures` | 加密算法静态识别（AES/RC4/MD5/SHA*/Base64/HMAC/RSA/SM 系列） | 本地规则库 |
| `llmProvider` | LLM 调用抽象（多 provider、超时、重试、env 校验） | 本地 + 外部 API |
| `taskArtifacts` | 任务工件目录（runtime-evidence/network/scripts/env/run/report） | 本地文件 IO |
| `runtimePrefs` | 内部能力：session-scoped pref 拨档与还原（v1 仅用于 stealth 启动期锁 prefs 与 shutdown 还原） | RDP PreferenceActor |

四层捆绑：driver → capability → session → tool；每一层都禁止跳层访问。

### 2.5 Session 层

进程内单例，持有所有 driver 实例和所有 capability 实例，并维护全局状态缓存：

- 当前选中页签（contextId）和 frame（realmId）。
- 已加载脚本表（id → {url, source, hash}）。
- 已注册 hook 表（hookId → 定义 + 注入状态 + worker 注入列表）。
- 网络请求池（requestId → {req, res, initiator, bodyRef}），BiDi 流与 RDP NetworkEvent 流用一致 hash 对齐。
- 已观察 WebSocket 表（按 `(targetId, wsid)` 索引 → 连接元 + 帧分组 + source 标注）。
- session snapshot 列表（snapshotId → JSON）。
- console 消息环形缓冲。
- RDP actor 树缓存（watcher actor、当前 target actor、resource subscription token）。
- pause 上下文（threadActor、pauseActor、frameActor、生命周期）。
- session-scoped pref overrides 表（shutdown 还原）。

### 2.6 MCP Server 层

- `src/server/server.ts`：起 `Server` from `@modelcontextprotocol/sdk`，挂 stdio。
- `src/server/tool-registry.ts`：扫 `src/tools/**`，按 zod schema 注册每个工具。
- `src/server/error-translator.ts`：把 Driver/Capability/Session 抛出的内部错误翻译成统一 `ToolResult`。
- `src/server/argv.ts`：解析 `--bidi-url`、`--rdp-port`、`--attach`、`--firefox-path`、`--stealth=auto|off`。

### 2.7 文件树

```
src/
  drivers/
    bidi/           # BidiDriver + 协议层 helpers
    rdp/            # RdpDriver + actor pool
    launcher/       # FirefoxLauncher + profile 模板
  capabilities/
    scriptHost.ts
    preloadInjector.ts
    networkObserver.ts
    wsObserver.ts
    logSink.ts
    storageAccess.ts
    pageController.ts
    domAccess.ts
    pauseController.ts
    objectInspector.ts
    eventMonitor.ts
    performanceProbe.ts
    initiatorTracer.ts
    stealth.ts
    sessionState.ts
    hookRegistry.ts
    workerTopology.ts
    astAnalyzer.ts
    cryptoSignatures.ts
    llmProvider.ts
    taskArtifacts.ts
    runtimePrefs.ts
  session/
    Session.ts
    caches.ts
  server/
    server.ts
    tool-registry.ts
    error-translator.ts
    argv.ts
  tools/
    page-state/
    scripts/
    hooks/
    debugger/
    network/
    websocket/
    console/
    dom/
    storage/
    stealth/
    rebuild/
    ai-ast/
    workers/
    prefs/
  stealth-scripts/   # 预置 stealth preload 脚本
  ast/
    transforms/
    rules/
  llm/
    provider.ts
    providers/openai.ts
    providers/anthropic.ts
    providers/openai-compatible.ts
    cache.ts
  rebuild/           # 复用原项目的 bundler
test/
  unit/
  integration/
  e2e/
```

### 2.8 v1 工具清单（82 个）

- **page-state**（9）：`check_browser_health`、`list_pages`、`new_page`、`select_page`、`navigate_page`、`list_frames`、`select_frame`、`take_screenshot`、`get_performance_metrics`
- **scripts**（5）：`list_scripts`、`get_script_source`、`find_in_script`、`search_in_scripts`、`search_in_sources`
- **hooks**（8）：`create_hook`、`inject_hook`、`get_hook_data`、`list_hooks`、`remove_hook`、`hook_function`、`unhook_function`、`trace_function`
- **debugger**（12）：`set_breakpoint`、`set_breakpoint_on_text`、`remove_breakpoint`、`list_breakpoints`、`pause`、`resume`、`step_over`、`step_into`、`step_out`、`get_paused_info`、`evaluate_on_callframe`、`inspect_object`
- **network**（5）：`list_network_requests`、`get_network_request`、`get_request_initiator`、`break_on_xhr`、`remove_xhr_breakpoint`
- **websocket**（4）：`list_websocket_connections`、`get_websocket_message`、`get_websocket_messages`、`analyze_websocket_messages`
- **console / runtime**（5）：`list_console_messages`、`get_console_message`、`evaluate_script`、`monitor_events`、`stop_monitor`
- **dom**（6）：`get_dom_structure`、`query_dom`、`find_clickable_elements`、`click_element`、`type_text`、`wait_for_element`
- **storage / session**（7）：`get_storage`、`save_session_state`、`restore_session_state`、`dump_session_state`、`load_session_state`、`list_session_states`、`delete_session_state`
- **stealth**（5）：`inject_stealth`、`list_stealth_features`、`list_stealth_presets`、`inject_preload_script`、`set_user_agent`
- **rebuild & evidence**（6）：`collect_code`、`export_rebuild_bundle`、`diff_env_requirements`、`record_reverse_evidence`、`export_session_report`、`collection_diff`
- **ai-ast**（6）：`understand_code`、`summarize_code`、`deobfuscate_code`、`detect_crypto`、`analyze_target`、`risk_panel`
- **workers**（2）：`list_workers`、`select_worker`

注：hooks 组内的 inject_hook / hook_function 通过新增可选参数 `target: 'page' | 'worker:<id>' | 'all-workers'` 指向 worker，工具名不变、不重复登记。
- **prefs**（2）：`set_javascript_enabled`、`set_csp_enabled`

`collection_diff` 归属 rebuild & evidence 组（在 evidence 比对场景里被 AI/AST 工具内部调用，不重复登记）。

不出现在 list_tools 的工具：所有 `*_wasm*` 工具。

## 3. 数据流

### 3.1 启动 / 接管时序（launch 模式）

```
MCP boot
  └─ Server.start(stdio)
       └─ ArgvParser → opts { mode: 'launch', stealth: 'auto', ... }
       └─ Session.init(opts)
            ├─ FirefoxLauncher.launch()
            │    ├─ 解析 stderr 拿 bidiUrl + rdpPort
            │    └─ 返回 endpoints
            ├─ BidiDriver.connect(bidiUrl)
            │    ├─ session.new (capabilities: { acceptInsecureCerts: true })
            │    ├─ session.subscribe([
            │    │      browsingContext.contextCreated/contextDestroyed,
            │    │      browsingContext.navigationStarted/navigationCommitted/load/navigationFailed,
            │    │      browsingContext.userPromptOpened/userPromptClosed,
            │    │      log.entryAdded,
            │    │      network.beforeRequestSent/responseStarted/responseCompleted/fetchError/authRequired,
            │    │      script.message/realmCreated/realmDestroyed ])
            │    └─ 把首个 browsingContext 记为「当前页」
            ├─ Stealth.applyPreset('firefox-default')   // 默认开
            │    └─ preloadInjector.add( <stealth.js> )
            └─ RdpDriver = 懒，不连
  Server.ready, list_tools 返回 v1 工具
```

### 3.2 emit 通道与中央 dispatcher

进程启动时随机生成 `__mcp_emit_<8 字节 hex>`，preload 脚本与 hook 模板都用这个名字。

所有页内回流统一走 BiDi `script.message`，payload 必带 `channel` 字段：
```
{ channel: 'hook' | 'ws' | 'event' | 'stealth', ... }
```
Session 在中央 dispatcher 里按 channel 路由到对应 capability，**capability 不直接订阅 `script.message`**。

### 3.3 用例 1：list_network_requests → get_network_request → get_request_initiator

```
TOOL list_network_requests(filter)
  └─ Session.requestPool.snapshot(filter)        # 纯内存
  └─ 返回精简列表

事件流（持续）：
Firefox ─ network.beforeRequestSent ─→ BidiDriver
                                   └─ networkObserver.onBeforeRequest
                                        └─ Session.requestPool.put(...)

TOOL get_network_request(requestId)
  └─ networkObserver.fetchBodyIfNeeded(requestId)
       └─ BidiDriver.send('network.getData', ...)
  └─ 合并 Session.requestPool[requestId] 的 req/res
  └─ 返回完整请求详情

TOOL get_request_initiator(requestId)
  └─ initiatorTracer.get(requestId)
       └─ 如需 stack：RdpDriver.ensureConnected()
                       RdpDriver.call(networkEventActor, 'getStackTrace', ...)
       └─ 把 source actor id 归一化为 scriptUrl
       └─ 返回 stack
```

### 3.4 用例 2：create_hook → inject_hook → get_hook_data

```
TOOL create_hook({ name, targetExpr, capture })
  └─ hookRegistry.create()
       └─ 渲染最终 JS 模板（Proxy 包装 + __mcp_emit_<hex>）
  └─ 返回 { hookId, scriptPreview }

TOOL inject_hook(hookId, { target: 'page' | 'worker:<id>' | 'all-workers' })
  ├─ 主页面：preloadInjector.add(...) (BiDi)
  │   并对已存在页面 script.callFunction 立刻执行一次
  └─ worker：
       └─ RdpDriver.ensureConnected()
       └─ workerTopology.listOrAttach(target)
       └─ preloadInjector.addToWorker(script, workerTarget)
       └─ 在 hookRegistry 记录注入延迟与覆盖范围（warn）

事件流：
hook 命中 → window.__mcp_emit_<hex>({ channel: 'hook', hookId, ts, args, ret, stack })
  → BiDi script.message
  → Session.dispatch → hookRegistry.collect(hookId, payload)

TOOL get_hook_data(hookId, { limit, since })
  └─ hookRegistry.read(...)                      # 纯内存
```

### 3.5 用例 3：set_breakpoint_on_text → pause → evaluate_on_callframe

```
TOOL set_breakpoint_on_text({ text, scriptUrl? })
  └─ pauseController.setByText(...)
       └─ RdpDriver.ensureConnected()
       └─ 找 source actor（scriptHost 脚本缓存模糊匹配）
       └─ source actor 'source' 拿源码
       └─ 在源码里定位 text → (line, column)
       └─ thread actor 'setBreakpoint' { location: {sourceId, line, column} }
       └─ 返回 { actualLocation, breakpointActor }
  └─ Session.breakpoints[bpId] = { sourceActor, actualLocation, bpActor }

  // 防漏：setBreakpoint 返回后立即查一次当前是否已 paused
  └─ pauseController.probePauseNow()

事件流：
业务命中断点 → thread actor push 'paused'
  → pauseController.onPaused
       └─ Session.pauseCtx = { threadActor, pauseActor, frameActor, why }

TOOL get_paused_info()
  └─ 返回栈顶 frame 摘要 + why

TOOL evaluate_on_callframe({ expression })
  └─ pauseController.assertPaused()
  └─ RdpDriver.call(threadActor, { type: 'clientEvaluate',
                                    expression,
                                    frame: pauseCtx.frameActor })
  └─ 等下一个 paused（why.type === 'clientEvaluate'）
  └─ 重映射 pauseActor 与所有 grip
  └─ 浅展开后返回

TOOL resume()
  └─ RdpDriver.call(threadActor, { type: 'resume' })
  └─ Session.pauseCtx = null
  └─ Session.disposeGripsUnder(pauseActor)
```

错误返回示例（典型 ErrorReason 在本链路上的冒泡形态）：
```
set_breakpoint_on_text  失败  →  { ok: false, reason: 'breakpoint_unresolved',
                                    hint: '源码已 minify，建议先 prettify 后重试',
                                    details: { rdpError: 'noCodeAtLineColumn', text, line } }
evaluate_on_callframe   失败  →  { ok: false, reason: 'not_paused',
                                    hint: '当前 thread 未暂停，先 set_breakpoint 或 pause' }
evaluate_on_callframe   并发  →  { ok: false, reason: 'pause_context_lost',
                                    retriable: false,
                                    hint: '检测到并发 resume，所有 grip 失效；重新触发暂停后再调' }
任意 RDP 调用 ws/tcp 断  →   { ok: false, reason: 'firefox_disconnected',
                                    retriable: true,
                                    hint: 'Session 已自动重连并重放 hook / 断点；重新发起调用即可' }
```

### 3.6 用例 4：break_on_xhr

```
TOOL break_on_xhr({ urlPattern })
  └─ Session.xhrBreakpoints.push({ id, urlPattern })
  └─ preloadInjector.upsert('xhr-break', `
        const orig = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          if (window.__mcp_match_xhr(url)) { debugger; }
          return orig.apply(this, arguments);
        };
        // fetch 同理
      `)
  └─ RdpDriver.ensureConnected()
  └─ thread actor 'pauseOnDebuggerStatement' = true
  └─ 返回 { id }
```

命中后跟用例 3 的暂停路径会合。`remove_xhr_breakpoint` 反向。

### 3.7 用例 5：save_session_state / restore_session_state

```
TOOL save_session_state({ name })
  └─ sessionState.snapshot()
       ├─ storageAccess.getAllCookies()       # BiDi storage.getCookies
       ├─ script.evaluate(`Object.entries(localStorage)`) per origin
       └─ 同上 sessionStorage
  └─ Session.snapshots[name] = { cookies, localByOrigin, sessionByOrigin, capturedAt }

TOOL restore_session_state({ name })
  └─ 反向写回（BiDi storage.setCookie / script.evaluate setItem）
  └─ 可选 reload
```

`dump_session_state` / `load_session_state` 是内存快照与 JSON 的互转，不打协议。

### 3.8 用例 6：export_rebuild_bundle

完全本地：
```
TOOL export_rebuild_bundle({ taskId, scripts, hooks, networkSamples, envProbes })
  └─ rebuild.bundleBuilder.build({...})
       ├─ 拿 Session.scriptCache 里的源码
       ├─ 拿 hookRegistry 里的采样
       ├─ 拿 networkObserver 里的请求样本
       └─ 输出 artifacts/tasks/<taskId>/
  └─ 返回 { taskRoot, fileTree }
```

### 3.9 用例 7：set_javascript_enabled / set_csp_enabled

```
TOOL set_javascript_enabled({ enabled, contextId?, scope: 'context' | 'current-page' })
  ├─ scope='context'（默认）：
  │   └─ pageController.assertContextExists(contextId ?? current)
  │   └─ BidiDriver.send('emulation.setScriptingEnabled', {
  │        contexts: [contextId ?? current],
  │        enabled
  │      })
  │   └─ 下次 navigate 起效；Session 记录已被覆盖的 context，shutdown 还原
  └─ scope='current-page'：
      └─ pauseController.freezeCurrent()         # RDP thread actor interrupt
      └─ 状态机标记冻结；resume 工具同步解冻

TOOL set_csp_enabled({ enabled, contextId? })
  └─ pageController.assertContextExists(contextId ?? current)
  └─ BidiDriver.send('browsingContext.setBypassCSP', {
       context: contextId ?? current,
       bypass: !enabled
     })
```

设计取舍说明：v1 内 JS 与 CSP 开关都走 BiDi（emulation.setScriptingEnabled / browsingContext.setBypassCSP），per-context 作用域，不污染用户其它 tab，无需 confirm gate。`runtimePrefs` capability 退为内部能力，仅服务 stealth 启动期的 pref 锁定与还原（如 `dom.webdriver.enabled` 等），不再被工具层调用。

### 3.10 用例 8：worker WebSocket 帧抓取

```
事件流（自动）：
RDP target-available-form (worker) ─→ Session.workerTopology.onNew
  └─ wsObserver.watch(workerTarget)
       └─ RdpDriver.call(watcher, 'watchResources', [WEBSOCKET], { targetActor })

WebSocket 帧抓取：
RDP resource-available-array (websocket frame)
  → wsObserver.recordFrame(targetId, wsid, frame, source='rdp')

回退（service worker 上 WEBSOCKET 不可用时）：
preloadInjector.addToWorker(`<重写 WebSocket.prototype 的脚本>`)
  → 帧通过 __mcp_emit_<hex>({ channel: 'ws', source: 'preload-hook', ... }) 上报
  → wsObserver.recordFrame(..., source='preload-hook')

TOOL list_websocket_connections({ targetFilter? })
TOOL get_websocket_messages({ wsid, targetFilter? })
  → 返回字段含 source: 'rdp' | 'preload-hook'
```

**Service Worker 生命周期限制**：BiDi 不提供 SW 注册/卸载/触发能力，RDP 只能在 SW 已注册后观察其 target。v1 工具的契约是「能 attach 已注册的 SW 并 hook，但不主动管理 SW 生命周期」——`list_workers` 的输出元数据带 `lifecycle: 'observed' | 'unknown'` 让 LLM 知道这是被动观察。

## 4. 错误处理

### 4.1 错误分层

| 层 | 错误类型 | 翻译者 |
|---|---|---|
| Driver | 协议错误（`{from, error}`）、ws/tcp 断、超时、actor 失效 | Driver 抛 `DriverError` 子类 |
| Capability | 业务不变量被违反 / 不可用降级 | Capability 抛 `CapabilityError` 子类 |
| Session | 状态不一致（找不到 requestId/hookId/snapshotId/bpId） | Session 抛 `SessionError` 子类 |
| Tool | 参数 schema 校验失败 | tool-registry 用 zod 校验，直接返回结构化错误 |
| MCP Server | 统一翻译到 `ToolResult` | `error-translator` |

### 4.2 统一结果对象

```ts
type ToolResult<T> =
  | { ok: true; data: T; warnings?: Array<{ code: string; message: string }> }
  | { ok: false; reason: ErrorReason; hint?: string; retriable?: boolean; details?: unknown }
```

LLM 看到的 reason 都是已知枚举词。

### 4.3 ErrorReason 枚举

- `bad_args`：schema 校验失败；details 带 zod 错误。
- `browser_not_ready`：浏览器连接没起或断了；retriable: true。
- `capability_unavailable`：例如调 `pauseController` 但 RDP 不可用；hint 提示确认 launch 时未关闭 RDP、attach 时传了 `--rdp-port`。
- `target_not_found`：pageId / frameId / workerTarget 不存在。
- `not_paused`：`evaluate_on_callframe` 在未暂停时调用。
- `pause_context_lost`：pauseActor 失效；retriable: false。
- `breakpoint_unresolved`：`noScript` / `noCodeAtLineColumn`；hint 建议 prettify 重试。
- `resource_not_found`：requestId / hookId / snapshotId / wsid 失效。
- `script_not_collected_yet`：脚本缓存尚未采集到目标。
- `firefox_protocol_error`：driver 拿到 `{error}` 但不在已知词表；details 带原 reason。
- `firefox_disconnected`：ws/tcp 断；retriable: true（hint：Session 会自动重连）。
- `llm_not_configured`：需要 LLM 但 provider 未配置；hint 指向 .env 说明。
- `llm_failed`：provider 错误或超时；retriable: true。
- `ast_parse_failed`：babel 解析失败；details 带位置。
- `worker_not_attached`：调 worker 相关工具时 worker 未 attach。
- `worker_injection_delayed`：worker 已运行后才注入（仅作为 warning 出现在 data.warnings）。
- `prefs_actor_unavailable`：RDP PreferenceActor 不可用（v1 内部用于 stealth 启动期 prefs 锁定与还原；用户工具不会直接触发）。

### 4.4 自动恢复策略

- **`browser_not_ready` / `firefox_disconnected`**：
  - Session 持有 `connectionGuard`，每次工具调用前检测 ws 健康度。
  - 重连成功后由 Session 重放 hook 与 breakpoint，**保留脚本缓存、session 快照、网络请求池、WebSocket 帧、console 缓冲**。
  - 重连失败把错误穿出去。
- **`pause_context_lost`**：不自动恢复；hint 写「重新触发暂停后再调」。
- **`llm_failed`**：`llmProvider` 内部指数退避重试 2 次，失败穿出。
- **工具级**：除上述明列项外，不静默重试整个工具（避免有副作用的 hook 注入被重复执行）。

### 4.5 不做的事

- 不全局 try/catch 兜底；每个 capability 自己负责语义级错误。
- 不把错误降级成「成功 + 空数据」；空数据会让 LLM 误判「真的没有」。
- 不自动重启 Firefox 进程；Firefox 死了就是 `browser_not_ready`，等用户手动 `check_browser_health`。

### 4.6 生命周期清理

进程退出时 Session 触发 `cleanup()`：
1. 撤销所有 preload script（BiDi `script.removePreloadScript`）。
2. delete breakpoints（RDP）。
3. 还原所有 runtimePrefs overrides。
4. 关闭 RDP / BiDi。
5. launch 模式：SIGTERM → 5s → SIGKILL；删除临时 profile。

### 4.7 Stealth 不在错误层报告

`inject_stealth` 的参数错返回 `bad_args`。「stealth 没盖住 navigator.webdriver」这种沉默失败不在工具层报错——我们不知道目标站的具体检测代码。可观察性靠 `record_reverse_evidence` 沉淀人工证据。

## 5. 测试策略

### 5.1 Layer 1：单元测试（Vitest，test/unit/）

测纯逻辑，**不**起 Firefox。

- `BidiDriver` / `RdpDriver`：mock socket，测请求-响应配对（BiDi 用 id、RDP 用 actor FIFO）、事件分发、超时、断连、重连、actor 树失效语义。
- `hookRegistry`：渲染脚本被 `acorn` 解析通过；channel 路由正确。
- `Session.dispatch`：给定 `script.message` payload 走到对的 capability。
- `error-translator`：每条 ErrorReason 一个用例。
- `astAnalyzer` 的 transforms：输入混淆 → 期望 AST snapshot。
- `cryptoSignatures`：每条规则一个正例 + 一个负例。
- `llmProvider`：mock fetch，测 provider 切换、超时、retry。
- `rebuild.bundleBuilder`：fixture session state → 断言文件树。
- `runtimePrefs`：set/get/reset 顺序与 restoreOnShutdown 语义。

目标：**≥80% statement coverage**，CI 卡死。

### 5.2 Layer 2：协议集成测试（test/integration/）

测 driver ↔ Firefox 真协议交互，不覆盖 tools 层。直接复用 `FirefoxLauncher`。

- BiDi：launch → 握手 → `browsingContext.create` → navigate 到本地 fixture → `script.evaluate('1+1') === 2`。
- RDP：attach → 列 source → setBreakpoint → 触发 pause → frames → clientEvaluate → resume。
- preload：注入后能在新文档命中。
- storage：读写一致。
- network：fixture 页面 fetch 能抓到。
- worker websocket：fixture 同时在 page 和 dedicated worker 内建 ws，断言两侧 frame 都抓到。
- emulation.setScriptingEnabled：对当前 context set `enabled=false` → navigate → 断言 JS 没跑 → 改回 `enabled=true` → 重 navigate → 断言 JS 跑；再 attach 一个新 context 断言 JS 默认能跑（验证 per-context 隔离）。
- browsingContext.setBypassCSP：fixture 页面带严格 CSP → set `bypass=true` → 注入 inline script 能命中 → set `bypass=false` → 重新注入应被拦截。
- runtimePrefs（内部）：stealth 启动期 set 一组 pref（如 `dom.webdriver.enabled=false`）→ navigate → 断言 `navigator.webdriver === false` → shutdown → 用独立 client 重启 Firefox 验证 pref 已还原。
- 每个 BiDi 模块 + 每个用到的 RDP actor 至少 1 个用例。

CI 锁定 1 个 Firefox ESR + 1 个 Firefox stable 版本。

### 5.3 Layer 3：端到端工作流测试（test/e2e/）

跑真 MCP server（stdio 子进程），用 `@modelcontextprotocol/sdk` 的 client 连上调工具。

fixture 站点：本地 Express + 3 个 fixture 业务页面：
- `fixture-sig`：提交时混淆 JS 生成 `x-sig` 头。
- `fixture-xhr-pause`：fetch `/api/secret`，签名在 fetch 里现算。
- `fixture-ws`：周期发 base64 二进制帧。

工作流脚本：
- **W1**：observe-first 找签名脚本（new_page → navigate → list_scripts → find_in_script → 命中）。
- **W2**：hook-preferred 抓签名 IO（create_hook + inject_hook → 触发 → get_hook_data → 断言）。
- **W3**：breakpoint-last 验证（set_breakpoint_on_text → 触发 → get_paused_info → evaluate_on_callframe → resume）。
- **W4**：rebuild 端到端（W1+W2 → collect_code → export_rebuild_bundle → Node 跑 → 签名一致）。
- **W5**：stealth 自检（navigate 到 `navigator.webdriver` 探测页 → 断言 false）。
- **W6**：AI/AST 链路（mock LLM）（fixture 混淆码 → deobfuscate_code → detect_crypto 命中 AES → analyze_target）。
- **W7**：disable JS → navigate → 抓静态 HTML → enable JS → 重 navigate → hook 命中。

目标：每次 PR 上方法论主线都跑通。Happy path only；分支与错误用例留给 L1/L2。

### 5.4 不做的事

- 不对真实风控站做回归测试（原项目的 `scripts/cases/` 保留为示例）。
- v1 不做性能基准。
- 不写手工 QA checklist。

### 5.5 CI 编排

```
on PR:
  unit                          # ~30s
  integration (firefox-stable)  # ~2-3 min
  e2e (firefox-stable, mock LLM)# ~3-5 min
on nightly:
  整套 + integration (firefox-esr)
on release tag:
  整套 + integration (firefox-esr + firefox-stable + firefox-beta)
```

Firefox 二进制：CI 用 `browser-actions/setup-firefox` 装；本地用 `FIREFOX_PATH` 环境变量或 `which firefox`。

### 5.6 Lint 规则

新 capability / 新 driver method 上 PR 时必须带至少一个对应 integration 用例；用 lint rule 检查 `src/capabilities/foo.ts` 改动时 `test/integration/foo.test.ts` 必须同改。

## 6. 与原项目的差距清单

| 维度 | 原项目 | v1 状态 | 备注 |
|---|---|---|---|
| 主流程 observe/hook/network/console/storage/rebuild/stealth | ✅ | ✅ | 打平 |
| 暂停式调试（断点 + step + callframe eval） | ✅ | ✅ | RDP 提供 column 精度与栈帧作用域 |
| 跨 worker / OOP iframe 断点 | ✅ | ✅ | RDP watcher target |
| Worker 内 hook 注入 | ✅ | ✅ | 带 `worker_injection_delayed` warning |
| Worker 内 ws frame | ✅ | ✅ | RDP 主路 + preload hook 回退 |
| 对象检视 internal slot / lazy | ✅ | ✅ | RDP grip，capability 层做 SpiderMonkey ↔ 通用名映射 |
| 网络 initiator stack | ✅ | ✅ | RDP NetworkEvent stacktrace |
| Performance 引擎级指标 | ✅ | ✅ | RDP performance actor，字段归一化 |
| DOM/CSS 引擎级事件 | ✅ | ✅ | RDP walker / inspector / styleSheets |
| AI/AST 整组 | ✅ | ✅ | 本地实现，复用原项目代码 |
| set_javascript_enabled 等价 | ✅ | ✅ | BiDi `emulation.setScriptingEnabled`（per-context） |
| setBypassCSP 等价 | ✅ | ✅ | BiDi `browsingContext.setBypassCSP`（per-context） |
| WASM 整组 | ✅ | ❌ | v1 不做 |

**v1 真差距 = 仅 WASM 整组（7 个工具）。**

**事实基础**：以上每行已对照 `cdp_vs_bidi_coverage.html`（CDP 域 → BiDi 模块覆盖矩阵，55 行，FULL 11 / PARTIAL 3 / NONE 41）逐项校验。其中：
- 「BiDi FULL」的能力（Network、Page、Runtime、Target、Storage、Input、Emulation、Log、Browser 等 11 项）我们走 BiDi 主路。
- 「BiDi PARTIAL」的三项（DOM / Debugger / DOMStorage）按表中建议处理：DOM 走 `script.callFunction` + `input.performActions`；Debugger 走 RDP 兜底；DOMStorage 走 `storage.*` + `script.evaluate` 间接。
- 「BiDi NONE 但逆向相关」的几项（CSP bypass、acceptInsecureCerts、IndexedDB、ServiceWorker、Emulation 细分项）在 v1 内显式处理：CSP 走 BiDi `browsingContext.setBypassCSP`；acceptInsecureCerts 默认开启；IndexedDB 通过 `storageAccess` 间接读写；SW 仅观察不管理（写进 docstring）。
- 其它「BiDi NONE 且逆向不相关」的项（WebAudio / Cast / SmartCardEmulation 等）v1 不实现。

**W3C 规范一致性**：进一步对照 `bidi_modules_report.html`（W3C BiDi 官方模块/命令/事件清单，10 模块、63 commands、27 events、66 types），61/62 项 wanted 全部命中规范；唯一例外是 `emulation.setViewport` —— 实际它在 W3C 规范里被定义为 `browsingContext.setViewport`，spec 内 `stealth` 与 `pageController` 已分别按规范使用。`emulation.setScriptingEnabled` 是 W3C 已标准化的 per-context JS 开关，v1 `set_javascript_enabled` 据此从 RDP 路径改走 BiDi。

## 7. 启动与运行

### 7.1 启动参数

```
camoufox-jsreverser-mcp \
  [--bidi-url ws://127.0.0.1:9222/...] \
  [--rdp-port 6000] \
  [--attach] \
  [--firefox-path /path/to/firefox] \
  [--stealth auto|off]
```

- 不传 `--attach`：launch 模式；自动选用空闲端口起 BiDi + RDP；默认 `--stealth=auto`。
- 传 `--attach` + `--bidi-url` + `--rdp-port`：attach 模式；不起子进程。

### 7.2 codex MCP 配置

```toml
[mcp_servers.camoufox-jsreverser-mcp]
command = "node"
args = ["你本地路径/JSReverser-Firefox-MCP/build/src/index.js"]
```

### 7.3 LLM provider 配置

通过 `.env`（沿用原项目格式）配置 OpenAI / Anthropic / OpenAI 兼容 / 自部署 endpoint；未配置时 AI 类工具返回 `llm_not_configured`。

## 8. 后续版本（不在 v1 范围）

- **v1.1 候选**：WASM 整组 7 个工具（RDP source actor + 本地 wabt/binaryen）。
- **v1.2 候选**：用户级 profile 持久化与命名 profile 切换。
- **v1.3 候选**：性能基准与回归。
- **v2 候选**：Firefox BiDi 补齐 Debugger 后，把 `pauseController` 从 RDP 实现迁回 BiDi 实现，逐步退化 RDP 依赖。

## 9. 已锁定的设计决策

为避免后续摇摆，列出在 brainstorming 阶段已经拍板的决策：

1. **架构**：方案 A（Driver → Capability → Session → Tool 四层，capability 是 interface）。
2. **协议组合**：BiDi 主路 + RDP。
3. **transport**：手写 WebSocket + TCP，不用 Puppeteer / WebDriver client。
4. **语言**：TypeScript，Node 20+。
5. **生命周期**：MCP 主导启动为主，支持 attach 外部 Firefox。
6. **Stealth**：v1 必须；默认 `firefox-default` preset 在 Session.init 即开。
7. **emit 通道**：进程启动时随机生成 `__mcp_emit_<hex>`。
8. **`script.message` 路由**：中央 dispatcher，payload 必带 `channel`。
9. **断连恢复**：
   - **重放**：hook（preload + worker 注入）、断点、BiDi subscription registry、pref overrides（重连后对 PreferenceActor 全部重放）。
   - **保留**：脚本缓存、session 快照、网络请求池、WebSocket 帧、console 缓冲。
   - **失效**：RDP actor 树缓存（重连后所有 grip / actor id 都换，全部丢弃）、pause 上下文（无法恢复到原栈帧，工具层报 `pause_context_lost`）。
10. **错误**：枚举化 ErrorReason，统一 `ToolResult`，不静默吞错；不工具级重试。
11. **测试**：3 层（unit / integration / e2e）；unit ≥80% coverage；CI 跑两版 Firefox。
12. **v1 工具范围**：82 个，含 AI/AST 全组 + worker hook + worker ws + JS per-context 拨档（BiDi `emulation.setScriptingEnabled`）+ CSP per-context bypass（BiDi `browsingContext.setBypassCSP`）；**唯一不做：WASM 整组**。
