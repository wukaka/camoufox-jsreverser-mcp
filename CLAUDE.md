# CLAUDE.md

Firefox 150 JavaScript reverse-engineering MCP server. Backed by WebDriver BiDi and the Firefox Remote Debugging Protocol (RDP). Browser stack is **Camoufox + geckodriver only** — raw `firefox` is not supported.

If you are a coding agent opening this repo cold, read this file first. It is the single curated entry point into the codebase.

## Scope: what this toolset can and cannot do

This is a **mid-to-low intensity** JS reverse-engineering toolset. Be honest with users about the ceiling before starting any reverse task.

**Works well for:**
- Conventional request-signing parameters (timestamp + nonce + HMAC/AES/RC4/SM4 via CryptoJS or similar standard libs)
- Lightly obfuscated code (sojson, jsobfuscator, basic string-table + variable-renaming) — `deobfuscate_code` + `understand_code` reliably recover semantics
- Webpack chunk analysis, runtime hook capture, WebSocket / XHR protocol reverse
- Cookie / login-state / session-state replay where the algorithm is plain-JS (not VMP-encoded)
- AST-driven extraction of pure algorithms once the input surface is known

**Does NOT work (and no amount of protocol switching fixes it):**
- **Rui Shu 5/6 (瑞数), 顶象 VMP, 极验 VMP, 阿里 240, 网易易盾 deep mode** — these encode the entire algorithm as bytecode for a self-implemented stack VM. BiDi+RDP can attach, hook, and trace — but the call stack only points at the VM's opcode dispatch loop, which carries no algorithmic information. The semantic layer is invisible.
- Heavy use of `new Function()` / `eval()` to generate second-stage code dynamically — current tools cannot reliably follow this without a VMP-aware tracer.

**When you detect VMP-class targets** (markers: `if($_ts.cd){...}`, `while(1){opcode = bytes[ip++]; if (opcode < N){...}}` dispatch loops, byte arrays > 5KB at file tail, high-codepoint Unicode "instruction string" regions, dynamic `Function` constructors as the only call into the next layer), **stop and tell the user**:

> Target uses a VMP-class anti-bot system. Pure-algorithm offline reproduction in Node/Python is a 6–12 month research project, not a feasible workflow with this toolset. Recommended path: browser-automation proxy (Camoufox/Playwright) with fingerprint hardening, not algorithm extraction.

Breaking VMP requires a separate technology stack (opcode-table dumper, IR rewriting, symbolic execution, full trace recording + offline replay) that this project does not implement. Don't waste hours hooking against VMP — the call frames have no information to give you.

A worked example of hitting this ceiling lives in `artifacts/tasks/etax-cookie-2026-06-15/report.md` (Rui Shu 5代 case on `etax.chinatax.gov.cn`).

## Quick start

```bash
npm install
npm run build

# macOS default paths (auto-resolved):
node build/src/index.js --stealth=auto

# Apple Silicon override (brew geckodriver):
node build/src/index.js --stealth=auto --geckodriver-path /opt/homebrew/bin/geckodriver

# Attach to an existing geckodriver session instead of launching:
node build/src/index.js --attach --bidi-url ws://127.0.0.1:PORT/session/ID --rdp-port 6000
```

Unit tests run without a browser: `npm test`. Live integration / e2e need a working Camoufox + geckodriver install on the machine.

## Architecture

Four layers, strictly separated. Pick the right layer when proposing a change:

```
driver → capability → session → tool
  │         │           │         │
  └ BiDi    └ 22 caps   └ caches  └ 84 tools across 14 groups
  └ RDP                 └ dispatcher
  └ launcher
```

- **Driver** layer talks raw protocol. Pure wire concerns: framing, request/response pairing, event subscribe.
- **Capability** layer is the verb surface. Each capability owns one slice of debugger / page / runtime / preload semantics, sits on top of one or both drivers, and is implementation-detail-free as far as the tool layer is concerned.
- **Session** is the in-process singleton holding driver instances, capability instances, all caches (`ScriptCache`, `RequestPool`, `HookTable`, `WsTable`, `ConsoleRing`), the pause context, and session-scoped pref overrides.
- **Tool** layer is thin: parse zod input, call one capability, return `ToolResult { ok: true, data }` or `{ ok: false, reason }`. No business logic.

Touch only one layer per change unless a milestone explicitly spans them.

## Drivers (3)

