# etax.chinatax.gov.cn 风控 Cookie 分析 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分析 `https://www.etax.chinatax.gov.cn` 未登录首页的风控/反爬 cookie，输出包含调用链与算法摘要的 Markdown 分析报告。

**Architecture:** 四阶段流水线：Observe（建立 cookie 地图）→ Capture（hook 捕获写入栈帧）→ Analyze（定位生成函数、LLM 分析）→ Report（汇总输出）。Storage 快照与 document.cookie hook 双路验证，互相补充。

**Tech Stack:** camoufox-jsreverser-mcp MCP 工具集（check_browser_health / inject_stealth / navigate_page / get_storage / list_network_requests / list_scripts / inject_preload_script / evaluate_script / get_script_source / find_in_script / search_in_scripts / understand_code / summarize_code / detect_crypto / record_reverse_evidence / export_session_report）

---

## Task 1: 环境健康检查与反检测初始化

**目标：** 确认浏览器在线，注入反检测 preset，为后续分析准备干净环境。

**Files:**
- 产出：无文件变更（MCP 工具调用，结果在 session 中）

- [ ] **Step 1: 检查浏览器健康状态**

调用工具：`check_browser_health`
参数：无

预期结果：返回 `{ ok: true, ... }`，确认 Camoufox + geckodriver 在线。
如果失败：检查 `node build/src/index.js --stealth=auto` 是否已启动，Apple Silicon 用户需确认 `--geckodriver-path /opt/homebrew/bin/geckodriver`。

- [ ] **Step 2: 注入 firefox-default 反检测 preset**

调用工具：`inject_stealth`
参数：
```json
{ "preset": "firefox-default" }
```

预期结果：返回 `{ ok: true }`，stealth preload 脚本已注册。

- [ ] **Step 3: 确认当前页面列表**

调用工具：`list_pages`
参数：无

记录当前 pageId，供后续 `navigate_page` 使用。

---

## Task 2: Observe 阶段 — 首次导航与 Cookie 地图建立

**目标：** 导航到目标页，抓取全量 cookie 快照，列出网络请求和脚本列表。

**Files:**
- 产出：无文件变更（数据在 session 缓存中）

- [ ] **Step 1: 导航到目标页**

调用工具：`navigate_page`
参数：
```json
{ "url": "https://www.etax.chinatax.gov.cn", "waitUntil": "networkidle" }
```

预期结果：返回 `{ ok: true }`，页面加载完成。

- [ ] **Step 2: 截图留存初始页面状态**

调用工具：`take_screenshot`
参数：无

预期结果：返回截图数据，确认页面正常渲染（非 403/CAPTCHA）。
若页面显示 CAPTCHA 或拦截：尝试等待 3 秒后重试，或检查 stealth 是否已注入。

- [ ] **Step 3: 抓取全量 Cookie 快照**

调用工具：`get_storage`
参数：
```json
{ "type": "cookies" }
```

预期结果：返回 cookie 数组，每条包含 `name / value / domain / path / httpOnly / secure / sameSite / expires`。

**记录以下信息（供后续对比）：**
- 所有 cookie 的 name 列表
- httpOnly=true 的 cookie（服务端设置，不可 JS 读取）
- httpOnly=false 的 cookie（候选 JS 动态写入）

- [ ] **Step 4: 列出全量网络请求**

调用工具：`list_network_requests`
参数：
```json
{ "limit": 100 }
```

关注点：
- 请求头中携带了哪些 cookie（`cookie:` 头）
- 响应头中有哪些 `Set-Cookie`（服务端写入 cookie 的来源请求）
- 有无 JS 类型的动态加载请求（`Content-Type: application/javascript`）

- [ ] **Step 5: 列出已加载 JS 脚本**

调用工具：`list_scripts`
参数：无

关注点：
- 过滤出非 CDN 的第一方脚本（域名包含 `chinatax.gov.cn` 或 `etax`）
- 记录所有脚本的 scriptId + url，供 Capture 阶段定位调用栈使用

- [ ] **Step 6: 阶段门禁自检**

在进入 Task 3 之前，确认能回答以下问题：
1. 页面设置了哪些 cookie？（name 列表）
2. 哪些是 httpOnly（服务端）？哪些是 JS 可写（候选风控）？
3. 有哪些第一方 JS 脚本被加载？

---

## Task 3: Capture 阶段 — 注入 document.cookie Hook 并重放导航

**目标：** 通过 preload hook 捕获所有 JS cookie 写入操作的调用栈和时序。

**Files:**
- 产出：无文件变更（hook 数据在 `window.__cookieLog` 中）

- [ ] **Step 1: 检查目标页面的 CSP 策略**

调用工具：`get_network_request`
参数：选取 Task 2 Step 4 中主页面请求的 requestId
```json
{ "requestId": "<主页面 requestId>" }
```

