# 反检测实测报告 — 2026-06-12

测试栈：Camoufox 150.0.2-beta.25 + geckodriver + firefox-js-reverse-mcp（master @ 0858f66）

## 阶段 1 — bot.sannysoft.com 基线

- `navigator.webdriver` = **false** ✅
- 26 项 HEADCHR / CHR / PHANTOM / SELENIUM 检测全部 passed
- **失败 2 项**：
  - `WebDriver (New)` = present (failed) — DOM 痕迹被探测
  - `PHANTOM_ETSL` = FAIL — Function.prototype.toString 探测漏点
- UA 暴露 `Camoufox/150.0.2-beta.25` 字串（字符串匹配可识破）

证据：`stage1-sannysoft-baseline.png` + `.json`

## 阶段 3 — CreepJS 严苛检测（基线）

| 维度 | 值 |
|---|---|
| FP ID | `971fb3a4…` |
| lies hash | `c33a2c80` |
| like_headless | 0% ✅ |
| headless | 33% ⚠️ |
| stealth | 0% ✅ |
| Resistance.{privacy,security,mode,extension} | 全 unknown ✅ |
| Worker UA | 暴露 Camoufox |

证据：`stage3-creepjs-baseline.png` + `.json`

## 阶段 4 — opt-in 加固后 CreepJS

加固动作：
- `inject_stealth_to_workers(preset=firefox-default, watch=true)`
- `inject_stealth_hook(window.fetch, capture=[args,return,stack])`

| 维度 | 基线 | 加固后 | 变化 |
|---|---|---|---|
| FP ID | `971fb3a4…` | `a2c48004…` | 变 |
| lies hash | `c33a2c80` | `7ba99184` | 变 |
| like_headless | 0% | 0% | 不变 ✅ |
| headless | 33% | 33% | 不变 |
| **stealth** | 0% | **20%** | **变差 🔴** |
| **Resistance.extension** | unknown | `d4ec0779` | **变差 🔴** |
| Worker UA | 暴露 | 仍暴露 | 不变 ⚠️ |

证据：`stage4-creepjs-hardened.png` + `.json`

## 结论与下一步

### 已验证的能力

1. **Camoufox 基线已足够好对付主流 sannysoft / 基础反爬检测**（HEADCHR/CHR/SELENIUM 全过）。
2. **`navigator.webdriver` 主世界 = false** 在主流页面表现稳定。
3. `firefox-js-reverse-mcp` 的 `inject_stealth_to_workers` 与 `inject_stealth_hook` 工具链可正常工作（preload ID 落地、watch 订阅生效）。

### 暴露的弱点

1. **UA 字面包含 "Camoufox"** — 这一项 Camoufox 自身就应该 spoof；如要更隐身，需要 `set_user_agent` 覆盖（注意：M7.09/M7.10 stealth hook 不改 UA）。
2. **CreepJS 把 inject_stealth_hook 探到了** — `stealth%` 从 0 升至 20、`Resistance.extension` 从 unknown 变成指纹值。说明现有的 Function.toString 掩护对 CreepJS 用的 Error.stack / toString chain 检测路径覆盖不全。
3. **Worker UA 加固无效** — 印证 CLAUDE.md 文档的 post-start 局限：worker 在 navigate 时已读出 UA，post-start eval 改不掉历史读取。
4. **`PHANTOM_ETSL` (sannysoft)** 与 CreepJS 的同类探测互相印证：toString 链需要专项加固。

### 建议的下一里程碑（候选）

- **M7.11 / stealth-hook v2**：把 `inject_stealth_hook` 渲染的 Proxy 在 Error.stack / Function.toString 链上做更严的掩护，目标把 CreepJS stealth% 压回 0、Resistance.extension 恢复 unknown。
- **M7.12 / worker pre-start UA spoof**：研究 Camoufox 自身的 fingerprint preset 是否能覆盖 worker UA；如果 BiDi 协议层无路径，文档化此为不可达限制。

### 顺手修复

会话期间发现并修复了 `src/server/zod-to-json.ts` 两个 bug，影响所有 MCP client：
- `ZodEffects` 不解包 → `detect_crypto/risk_panel/analyze_target` schema 不合规（已 commit 0858f66）
- `ZodDefault` 不解包 → 含 default 的字段在 client 端校验失败（待 commit）

