# camoufox-jsreverser-mcp

面向 Firefox 的前端 JavaScript 逆向工程 MCP 服务器，底层走 WebDriver BiDi 与 Firefox Remote Debugging Protocol (RDP)。

对外暴露约 88 个 MCP 工具，覆盖：

- 页面状态、Frame、导航、截图
- 脚本：列出 / 取源码 / 跨脚本搜索 / 单脚本检索
- 调试器：行/列断点与文本断点、暂停 / 恢复 / 步入步过步出、callframe 求值、对象 inspect
- Hook：函数 hook、trace、采样通道、任意 preload 注入
- 网络与 WebSocket：请求池、initiator 调用栈、帧捕获、XHR 断点
- DOM：query / 结构 / 点击 / 输入 / 等待元素
- Storage 以及会话级 save / load / dump / restore
- Stealth：`firefox-default` preset、跨 realm 的 `inject_stealth_hook`、worker 推送
- AST 与 LLM：反混淆、摘要、理解、加密规则识别
- Rebuild + 证据链：bundle 构建、环境差异、证据写入、报告导出
- Worker、per-context preference（`set_javascript_enabled` / `set_csp_enabled`）

## 为什么是 Camoufox（而不是原版 Firefox）

工具集中大约 80%（调试器 / 脚本 / DOM / 网络 / Hook / AST / LLM）**与浏览器二进制无关**——它走 WebDriver BiDi 和 Firefox RDP，这两个协议原版 Firefox 150 同样支持。那为什么仍要绑定 Camoufox？因为剩下的 20%——反检测面——需要**C++ 层面的二进制补丁，任何 preload 脚本都无法等价实现**。

差异分布如下：

| 能力 | 实现位置 | 原版 Firefox | Camoufox |
|---|---|---|---|
| 调试器 / 脚本 / DOM / 网络 / Hook / AST / LLM 工具 | BiDi + RDP 的 TypeScript | ✅ 可用 | ✅ 可用 |
| `inject_stealth_hook` 跨 realm 的 Function.prototype.toString 伪装 | TypeScript preload | ✅ 可用 | ✅ 可用 |
| `navigator.webdriver === false` | C++ 二进制补丁 | ❌ 锁死为 `true`（getter 不可配置） | ✅ 已 patch |
| `navigator.plugins` / `mimeTypes` 真实形状 | C++ 注入 | ❌ 空或过短 | ✅ 真实 |
| WebGL vendor / renderer 伪装 | C++ 覆盖 | ❌ 泄露真实 GPU 或 `"Mozilla"` | ✅ 伪装 |
| Canvas 2D / AudioContext 像素与采样级噪声 | C++ 注入 | ❌ 指纹稳定可识别 | ✅ 加噪 |
| 字体枚举伪装 | C++ 字体表替换 | ❌ 真实安装字体 | ✅ 伪装 |
| WebDriver 协议侧信道（RemoteAgent 类、Marionette 残留） | C++ 删除 | ❌ 可被探测 | ✅ 清理 |
| `Camoufox/<ver>` UA 品牌泄漏 | 字符串问题 | n/a | 可用 `set_user_agent` 修改 |

结论：**在原版 Firefox 上，仅 `navigator.webdriver === true` 这一条，就足以让 CreepJS / sannysoft / 商业反爬评分系统直接判定为机器人**，根本走不到我们 preload 那一层。TypeScript 层的 `Object.defineProperty(navigator, 'webdriver', ...)` 只能影响主 realm，覆盖不到 worker、iframe、特权页；何况 Firefox 150 上 `webdriver` 属性描述符是锁死的，重定义会抛错。用 `Proxy` 包 `navigator` 也会被 `navigator === window.navigator.constructor.prototype.constructor` 这类比较探测到。

我们的 `inject_stealth_hook` 已经把 Hook 表面清理干净（Function.toString 伪装、跨 realm 探针、零全局变量——证据见 `stealth-evidence/SUMMARY.md` stage 6），但它**有意止步于 Hook 边界**。引擎级信号（`navigator.webdriver`、Canvas 噪声、GPU 字符串）按设计不在其能力范围内。

## 安装

需要 Node.js 20+。

