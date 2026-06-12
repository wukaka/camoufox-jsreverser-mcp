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
