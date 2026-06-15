# etax.chinatax.gov.cn 风控 Cookie 分析设计

**日期：** 2026-06-15
**目标：** `https://www.etax.chinatax.gov.cn`（未登录首页）
**核心目的：** 识别风控/反爬 cookie，记录生成逻辑
**交付物：** Markdown 分析报告（不需要可运行代码）

---

## 一、整体架构

分析流程分为 4 个阶段，严格顺序执行：

```
Observe → Capture → Analyze → Report
```

| 阶段 | 核心动作 | 产出 |
|------|---------|------|
| **Observe** | 导航页面、抓快照、列网络请求 | cookie 地图 + 脚本列表 |
| **Capture** | 注入 `document.cookie` hook、重放导航 | 每条 cookie 的写入栈帧 + 写入时序 |
| **Analyze** | 定位生成函数、LLM 理解代码 | 每个风控 cookie 的算法摘要 |
| **Report** | `record_reverse_evidence` + `export_session_report` | Markdown 报告 |

**工具策略：** Storage 快照 + document.cookie hook 双路验证。先观察后深挖，侵入性适中。

---

## 二、Observe 阶段

**目标：** 建立 cookie 地图，确认哪些是 JS 动态写入的候选风控 cookie。

**步骤：**

1. `check_browser_health` — 确认 Camoufox 在线
2. `inject_stealth` (preset: firefox-default) — 注入反检测 preset，降低被屏蔽概率
3. `navigate_page` → `https://www.etax.chinatax.gov.cn`
4. `get_storage` (cookies) — 抓取首次落地后的所有 cookie，记录：name / value / domain / httpOnly / secure / path
5. `list_network_requests` — 列出全量请求，标注哪些请求头携带了 cookie
6. `list_scripts` — 列出已加载的所有 JS 文件，优先关注非 CDN 的第一方脚本
7. `take_screenshot` — 记录页面状态留存证据

**阶段门禁：** 能回答"有哪些 cookie、来自哪个域、是否 httpOnly"后，方可进入下一阶段。

---

## 三、Capture 阶段

**目标：** 精确捕获每条 JS 写入 cookie 的调用栈、时序和值。

**步骤：**

1. `inject_preload_script` — 注入 `document.cookie` setter hook（IIFE 形式），捕获以下信息并推送到 `window.__cookieLog`：
   - `value`：完整 cookie 字符串
   - `stack`：`new Error().stack` 调用栈
   - `ts`：`Date.now()` 写入时间戳

   ```js
   // preload hook 伪代码
   (function() {
     window.__cookieLog = [];
     const orig = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
     Object.defineProperty(document, 'cookie', {
       set(val) {
         window.__cookieLog.push({ value: val, stack: new Error().stack, ts: Date.now() });
         orig.set.call(document, val);
       },
       get: orig.get
     });
   })();
   ```

2. `navigate_page` — 重新导航，让 preload hook 在页面初始化阶段生效
3. `evaluate_script` → `JSON.stringify(window.__cookieLog)` — 读取所有捕获记录
4. 对比 Observe 阶段的 cookie 列表：
   - **有栈帧** = JS 动态设置（候选风控 cookie，重点分析）
   - **无栈帧 + httpOnly** = 服务端 Set-Cookie（记录备案，不深入）

**阶段门禁：** 每条 JS 写入的 cookie 都有对应的调用栈帧后，方可进入下一阶段。

---

## 四、Analyze 阶段

**目标：** 理解每个候选风控 cookie 的生成算法。

**对每个候选风控 cookie 执行以下步骤：**

1. 从调用栈提取脚本 URL + 行号
2. `get_script_source` — 获取完整源码
3. `find_in_script` / `search_in_scripts` — 定位 cookie 写入函数的边界
4. `understand_code` / `summarize_code` — LLM 分析，重点回答：
   - 输入参数来源（时间戳？随机数？DOM 属性？）
   - 是否使用 Canvas / WebGL / 音频指纹
   - 是否有加密/哈希操作（MD5、SHA、AES 等）
   - 代码是否有混淆（字符串乱序、控制流平坦化等）
   - cookie 的刷新/过期机制
5. `detect_crypto` — 检测是否使用标准加密原语

**分析结果记录到：** `artifacts/tasks/<task-id>/runtime-evidence.jsonl`

---

## 五、Report 阶段

**目标：** 汇总所有发现，输出可读的 Markdown 分析报告。

**步骤：**

1. `record_reverse_evidence` — 为每条风控 cookie 写入结构化证据条目
2. `export_session_report` — 导出完整报告到 `artifacts/tasks/<task-id>/report.md`

**报告结构：**

```
# etax.chinatax.gov.cn 风控 Cookie 分析报告

## 概览
- 总 cookie 数
- JS 动态写入 cookie 数（风控候选）
- 服务端 Set-Cookie 数
- 分析结论摘要

## 风控 Cookie 详情

### [Cookie Name 1]
- 写入时机（DOMContentLoaded 前/后？XHR 触发？）
- 调用链（脚本 URL → 函数名 → 行号）
- 算法描述（输入 → 处理 → 输出）
- 混淆难度评级（低/中/高）
- 关键代码片段

### [Cookie Name N]
...

## 附录
- 原始网络请求列表
- 已加载脚本列表
- 截图
```

---

## 六、工具清单

| 阶段 | 工具 |
|------|------|
| Observe | `check_browser_health`, `inject_stealth`, `navigate_page`, `get_storage`, `list_network_requests`, `list_scripts`, `take_screenshot` |
| Capture | `inject_preload_script`, `navigate_page`, `evaluate_script`, `get_storage` |
| Analyze | `get_script_source`, `find_in_script`, `search_in_scripts`, `understand_code`, `summarize_code`, `detect_crypto` |
| Report | `record_reverse_evidence`, `export_session_report` |

---

## 七、风险与注意事项

- **CSP 限制**：目标站点可能有 Content-Security-Policy，preload hook 注入前先检查 CSP 头，必要时用 `set_csp_enabled(false)` 临时禁用
- **动态加载脚本**：部分风控脚本可能通过 XHR 动态加载，需要在 `list_network_requests` 中关注 JS 类型响应
- **混淆代码**：若源码高度混淆，`deobfuscate_code` 工具可辅助 AST 去混淆后再 LLM 分析
- **无 LLM Key**：若未配置 OpenAI/Anthropic key，`understand_code` 返回 `LlmNotConfigured`，需改用 `summarize_code` 或手动分析