| Driver | Path | Responsibility | Gotcha |
|---|---|---|---|
| BidiDriver | `src/drivers/bidi/BidiDriver.ts` | WebDriver BiDi over WebSocket; id-paired commands, subscription routing. | BiDi `script.evaluate` returns serialized values; the in-tree subscription module fans events out by `context`. |
| RdpDriver | `src/drivers/rdp/RdpDriver.ts` | Firefox DevTools RDP over TCP; length-prefixed JSON framing, actor FIFO. | Firefox 150 emits a synchronous greeting packet — `Session.ensureRdp` must consume it before any RDP call. See M7.04. |
| FirefoxLauncher | `src/drivers/launcher/FirefoxLauncher.ts` | Spawns Camoufox via geckodriver, runs `POST /session`, returns `{ bidiUrl, rdpPort, profileDir, sessionId, geckodriverPort }`. | The launcher pins the RDP port through `--start-debugger-server` and prefs. M7.01 made this the only supported launch path. |

## Capabilities (22)

Grouped roughly by where the wire traffic goes.

**BiDi-backed**
- `scriptHost` — `src/capabilities/scriptHost.ts` — BiDi `script.*` evaluate / call / preload list / realm enumeration.
- `preloadInjector` — `src/capabilities/preloadInjector.ts` — Wraps raw JS as an IIFE-shaped declaration acceptable to BiDi `script.addPreloadScript`.
- `networkObserver` — `src/capabilities/networkObserver.ts` — Subscribes to BiDi `network.*`, maintains `RequestPool`, supports XHR/fetch break.
- `wsObserver` — `src/capabilities/wsObserver.ts` — BiDi-side WebSocket frames + preload hook for WebSocket.prototype.send/onmessage (M2.09).
- `logSink` — `src/capabilities/logSink.ts` — BiDi `log.*` → `ConsoleRing`.
- `pageController` — `src/capabilities/pageController.ts` — BiDi `browsingContext.*` for navigate / new page / click / type.
- `storageAccess` — `src/capabilities/storageAccess.ts` — BiDi `storage.*` for cookies / origin storage read/write.
- `domAccess` — `src/capabilities/domAccess.ts` — BiDi DOM lookup / query / structure dump. Synthetic value assignment for type().

**RDP-backed**
- `pauseController` — `src/capabilities/pauseController.ts` — RDP thread actor: attach, breakpoints with column snap to `getPossibleBreakpoints` (M7.07), pause/resume/step, evaluate-on-callframe.
- `objectInspector` — `src/capabilities/objectInspector.ts` — RDP grip / ObjectActor: inspect, prototypeAndProperties, internal slots, release.
- `eventMonitor` — `src/capabilities/eventMonitor.ts` — RDP watcher for DOM events / timers / promises.
- `performanceProbe` — `src/capabilities/performanceProbe.ts` — RDP metrics merged with W3C Performance API readings.
- `initiatorTracer` — `src/capabilities/initiatorTracer.ts` — Normalizes BiDi initiator + RDP stack frames into one shape.
- `runtimePrefs` — `src/capabilities/runtimePrefs.ts` — RDP PreferenceActor with baseline snapshot/restore. Falls back to a stub when the actor is unavailable.
- `workerTopology` — `src/capabilities/workerTopology.ts` — Worker enumeration: scriptHost realms in M2, RDP target-watcher form-subscription augmented in M3.

**Stealth**
- `stealth` — `src/capabilities/stealth.ts` — Applies named presets (`firefox-default`) via preloadInjector + storage.
- `stealthHook` — `src/capabilities/stealthHook.ts` — Renders preload-script JS that lets MCP-injected hooks survive common anti-bot inspection (M7.05).

**AST / LLM / infra**
- `astAnalyzer` — `src/capabilities/astAnalyzer.ts` — 5 AST transforms over Babel; wired on `Session.init`.
- `cryptoSignatures` — `src/capabilities/cryptoSignatures.ts` — 10 crypto-detection rules over the AST.
- `llmProvider` — `src/capabilities/llmProvider.ts` — 3 providers (openai / anthropic / openai-compatible) + LRU cache. Returns `LlmNotConfigured` cleanly when no key is set.
- `taskArtifacts` — `src/capabilities/taskArtifacts.ts` — File-IO capability for rebuild bundles + evidence.
- `hookRegistry` — `src/capabilities/hookRegistry.ts` — Renders a JS template that wraps `targetExpr` with a Proxy capturing configured fields. Samples shipped via `__hookRegistry` channel.