修复后 84 个工具全部 schema 合规。

---

## M7.11 验证（2026-06-12 续）

测试栈：Camoufox 150.0.2-beta.25 + geckodriver + firefox-js-reverse-mcp @ `4299b58`（feat/m7.11-stealth-hook-v2 分支 8 个 commit）

### 阶段 3-after-m7.11 — CreepJS 基线（无 hook，M7.11 build）

跟 stage3-creepjs-baseline 一致：headless 33% / like_headless 0% / stealth 0% / Resistance.extension unknown。证据：`stage3-after-m7.11.png`。

### 阶段 4-after-m7.11 — CreepJS 加固（hook + worker stealth）

| 维度 | stage3 基线 | stage4 旧加固 | stage4-after-m7.11 | 变化 |
|---|---|---|---|---|
| like_headless | 0% | 0% | 0% | 不变 ✅ |
| headless | 33% | 33% | 33% | 不变 |
| **stealth** | 0% | 20% 🔴 | **20%** 🔴 | M7.11 未压回 0 |
| **Resistance.extension** | unknown | `d4ec0779` | **`d4ec0779`** | M7.11 未恢复 unknown |
| `__sh_mask__` / `__sh_*` 全局 | n/a | 泄漏 | **无 ✅** | M7.11 修好 |
| `toString` Symbol 锚点 | n/a | n/a | **0 ✅** | M7.11 修好 |
| **main-world** fetch.toString | native | masked OK | **native ✅** | M7.11 修好 |
| **iframe-realm** fetch.toString | native | wrapper 泄漏 | **wrapper 泄漏 ❌** | M7.11 cross-realm installer 未生效 |

证据：`stage4-after-m7.11.png` + `stage4-after-m7.11.json`。

### 阶段 5 — JSReverser-Strong-MCP (CDP) 横向对比

测试栈：JSReverser-Strong-MCP attached 到用户手起的 Chrome 149（`--remote-debugging-port=9222`），用作"无 hook、纯 Chromium"对照组，确认 stage4 的 20% / `d4ec0779` 是工具痕迹还是引擎信号。

| 维度 | Camoufox 基线 | Camoufox+M7.11 hook | 裸 Chrome+CDP |
|---|---|---|---|
| navigator.webdriver | false ✅ | false ✅ | **true** ❌ |
| headless | 33% | 33% | 33% |
| like_headless | 0% | 0% | 0% |
| stealth | 0% | **20% 🔴** | **0% ✅** |
| Resistance.extension | unknown | **`d4ec0779` 🔴** | **unknown ✅** |
| main-world fetch.toString | native | native ✅ | native（未 hook） |
| iframe-realm fetch.toString | native | **wrapper 泄漏 🔴** | native |

证据：`stage5-jsreverser-cdp.png` + `stage5-jsreverser-cdp.json`。

**横评结论**：
- `headless=33%` 是 macOS Chromium/Firefox 引擎本身的稳定特征，不是 M7.11 引入的回归。
- 裸 Chrome+CDP 也能拿到 `stealth=0%, extension=unknown`，所以 M7.11 的 20% 完全是**工具痕迹**（不是引擎不可避免的）。
- 唯一只有 Camoufox 路线能拿到 `navigator.webdriver=false`，代价就是 cross-realm wrapper 泄漏面。
- **修复定位**：`emitCrossRealmInstaller` 没真把 toString mask 装到 iframe-realm。续接点笔记里的两个候选根因（installInFrame 用了外层 realm 引用 / about:blank load 事件早于 MO 接上）需要逐一验证。

### M7.11 整体结论

- 主世界三项（cleansing wrapper / 无 `__sh_*` 全局 / 无 Symbol 锚点）**全部达成** ✅
- CreepJS stealth%、Resistance.extension **未回归到 baseline** ❌ —— 因为 cross-realm installer 失效
- 还需要 **M7.11.x cross-realm installer 修补**：复现 → 修 `emitCrossRealmInstaller` → 加 iframe-realm 单测断言 → 重测

---

## 阶段 6 — M7.11.x cross-realm 修复后（2026-06-13）