查看响应头中是否存在 `content-security-policy`。
- 若存在且包含 `script-src` 限制：执行 Step 1b
- 若无 CSP 或 CSP 宽松：直接进入 Step 2

- [ ] **Step 1b（仅 CSP 严格时执行）: 禁用 CSP**

调用工具：`set_csp_enabled`
参数：
```json
{ "enabled": false }
```

预期结果：返回 `{ ok: true }`，后续请求不再强制 CSP。

- [ ] **Step 2: 注入 document.cookie setter hook 为 preload 脚本**

调用工具：`inject_preload_script`
参数：
```json
{
  "script": "(function() { window.__cookieLog = []; var orig = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'); if (!orig) { orig = Object.getOwnPropertyDescriptor(document, 'cookie'); } Object.defineProperty(document, 'cookie', { configurable: true, set: function(val) { window.__cookieLog.push({ value: val, stack: new Error().stack, ts: Date.now() }); orig.set.call(document, val); }, get: orig.get }); })()"
}
```

预期结果：返回 `{ ok: true, preloadId: "<id>" }`，preload 脚本已注册。

- [ ] **Step 3: 重新导航页面（让 preload hook 在页面初始化阶段生效）**

调用工具：`navigate_page`
参数：
```json
{ "url": "https://www.etax.chinatax.gov.cn", "waitUntil": "networkidle" }
```

预期结果：返回 `{ ok: true }`。

- [ ] **Step 4: 读取 cookie hook 捕获记录**

调用工具：`evaluate_script`
参数：
```json
{ "expression": "JSON.stringify(window.__cookieLog || [])" }
```

预期结果：返回 JSON 字符串，包含 0 条或多条 `{ value, stack, ts }` 记录。

**解析结果：**
- 每条记录的 `value` 格式为 `"name=xxx; path=/; ..."` — 提取 cookie name
- 每条记录的 `stack` 包含调用栈帧 — 提取脚本 URL + 行号
- `ts` 为 Unix 毫秒时间戳 — 记录写入时序

- [ ] **Step 5: 再次抓取 Cookie 快照做对比**

调用工具：`get_storage`
参数：
```json
{ "type": "cookies" }
```

对比 Task 2 Step 3 的快照：
- 新增的 cookie = 页面加载过程中动态设置的
- 在 `__cookieLog` 中有记录的 = JS 写入（候选风控 cookie）
- 不在 `__cookieLog` 中 + httpOnly = 服务端 Set-Cookie

- [ ] **Step 6: 整理候选风控 cookie 清单**

根据 Step 4 和 Step 5 的对比，整理一张表：

| Cookie Name | 写入时间(ms) | 来源脚本 URL | 行号 | 是否 httpOnly |
|------------|------------|------------|-----|-------------|
| （填入实际数据） | | | | |

进入 Task 4 前，此表必须完整。

---

## Task 4: Analyze 阶段 — 定位生成函数并分析算法

**目标：** 对每个候选风控 cookie，定位其生成函数并通过 LLM 理解算法逻辑。

> 本 Task 对每个候选风控 cookie **重复执行**以下所有步骤。

**Files:**
- 产出：无文件变更（分析结果待 Task 5 写入报告）

- [ ] **Step 1: 获取来源脚本源码**

从 Task 3 Step 6 的清单中取第一个候选 cookie 的来源脚本 URL 和 scriptId。

调用工具：`get_script_source`
参数：
```json
{ "scriptId": "<来源脚本 scriptId>" }
```

预期结果：返回完整 JS 源码字符串。

- [ ] **Step 2: 定位 cookie 写入函数边界**

调用工具：`find_in_script`
参数：
```json
{
  "scriptId": "<来源脚本 scriptId>",
  "query": "document.cookie",
  "contextLines": 20
}
```

预期结果：返回包含 `document.cookie` 赋值的代码片段（含前后 20 行上下文）。

若找不到（脚本动态加载）：改用 `search_in_scripts`：
```json
{ "query": "document.cookie", "contextLines": 10 }
```

- [ ] **Step 3: 检测是否使用标准加密原语**

调用工具：`detect_crypto`
参数：
```json
{ "scriptId": "<来源脚本 scriptId>" }
```

预期结果：返回检测到的加密算法列表（如 MD5、SHA-1、AES、RC4 等）。
若返回空列表：说明无标准加密，可能使用自定义混淆。

- [ ] **Step 4: LLM 分析 cookie 生成函数**

调用工具：`understand_code`
参数：
```json
{
  "scriptId": "<来源脚本 scriptId>",
  "question": "这段代码中 document.cookie 赋值语句的完整生成逻辑是什么？输入参数来自哪里（时间戳/随机数/DOM属性/Canvas指纹等）？是否有加密或哈希操作？cookie 的格式和组成部分是什么？是否有刷新或过期逻辑？"
}
```

若返回 `LlmNotConfigured`：改用 `summarize_code`：
```json
{
  "scriptId": "<来源脚本 scriptId>",
  "focus": "document.cookie assignment logic, input sources, crypto operations"
}
```