## Tools (84, in 14 groups)

| Group | Count | Path | Purpose |
|---|---|---|---|
| ai-ast | 6 | `src/tools/ai-ast/` | AST transforms + LLM-backed code explanation (`understand_code`, `summarize_code`, `deobfuscate_code`, `detect_crypto`, …). |
| console | 5 | `src/tools/console/` | Console-message listing / get / clear / monitor / stop. |
| debugger | 12 | `src/tools/debugger/` | `set_breakpoint`, `set_breakpoint_on_text`, `remove_breakpoint`, `list_breakpoints`, `pause`, `resume`, `step_over/into/out`, `get_paused_info`, `evaluate_on_callframe`, `inspect_object`. |
| dom | 6 | `src/tools/dom/` | `query_dom`, `get_dom_structure`, `click_element`, `type_text`, `wait_for_element`, `find_clickable_elements`. |
| hooks | 8 | `src/tools/hooks/` | `hook_function`, `inject_hook`, `create_hook`, `list_hooks`, `get_hook_data`, `trace_function`, `unhook_function`, `remove_hook`. |
| network | 5 | `src/tools/network/` | `list_network_requests`, `get_network_request`, `get_request_initiator`, `break_on_xhr`, `remove_xhr_breakpoint`. |
| page-state | 9 | `src/tools/page-state/` | `list_pages`, `select_page`, `new_page`, `navigate_page`, `take_screenshot`, `list_frames`, `select_frame`, `check_browser_health`, `analyze_target`. |
| prefs | 2 | `src/tools/prefs/` | `set_javascript_enabled`, `set_csp_enabled` (per-context, via BiDi). |
| rebuild | 6 | `src/tools/rebuild/` | Bundle builder, env-diff, evidence-writer, report export — the "reproduce the algorithm locally" tools. |
| scripts | 5 | `src/tools/scripts/` | `list_scripts`, `get_script_source`, `find_in_script`, `search_in_scripts`, `search_in_sources`. |
| stealth | 7 | `src/tools/stealth/` | `inject_stealth`, `inject_stealth_to_workers`, `inject_stealth_hook`, `inject_preload_script`, `list_stealth_presets`, `list_stealth_features`, `set_user_agent`. |
| storage | 7 | `src/tools/storage/` | Cookie / localStorage / sessionStorage read+write + session state save/load/dump/restore. |
| websocket | 4 | `src/tools/websocket/` | `list_websocket_connections`, `get_websocket_message`, `get_websocket_messages`, `analyze_websocket_messages`. |
| workers | 2 | `src/tools/workers/` | Worker enumeration + WASM module listing. |

## Session & caches

- `Session` (`src/session/Session.ts`) is the in-process singleton holding all drivers + 22 capability instances + caches + dispatcher.
- Caches in `src/session/caches.ts`:
  - `ScriptCache` — script id → { url, source, hash, possibleBreakpoints? }. M7.07 added the per-line `possibleBreakpoints` lazy index.
  - `RequestPool` — request id → req/res/initiator/body ref.
  - `HookTable` — hookId → { def, preloadId, workerInjections, samples }.
  - `WsTable` — (targetId, wsid) → frames.
  - `ConsoleRing` — ring buffer, default capacity 5000.
- Session also holds the pause context (`PauseInfo`) and session-scoped pref overrides used by `set_javascript_enabled` / `set_csp_enabled`.

## Milestone log

| Phase | Theme |
|---|---|
| M1 | Foundation: drivers, launcher, session skeleton, tool registry. |
| M2 | BiDi-backed capabilities: scriptHost, preloadInjector, networkObserver, logSink, storageAccess, pageController, domAccess, hookRegistry, wsObserver, workerTopology (M2 form). |
| M3 | RDP-backed capabilities: pauseController, objectInspector, eventMonitor, performanceProbe, initiatorTracer, runtimePrefs, workerTopology (M3 augmentation), `set_javascript_enabled` / `set_csp_enabled`. |
| M4 | Stealth (firefox-default preset) + astAnalyzer + cryptoSignatures + llmProvider + ai-ast tools. |
| M5 | Rebuild + evidence: taskArtifacts, bundle-builder, env-diff, evidence-writer, 6 rebuild tools. |
| M6 | Integration + e2e harness, fixture HTTP server, W1-W7 workflow suites, CI workflow, v0.1.0 docs. |
| M7 | Firefox 150 + Camoufox fitness. See sub-milestones below. |