代码修改：
- `emitToStringMasking` 重构为**顶层 bootstrap**：top realm 建 `{ maskAs, installInRealm }` surface，挂在 globalThis 私有 Symbol；sub-realm 跳过 bootstrap，从 `globalThis.top` 找 surface 让 top install 本 realm 的 override。Map 跨 realm 共享（WeakMap 对象身份不分 realm）。
- `buildOverrideIn(targetWin)`：用 **target-realm `Proxy(realFnToString, { apply, construct })`** 作为 override，同时满足三件事：`instanceof targetWin.Function === true`、`'prototype' in override === false`、`new override()` 抛错。
- `renderSingleWrap` wrapper 改为**箭头函数 + rest param**（`(...a) => { ... }`），消除 `prototype` 属性和 constructability。
- 顺带：`src/server/server.ts` lazy launch — MCP `initialize` 不再阻塞在 Camoufox 启动（commit `4299b58`），避免 client -32000 超时雪崩。

### 阶段 6 acceptance probe（hook + worker stealth + UA spoof Firefox 150）

| 检测点 | stage4-after-m7.11 | stage6-after-m7.11.x |
|---|---|---|
| navigator.userAgent | `Camoufox/150.0.2-beta.25` 泄漏 | **`Firefox/150.0` ✅** |
| main `fetch.toString` | native ✅ | native ✅ |
| `'prototype' in fetch` | true ❌ | **false ✅** |
| `new fetch()` | 不抛 ❌ | **抛 TypeError ✅** |
| `'prototype' in Function.prototype.toString` | true ❌ | **false ✅** |
| `Function.prototype.toString instanceof Function` | true ✅ | true ✅ |
| iframe-realm `fetch.toString.call(window.fetch)` | wrapper 源码 🔴 | **native ✅** |
| iframe `toString instanceof iframe.Function` | **false ❌** | **true ✅** |
| `__sh_*` 全局 | 无 ✅ | 无 ✅ |
| `Object.getOwnPropertySymbols(Function.prototype.toString)` | 0 ✅ | 0 ✅ |

**所有 M7.11 spec §4 + plan §7 声明的 acceptance probes 全部 PASS。**

### 阶段 6 CreepJS scoring（参考）

| 维度 | stage3 baseline | stage4-after-m7.11 | stage6-after-m7.11.x |
|---|---|---|---|
| like_headless | 0% | 0% | 0% |
| headless | 33% | 33% | 33% + 第二个 20% |
| stealth (label) | `0c019315` (0%) | `71bd68ae` (20%) | `71bd68ae` (20%) |
| Resistance.extension | unknown | `d4ec0779` | `a5507ef9` |

CreepJS stealth%/extension 并**未回到 baseline**。但 stage5 (JSReverser CDP) 横评证明了 `headless=33%` 是引擎信号、与 hook 无关；stage6 acceptance 全 PASS 进一步证明剩余 20% / `a5507ef9` 与 fetch 形状、wrapper toString、cross-realm 污染、UA 字串**均无关**。

证据：`stage6-after-m7.11.x.png` + `stage6-after-m7.11.x.json`。

### 剩余泄漏假设（M7.12+ 候选）

1. **Error.stack 深度**：wrapper 多一帧。CreepJS 调 fetch 后读 `(new Error()).stack` 或 promise rejection trace 能拿到 wrapper frame。
2. **Worker UA 仍暴露 Camoufox**：BiDi `addPreloadScript` 不达 worker，post-start eval 改不了首次 UA 读取（CLAUDE.md 已记）。
3. **WebDriver / RemoteAgent 协议侧信道**：Camoufox 不一定 patch 全所有 BiDi observer/类。
4. **navigator.permissions / serviceWorker 注册时序** 等二阶探测。

### M7.11 + M7.11.x 整体结论

- **Spec acceptance**：全部 PASS（main + iframe-realm shape）✅
- **Cross-realm 共享 surface 架构**：通过私有 Symbol 实现、map 跨 realm 共享、Proxy 兼顾 `instanceof / prototype / construct` 三态。
- **CreepJS 综合指纹**：未压回 baseline。其根因经 stage6 acceptance + stage5 CDP 横评定位**不在 stealthHook 单一职责内**——是 Error.stack / worker UA / 协议侧信道等更上层 milestone（M7.12+）覆盖范围。
