# js-reverse-firefox

Front-end JavaScript reverse-engineering MCP server for Firefox, backed by WebDriver BiDi
and the Firefox Remote Debugging Protocol (RDP).

It exposes 88 tools across page state, scripts, hooks, debugger, network, WebSocket,
console/runtime, DOM, storage/session, stealth, AST + AI, rebuild + evidence, workers,
and per-context preferences (`set_javascript_enabled` / `set_csp_enabled`).

## Architecture

```
driver → capability → session → tool
  │         │           │         │
  └ BiDi    └ ~22 caps  └ caches  └ MCP-exposed tools
  └ RDP                 └ dispatcher
  └ launcher
```

- **Drivers**: `BidiDriver` (WebSocket / id-paired), `RdpDriver` (length-prefixed JSON
  framing, actor FIFO), `FirefoxLauncher`.
- **Capabilities**: `scriptHost`, `preloadInjector`, `networkObserver`, `logSink`,
  `storageAccess`, `pageController`, `domAccess`, `hookRegistry`, `wsObserver`,
  `workerTopology`, `pauseController`, `objectInspector`, `eventMonitor`,
  `performanceProbe`, `initiatorTracer`, `runtimePrefs`, `stealth`, `astAnalyzer`,
  `cryptoSignatures`, `llmProvider`, `taskArtifacts`.
- **Session**: in-process singleton holding driver instances, capability instances,
  the script / request / hook / WebSocket / console / session-snapshot caches, the
  pause context, and session-scoped pref overrides.
- **Tools**: thin wrappers that read inputs, call one capability, return a
  `ToolResult` (`ok=true` + data, or `ok=false` + ErrorReason).

## Install

Requires Node.js 20+.

**Supported browser stack: Camoufox + geckodriver only.** Raw `firefox --remote-debugging-port` exposes CDP, not WebDriver BiDi, and is not supported. Camoufox provides C++-level anti-detection (navigator.webdriver=false, fingerprint patches) that the in-tree `firefox-default` preload payload layers on top of.

### macOS

1. **Camoufox.** Download the latest macOS `.dmg` from <https://github.com/daijro/camoufox/releases> and drag the bundle into `/Applications`. First launch: right-click the app → **Open** to bypass Gatekeeper.
2. **geckodriver.** `brew install geckodriver`.
   - Apple Silicon installs to `/opt/homebrew/bin/geckodriver`.
   - Intel installs to `/usr/local/bin/geckodriver` (matches the in-code default).
3. **Project.**

   ```bash
   npm install
   npm run build
   ```

Live integration / e2e suites require Camoufox and geckodriver to be present — they will throw, not self-skip, if the handshake fails. The unit suite (`npm test`) runs fine without either binary.

### Linux / Windows

Not regularly verified. Install Camoufox from the [Camoufox releases](https://github.com/daijro/camoufox/releases) and geckodriver from the [geckodriver releases](https://github.com/mozilla/geckodriver/releases), then point `CAMOUFOX_PATH` / `GECKODRIVER_PATH` (or `--camoufox-path` / `--geckodriver-path`) at the installed binaries.

### What `--stealth` controls

`--stealth=auto` (default) installs the `firefox-default` preload payload from `src/stealth-scripts/` during session init. `--stealth=off` skips the preload only — Camoufox's C++ stealth layer is always on regardless of this flag.

## Configure

Copy `.env.example` to `.env` and fill in what you need:

```bash
cp .env.example .env
```

| Variable | Used for |
|---|---|
| `LLM_PROVIDER` | `openai` / `anthropic` / `openai-compatible`. Blank disables LLM tools cleanly. |
| `LLM_API_KEY` | Bearer key for the selected provider. |
| `LLM_BASE_URL` | Required for `openai-compatible`; optional override for the others. |
| `LLM_DEFAULT_MODEL` | Optional default model id. |
| `CAMOUFOX_PATH` | Camoufox binary location. macOS default: `/Applications/Camoufox.app/Contents/MacOS/camoufox`. |
| `GECKODRIVER_PATH` | geckodriver binary location. Default: `/usr/local/bin/geckodriver`. Apple Silicon brew installs to `/opt/homebrew/bin/geckodriver` — override here. |

`understand_code`, `summarize_code` and `deobfuscate_code` (LLM post-processing) return `LlmNotConfigured` cleanly when no provider is configured — never throw — so the rest of the tool surface stays usable without an LLM key.

## Run

```bash
# Launch a fresh Firefox + MCP server over stdio
node build/src/index.js --stealth=auto

# Or attach to an already-running geckodriver session
node build/src/index.js --attach --bidi-url ws://... --rdp-port 6000
```

CLI flags:

| Flag | Meaning |
|---|---|
| `--attach` | Skip launching Camoufox; use `--bidi-url` + `--rdp-port`. |
| `--bidi-url <ws>` | WebDriver BiDi WebSocket URL (attach mode). |
| `--rdp-port <port>` | Firefox RDP TCP port. Required in attach mode; auto-allocated in launch mode. |
| `--camoufox-path <path>` | Override Camoufox binary (defaults to `CAMOUFOX_PATH` or the macOS path above). |
| `--geckodriver-path <path>` | Override geckodriver binary (defaults to `GECKODRIVER_PATH` or `/usr/local/bin/geckodriver`). |
| `--user-agent <ua>` | Override the leaky `Camoufox/<ver>` UA brand on the launched profile. |
| `--stealth <auto\|off>` | Apply the `firefox-default` preload on init (default `auto`). Does NOT control the always-on Camoufox C++ stealth. |

## Test layers

```bash
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest test/unit (fast, no browser)
npm run test:integration   # spec §5.2 — real BiDi/RDP via geckodriver
npm run test:e2e           # spec §5.3 — full MCP-over-stdio workflows (W1–W7)
```

Integration / e2e tests skip cleanly when Firefox or geckodriver is missing, so the
unit suite stays green on developer machines without a browser install.

CI runs all three layers across Firefox `latest` + `latest-esr` (see
`.github/workflows/ci.yml`).

## Project layout

```
src/
  drivers/{bidi,rdp,launcher}/   driver implementations
  capabilities/                  ~22 capability modules
  session/                       Session + caches + dispatcher
  server/                        MCP plumbing (tool-registry, error-translator)
  tools/                         all MCP-exposed tools, grouped by category
  stealth-scripts/               firefox-default stealth preload payloads
  ast/                           transforms/ and rules/ for astAnalyzer + cryptoSignatures
  llm/                           provider abstraction + LRU cache
  rebuild/                       bundle-builder, env-diff, evidence-writer
test/
  unit/                          Layer 1 — pure logic, ~140 files / ~480 tests
  integration/                   Layer 2 — driver + capability contracts vs real Firefox
  e2e/                           Layer 3 — W1–W7 workflow suites over stdio MCP
```

## License

ISC.