**M7 sub-milestones**

| ID | Topic |
|---|---|
| M7.01 | geckodriver-fronted Camoufox is the only launch path. |
| M7.02 | Live BiDi + capability regression fixes against Camoufox. |
| M7.03 | RDP-side caps wired in `ensureRdp`; real RDP server started. |
| M7.04 | Synchronous RDP bootstrap + greeting consumer on Firefox 150. |
| M7.05 | `stealthHook` capability — anti-detection preload renderer. |
| M7.06 | `pauseController` Firefox 150 attach options + setBreakpoint thread routing. |
| M7.07 | `pauseController` column-index fix via `getPossibleBreakpoints` snap + `columnTolerance` opt-in; objectInspector live restored. |
| M7.08 | This file + README refresh. |
| M7.09 | `stealth.applyPresetToWorkers` — push firefox-default preset to dedicated/shared worker realms; lazy workerTopology accessor for RDP swap. |
| M7.10 | `inject_stealth_hook` + `inject_stealth_to_workers` MCP tools; README/CLAUDE.md rollup. |

## Where to look

- CLI flag shape → `src/server/argv.ts` (single source of truth for `--*` options).
- Entry wiring → `src/index.ts` (`process.env['CAMOUFOX_PATH']` / `GECKODRIVER_PATH` read here).
- Specs → `docs/superpowers/specs/`.
- Implementation plans → `docs/superpowers/plans/`.
- Stealth preload payloads → `src/stealth-scripts/`.
- Live fixture pages + sign.js + HTTP server → `test/integration/fixtures/`.
- Unit tests by area → `test/unit/{capabilities,session,tools,…}`.
- Tool group entry points → `src/tools/<group>/index.ts` (export arrays consumed by `src/index.ts`).

## Common gotchas

- **`--rdp-port` semantics**: auto-allocated in launch mode (you read it back from the launcher result); **required** in attach mode.
- **Apple Silicon geckodriver path**: brew installs to `/opt/homebrew/bin/geckodriver`, but the in-tree default is `/usr/local/bin/geckodriver`. Pass `--geckodriver-path` or set `GECKODRIVER_PATH` to avoid `ENOENT` on launch.
- **`--stealth=off` does NOT disable Camoufox**: the flag only suppresses the `firefox-default` preload payload. The C++-level Camoufox stealth (navigator.webdriver=false, fingerprint patches) is always on.
- **LLM-key absence is a no-throw path**: `understand_code` / `summarize_code` / `deobfuscate_code` return `{ ok: false, reason: 'LlmNotConfigured' }` cleanly. The other ~79 tools work without an LLM key.
- **Live integration suites don't self-skip cleanly on marionette handshake failures** — they throw. Run `npm run test:integration` only when Camoufox + geckodriver are actually installed and working.
- **Firefox 150 `setBreakpoint` column resolution**: an arbitrary column from `idx + 1` will be silently dropped if it doesn't land on a `Debugger.Source.getPossibleBreakpoints` position. `pauseController` snaps automatically (M7.07); pass `columnTolerance > 0` for the multi-hit auto-resume mode when you need to land on a specific spot in a packed multi-statement row.
- **RDP greeting**: `Session.ensureRdp()` must run before any RDP-backed capability use (it consumes the Firefox 150 synchronous greeting packet; see M7.04).
- **dotenv is loaded at process start** (`import 'dotenv/config'` in `src/index.ts`). Env-var overrides via shell still work — they take precedence over `.env` because dotenv does not overwrite already-set vars.
- **Worker stealth is post-start.** `inject_stealth_to_workers` runs the payload via `script.callFunction` after the worker's prologue executed. Detection that reads `navigator.webdriver` in the worker's first synchronous tick will see `true`. This is a BiDi protocol limitation (`addPreloadScript` doesn't reach workers).
- **Worker-stealth watch is session-scoped.** When `watch:true` (default), the subscription cleans up at Session shutdown. There is no per-call `stop_watching` — re-call the tool with `watch:false` for a one-shot, or restart the session.
- **`inject_stealth_hook` is main-world-only in M7.10.** Use `inject_stealth_to_workers` for worker stealth presets; arbitrary hook wrap injection into workers needs its own milestone.

## License

ISC. See `README.md` for runtime details and the install table.