- [ ] **Step 5: 若代码高度混淆，执行去混淆**

判断标准：Step 2 的代码片段中变量名全为单字母或乱码字符串，或存在 `eval` / `Function` 构造。

若需要去混淆：
调用工具：`deobfuscate_code`
参数：
```json
{ "scriptId": "<来源脚本 scriptId>" }
```

之后用去混淆后的代码重新执行 Step 4。

- [ ] **Step 6: 记录单个 cookie 的分析结论**

整理以下信息（暂存于对话上下文，Task 5 写入报告）：

```
Cookie Name: <name>
写入时机: <DOMContentLoaded 前/后？首次 XHR 后？>
来源脚本: <URL>
函数位置: <行号范围>
调用链: <函数名1> → <函数名2> → document.cookie
输入来源: <时间戳 / Math.random() / navigator.userAgent / Canvas / 其他>
加密操作: <无 / MD5 / SHA-1 / AES / 自定义>
混淆程度: <低 / 中 / 高>
算法摘要: <2-3 句描述生成过程>
关键代码片段:
```<js>
<粘贴核心代码片段>
```
```

- [ ] **Step 7: 对下一个候选风控 cookie 重复 Step 1-6**

重复执行，直到 Task 3 Step 6 清单中所有候选 cookie 均已分析完毕。

---

## Task 5: Report 阶段 — 写入证据并导出报告

**目标：** 汇总所有分析结论，生成结构化 Markdown 报告。

**Files:**
- 产出：`artifacts/tasks/<task-id>/report.md`（由 `export_session_report` 生成）

- [ ] **Step 1: 记录每个风控 cookie 的逆向证据**

对每个已分析的候选风控 cookie，调用：

调用工具：`record_reverse_evidence`
参数（对每个 cookie 分别调用一次）：
```json
{
  "type": "cookie-analysis",
  "title": "<Cookie Name> 生成逻辑",
  "content": {
    "cookieName": "<name>",
    "writeTiming": "<DOMContentLoaded 前/后>",
    "sourceScript": "<脚本 URL>",
    "functionLocation": "<行号范围>",
    "callChain": "<调用链描述>",
    "inputSources": ["<time>", "<random>", "<navigator.userAgent>"],
    "cryptoOps": "<无/MD5/SHA-1 等>",
    "obfuscationLevel": "<低/中/高>",
    "algorithmSummary": "<算法摘要>",
    "codeSnippet": "<关键代码片段>"
  }
}
```

- [ ] **Step 2: 记录服务端 Cookie 清单**

调用工具：`record_reverse_evidence`
参数：
```json
{
  "type": "server-cookies",
  "title": "服务端 Set-Cookie 清单",
  "content": {
    "cookies": ["<httpOnly cookie name 列表>"],
    "note": "这些 cookie 由服务端通过 Set-Cookie 响应头设置，httpOnly=true，无法通过 JS 读取，不进行深入分析"
  }
}
```

- [ ] **Step 3: 导出完整分析报告**

调用工具：`export_session_report`
参数：
```json
{
  "format": "markdown",
  "includeScreenshots": true,
  "includeNetworkRequests": true,
  "includeScripts": true
}
```

预期结果：返回报告文件路径 `artifacts/tasks/<task-id>/report.md`。

- [ ] **Step 4: 验证报告内容完整性**

确认报告包含以下章节：
- [ ] 概览（总 cookie 数、风控候选数、服务端 cookie 数）
- [ ] 每个风控 cookie 的独立章节（写入时机、调用链、算法摘要、混淆评级、代码片段）
- [ ] 服务端 cookie 备案清单
- [ ] 附录（网络请求列表、脚本列表、截图）

若缺少章节：用 `record_reverse_evidence` 补充缺失内容后重新导出。

---

## 应急处理清单

| 问题 | 处理方式 |
|------|---------|
| `check_browser_health` 返回 `ok: false` | 检查 MCP 服务器是否启动：`node build/src/index.js --stealth=auto` |
| 页面显示 CAPTCHA | 等待 5 秒后重试 `navigate_page`，或检查 `inject_stealth` 是否成功 |
| `window.__cookieLog` 为空数组 | 检查 preload 脚本是否在导航前注入；确认 `Document.prototype` 上确实有 cookie descriptor |
| CSP 阻止 preload hook | 调用 `set_csp_enabled({ enabled: false })` 后重新注入并重新导航 |
| `understand_code` 返回 `LlmNotConfigured` | 改用 `summarize_code`，或在 `.env` 中设置 `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` |
| 风控脚本动态加载，`find_in_script` 找不到 | 用 `list_network_requests` 找 JS 类型响应，用 `get_script_source` 按 URL 获取 |
| 代码高度混淆，LLM 无法理解 | 先调用 `deobfuscate_code` 再分析 |