**支持的浏览器组合：Camoufox + geckodriver，且仅此一种。** 原版 `firefox --remote-debugging-port` 暴露的是 CDP，不是 WebDriver BiDi，本项目不支持；并且 stealth 那半工具链也只对 Camoufox 生效（详见 [为什么是 Camoufox](#为什么是-camoufox而不是原版-firefox)）。

### macOS

1. **Camoufox**：从 <https://github.com/daijro/camoufox/releases> 下载最新 macOS `.dmg`，拖入 `/Applications`。首次运行右键 → **打开** 绕过 Gatekeeper。
2. **geckodriver**：`brew install geckodriver`。
   - Apple Silicon 装到 `/opt/homebrew/bin/geckodriver`。
   - Intel 装到 `/usr/local/bin/geckodriver`（与代码默认值一致）。
3. **项目本体**：

   ```bash
   npm install
   npm run build
   ```

集成 / e2e 套件需要 Camoufox 与 geckodriver 实际可用——握手失败会直接抛错，不会自动 skip。单元测试（`npm test`）不依赖任何浏览器二进制。

### Linux / Windows

未做常规验证。从 [Camoufox releases](https://github.com/daijro/camoufox/releases) 与 [geckodriver releases](https://github.com/mozilla/geckodriver/releases) 自行安装，再通过 `CAMOUFOX_PATH` / `GECKODRIVER_PATH`（或 `--camoufox-path` / `--geckodriver-path`）指向二进制路径即可。

### `--stealth` 到底控制什么

`--stealth=auto`（默认）会在会话初始化时把 `src/stealth-scripts/` 下的 `firefox-default` preload 注入进去。`--stealth=off` 仅跳过这一层 preload —— Camoufox 的 C++ stealth 始终生效，与这个开关无关。

## 在 MCP 客户端中注册

本服务的预期使用方式是被 AI agent 驱动（Claude Code、Claude Desktop、Cursor 等）。从 shell 单独跑它**不是真实的逆向工作流**，唯一合理的场景是验证安装是否成功（见下方 [冒烟测试](#冒烟测试安装)）。

### Claude Code (CLI)

```bash
# 在仓库目录下执行，确保 build 路径解析正确
claude mcp add camoufox-jsreverser \
  --env LLM_PROVIDER=openai \
  --env LLM_API_KEY=sk-... \
  --env GECKODRIVER_PATH=/opt/homebrew/bin/geckodriver \
  -- node "$(pwd)/build/src/index.js" --stealth=auto
```

或者直接编辑 `~/.claude.json`：

```jsonc
{
  "mcpServers": {
    "camoufox-jsreverser": {
      "command": "node",
      "args": [
        "/绝对路径/camoufox-jsreverser-mcp/build/src/index.js",
        "--stealth=auto"
      ],
      "env": {
        "LLM_PROVIDER": "openai",
        "LLM_API_KEY": "sk-...",
        "GECKODRIVER_PATH": "/opt/homebrew/bin/geckodriver"
      }
    }
  }
}
```

`env` 块就是 agent 需要的全部配置。可用变量：

| 变量 | 用途 |
|---|---|
| `LLM_PROVIDER` | `openai` / `anthropic` / `openai-compatible`。留空则 LLM 工具优雅禁用。 |
| `LLM_API_KEY` | 所选 provider 的 Bearer key。 |
| `LLM_BASE_URL` | `openai-compatible` 必填；其他 provider 可选覆盖。 |
| `LLM_DEFAULT_MODEL` | 可选的默认 model id。 |
| `CAMOUFOX_PATH` | Camoufox 二进制路径。macOS 默认：`/Applications/Camoufox.app/Contents/MacOS/camoufox`。 |
| `GECKODRIVER_PATH` | geckodriver 二进制路径。默认 `/usr/local/bin/geckodriver`。Apple Silicon brew 装在 `/opt/homebrew/bin/geckodriver`，请在此覆盖。 |

`understand_code`、`summarize_code`、`deobfuscate_code` 这三个 LLM 后处理工具在未配置 provider 时会干净地返回 `LlmNotConfigured`——绝不会抛——所以即便没配 LLM key，其余工具面依然完全可用。

### CLI flag

这些 flag 由 MCP 客户端通过 `args` 透传。常用的有：

| Flag | 含义 |
|---|---|
| `--stealth <auto\|off>` | 初始化时是否注入 `firefox-default` preload（默认 `auto`）。**不影响**始终开启的 Camoufox C++ stealth。 |
| `--user-agent <ua>` | 覆盖会被识别的 `Camoufox/<ver>` UA 品牌字符串。 |
| `--camoufox-path <path>` | 覆盖 Camoufox 二进制（优先级高于 `CAMOUFOX_PATH` 与默认路径）。 |
| `--geckodriver-path <path>` | 覆盖 geckodriver 二进制（优先级同上）。 |
| `--attach`, `--bidi-url <ws>`, `--rdp-port <port>` | 不启动新进程，而是连接已运行的 geckodriver 会话。仅开发/调试用。 |

## 冒烟测试安装

要确认服务能起、MCP 客户端能与之握手，本地手动跑一次：

```bash
node build/src/index.js --stealth=auto
```

它会通过 stdio 讲 MCP 协议。**成功启动没有任何 banner——静默就是对的**。按 Ctrl-C 退出。这种 shell 直跑模式下的本地 env 覆盖，可以放在仓库根目录的 `.env` 文件里（`cp .env.example .env`）；优先级为：MCP 客户端 `env` > `.env` > 系统环境。日常配置请始终放在客户端那边。

## Stealth 工具

| 工具 | 用途 |
|---|---|
| `inject_stealth` | 通过 BiDi preload 应用 stealth preset（默认 `firefox-default`）。仅主 realm。 |
| `inject_stealth_to_workers` | 把 preset 推送到 dedicated / shared worker realm（worker 序章已运行后再注入）。`watch:true` 会持续监听后续新建 worker，到会话结束为止。 |
| `inject_stealth_hook` | 用 Function.toString 伪装 + 通道采样的 Proxy 包装某个全局点路径（如 `window.fetch`）。可选 `neutraliseTiming` 让 `performance.now` / `Date.now` 单调推进以掩盖断点停顿。 |
| `inject_preload_script` | 直接注入任意 preload JS——上面三个都套不上时的逃生口。 |
| `list_stealth_presets` / `list_stealth_features` | 反查 capability 已知的所有 preset / feature。 |
| `set_user_agent` | 通过 BiDi emulation 覆盖 `Camoufox/<ver>` UA 品牌字符串。 |

## 测试分层

```bash
npm run lint               # eslint
npm run typecheck          # tsc --noEmit
npm test                   # vitest test/unit（快，不需要浏览器）
npm run test:integration   # 真 BiDi/RDP，经 geckodriver
npm run test:e2e           # 完整 MCP-over-stdio 工作流（W1–W7）
```

集成 / e2e 在缺少 Firefox 或 geckodriver 时会干净 skip，因此开发者机器上没装浏览器也不会污染单元测试结果。

CI 在 Firefox `latest` + `latest-esr` 两条线上各跑一遍三层（见 `.github/workflows/ci.yml`）。

## License

ISC。
