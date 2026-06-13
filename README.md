# camoufox-jsreverser-mcp

Front-end JavaScript reverse-engineering MCP server for Firefox, backed by WebDriver BiDi
and the Firefox Remote Debugging Protocol (RDP).

It exposes ~88 MCP tools covering:

- Page state, frames, navigation, screenshots
- Scripts: list / get source / search / find-in-script
- Debugger: breakpoints (text + line/col), pause / resume / step, callframe evaluate, object inspect
- Hooks: function hook, trace, sample channel, inject arbitrary preload
- Network + WebSocket: request pool, initiator stack, frame capture, XHR break
- DOM: query / structure / click / type / wait
- Storage + per-session save/load/dump/restore
- Stealth: `firefox-default` preset + cross-realm `inject_stealth_hook` + worker push
- AST + LLM: deobfuscate, summarize, understand, crypto-rule detection
- Rebuild + evidence: bundle builder, env diff, evidence writer, report export
- Workers, prefs (`set_javascript_enabled` / `set_csp_enabled`)

## Why Camoufox (and not raw Firefox)

Roughly 80% of the toolset — debugger / scripts / DOM / network / hooks / AST / LLM — is **browser-binary agnostic**. It talks WebDriver BiDi and the Firefox Remote Debugging Protocol, both of which raw Firefox 150 also speaks. So why pin to Camoufox? Because the remaining 20% — the anti-detection surface — needs **C++-level patches that no preload script can recreate**.

The split looks like this:

| Layer | Where it lives | Raw Firefox | Camoufox |
|---|---|---|---|
| Debugger / scripts / DOM / network / hooks / AST / LLM tools | TypeScript over BiDi + RDP | ✅ works | ✅ works |
| `inject_stealth_hook` cross-realm Function.prototype.toString masking | TypeScript preload | ✅ works | ✅ works |
| `navigator.webdriver === false` | C++ binary patch | ❌ stuck `true` (the getter is non-configurable) | ✅ patched |
| `navigator.plugins` / `mimeTypes` realistic shape | C++ injection | ❌ empty / short | ✅ realistic |
| WebGL vendor / renderer spoof | C++ override | ❌ leaks real GPU or `"Mozilla"` | ✅ spoofed |
| Canvas 2D / AudioContext per-pixel / per-sample noise | C++ injection | ❌ stable fingerprint | ✅ noised |
| Font enumeration spoof | C++ table swap | ❌ real installed fonts | ✅ spoofed |
| WebDriver-protocol side-channels (RemoteAgent class, Marionette artefacts) | C++ removal | ❌ present and probeable | ✅ scrubbed |
| `Camoufox/<ver>` UA brand leak | string concern | n/a | spoofable via `set_user_agent` |

Result: **on raw Firefox, `navigator.webdriver === true` alone disqualifies the session against CreepJS / sannysoft / commercial anti-bot scoring** before any of our preload work even runs. A TypeScript preload can `Object.defineProperty(navigator, 'webdriver', ...)` in the main world but not in workers, iframes, or privileged pages — and on Firefox 150 the `webdriver` accessor's property descriptor is locked, so the redefine attempt throws. A `Proxy` wrap of `navigator` reads in main world is observable to anything that compares `navigator === window.navigator.constructor.prototype.constructor`.

Our `inject_stealth_hook` cleans up the hook surface (Function.toString masking, cross-realm probes, no globals — see `stealth-evidence/SUMMARY.md` stage 6) but it deliberately stops at the hook boundary. Engine-level signals (`navigator.webdriver`, Canvas noise, GPU strings) are out of its scope by design.

**Bottom line.** If your target is local debugging and reverse engineering, raw Firefox is fine — disable `--stealth` and use the 80% of the toolchain that is engine-neutral. If your target is anti-bot resistant scraping or evading commercial fingerprinters, Camoufox is required; raw Firefox cannot reach feature parity at the C++ patches we need. Adding a `--engine=firefox|camoufox` switch is feasible but the stealth surface would have to declare itself disabled on the raw-Firefox path.

## Install

Requires Node.js 20+.

**Supported browser stack: Camoufox + geckodriver only.** Raw `firefox --remote-debugging-port` exposes CDP, not WebDriver BiDi, and is not supported — and the stealth half of the toolchain only works against Camoufox (see [Why Camoufox](#why-camoufox-and-not-raw-firefox)).

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

## Stealth tools

| Tool | Purpose |
|---|---|
| `inject_stealth` | Apply a stealth preset (default `firefox-default`) via BiDi preload. Main world only. |
| `inject_stealth_to_workers` | Push the preset into dedicated/shared worker realms (post-start injection — workers' prologue has already run). `watch:true` auto-injects future workers until the session ends. |
| `inject_stealth_hook` | Wrap a dotted global path (e.g. `window.fetch`) with a Function-toString-masking, channel-emitting Proxy. Optional `neutraliseTiming` ratchets `performance.now` / `Date.now` to hide debugger pauses. |
| `inject_preload_script` | Inject arbitrary preload JS — escape hatch when the above don't fit. |
| `list_stealth_presets` / `list_stealth_features` | Introspect the presets / features the capability knows. |
| `set_user_agent` | Override the `Camoufox/<ver>` UA brand via BiDi emulation. |

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

## License

ISC.
