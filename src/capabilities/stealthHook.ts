import type { StealthHook, StealthHookPreloadSpec, StealthHookWrapSpec } from './types.js';

/**
 * Render preload-script JavaScript that lets MCP-injected hooks survive common
 * anti-bot inspection. Three categories of leak are addressed in this module:
 *
 *   1. `Function.prototype.toString` reveals wrapped function bodies. We rewrite
 *      `toString` so the wrapped reference (and the rewrite itself) report
 *      `"function <name>() { [native code] }"` — the same string the unwrapped
 *      native would return.
 *
 *   2. Proxy / wrapper identity leaks. Wrappers are installed as the same property
 *      descriptor shape as the original (writable + configurable), and we never
 *      attach state to `window.__*` buckets — everything is captured in closures.
 *
 *   3. Timing checks. Pages frequently do
 *        `const t = Date.now(); debugger; if (Date.now() - t > 50) flag()`
 *      or `performance.now()` equivalents to detect a debugger pause. The
 *      `neutraliseTiming` fragment installs a monotonic ratchet that "subtracts"
 *      gaps larger than a threshold, hiding the pause-induced jump from the page.
 *
 * Everything is rendered as IIFEs that share NO mutable global state — callers
 * combine them in `renderPreload(spec)`. Capabilities.preloadInjector then ships
 * the result via BiDi `script.addPreloadScript`.
 */

const STEALTH_HOOK_VERSION = '1';

/** Quote a string for safe inlining into the rendered JS body. */
function q(s: string): string { return JSON.stringify(s); }

/** Generate the path-walk fragment that resolves `targetPath` against globalThis,
 *  returning `{ owner, key, original }`. Throws inside the page if anything is
 *  missing; the caller wraps this in try/catch. */
function emitResolveTarget(targetPath: string): string {
  return `
    var __parts = ${q(targetPath)}.split('.');
    var __filtered = __parts.filter(function (p) { return p && p !== 'globalThis' && p !== 'window' && p !== 'self'; });
    if (!__filtered.length) throw new Error('stealthHook: empty path');
    var __owner = globalThis;
    for (var __i = 0; __i < __filtered.length - 1; __i++) {
      __owner = __owner[__filtered[__i]];
      if (__owner == null) throw new Error('stealthHook: missing ' + __filtered[__i]);
    }
    var __key = __filtered[__filtered.length - 1];
    var __original = __owner[__key];
    if (typeof __original !== 'function') throw new Error('stealthHook: ' + ${q(targetPath)} + ' is not a function');
  `;
}

/** Emit the JS that registers `wrapped` in a closure-private mask map so that
 *  `Function.prototype.toString.call(wrapped)` reports a native-code body
 *  identical to the original's. No globalThis pollution, no named property
 *  on Function.prototype.toString.
 *
 *  Cross-IIFE behaviour: each preload payload installs its own independent
 *  override of Function.prototype.toString. If two inject_stealth_hook calls
 *  happen in the same session, the second override wins; wraps registered
 *  by the first payload then fall back to the realFnToString path and reveal
 *  their wrapper source. This is an acceptable degradation because §4.2
 *  cleansing means the leaked wrapper source carries no stealth-toolchain
 *  identifier tokens. Avoiding the degradation would require an enumerable
 *  anchor (Symbol.for / named property) on Function.prototype.toString,
 *  which Object.getOwnPropertySymbols / Symbol.keyFor would then expose to
 *  the page — a worse leak than the degradation. */
function emitToStringMasking(): string {
  return `
    var __maskFn = (function () {
      var fp = Function.prototype;
      var realFnToString = fp.toString;
      var realCall = fp.call;
      var map = new WeakMap();
      var override = function () {
        var masked = map.get(this);
        if (masked !== undefined) return masked;
        return realCall.call(realFnToString, this);
      };
      // Mask the override itself so toString.toString() also looks native.
      map.set(override, 'function toString() { [native code] }');
      fp.toString = override;
      return function maskAs(target, asNativeName) {
        map.set(target, 'function ' + asNativeName + '() { [native code] }');
      };
    })();
  `;
}

function renderSingleWrap(emitName: string, wrap: StealthHookWrapSpec): string {
  const cap = wrap.capture ?? ['args', 'return'];
  const wantArgs = cap.indexOf('args') >= 0;
  const wantRet = cap.indexOf('return') >= 0;
  const wantThis = cap.indexOf('this') >= 0;
  const wantStack = cap.indexOf('stack') >= 0;
  const channelName = wrap.channelName ?? 'stealth-hook';
  const fallbackName = wrap.targetPath.split('.').pop() ?? 'fn';

  // Wrapper body is rendered as one line with single-character locals.
  // Channel name and target path live in the surrounding IIFE closure (k, p)
  // so the wrapper's own toString — visible to detectors via cross-realm
  // probes before our mask installs — carries no stealth-tool-specific
  // identifier tokens (no __capture / __sample / __args / __ret / __emit /
  // Reflect.apply / fetch_calls literal). Object keys on the sample payload
  // (args/ret/target/threw/stack/channel/ts) stay verbatim because they're
  // part of the M7.10 channel-payload contract consumed by get_hook_data.
  const parts: string[] = ['var a=arguments,b={channel:k,ts:Date.now(),target:p};'];
  if (wantArgs) parts.push('try{b.args=[].slice.call(a)}catch(e){}');
  if (wantThis) parts.push('try{b.thisArg=this}catch(e){}');
  if (wantStack) parts.push('try{b.stack=(new Error()).stack}catch(e){}');
  parts.push('var d;try{d=o.apply(this,a)}catch(e){b.threw=String(e);try{e2(b)}catch(_){}throw e}');
  if (wantRet) parts.push('b.ret=d;');
  parts.push('try{e2(b)}catch(_){}return d');
  const wrapperBody = parts.join('');

  return `(function () {
    try {
      ${emitResolveTarget(wrap.targetPath)}
      ${emitToStringMasking()}
      var e2 = globalThis[${q(emitName)}];
      var k = ${q(channelName)};
      var p = ${q(wrap.targetPath)};
      var o = __original;
      var __name = __original.name || ${q(fallbackName)};
      var __wrapped = function () { ${wrapperBody} };
      try { Object.defineProperty(__wrapped, 'name',   { value: __name,            configurable: true }); } catch (e) {}
      try { Object.defineProperty(__wrapped, 'length', { value: __original.length, configurable: true }); } catch (e) {}
      __maskFn(__wrapped, __name);
      try {
        Object.defineProperty(__owner, __key, {
          value: __wrapped,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch (e) {
        __owner[__key] = __wrapped;
      }
    } catch (e) { /* stealth-hook install failure must not break the page */ }
  })();`;
}

/** Render an IIFE that hides debugger-induced timing jumps in the same preload
 *  payload. Hooks the four standard high-resolution clocks and routes them
 *  through a ratchet that caps the per-tick gap.
 *
 *  M7.11: removed the globalThis.__sh_timing__ re-entry flag. Re-running the
 *  IIFE in the same realm is idempotent — the second run captures the first
 *  run's (already-wrapped) performance.now as its realPerfNow, so the ratchet
 *  composes. No correctness issue; small accuracy cost on the second wrap. */
function renderTimingNeutraliser(maxGapMs: number): string {
  return `(function () {
    var realDateNow = Date.now;
    var realPerfNow = typeof performance !== 'undefined' && performance.now ? performance.now.bind(performance) : null;
    if (!realPerfNow) return;
    var MAX_GAP = ${maxGapMs};
    var lastReal = realPerfNow();
    var virtNow = lastReal;
    function advance() {
      var now = realPerfNow();
      var delta = now - lastReal;
      lastReal = now;
      if (delta < 0) delta = 0;
      if (delta > MAX_GAP) delta = MAX_GAP;
      virtNow += delta;
      return virtNow;
    }
    try {
      Object.defineProperty(performance, 'now', { value: function now() { return advance(); }, writable: true, configurable: true });
    } catch (e) {}
    // Date.now follows the same ratchet (in ms). Use real Date.now as the base so
    // wall-clock offset to other tabs stays correct.
    var dateAnchor = realDateNow();
    var perfAnchor = advance();
    Date.now = function () { return dateAnchor + (advance() - perfAnchor); };
  })();`;
}

export function makeStealthHook(): StealthHook {
  return {
    wrapNative(spec) {
      return `/* stealth-hook v${STEALTH_HOOK_VERSION} */\n` + renderSingleWrap(spec.emitName, spec);
    },
    neutraliseTiming(opts) {
      return `/* stealth-hook v${STEALTH_HOOK_VERSION} */\n` + renderTimingNeutraliser(opts?.maxGapMs ?? 16);
    },
    renderPreload(spec: StealthHookPreloadSpec) {
      const parts: string[] = [`/* stealth-hook v${STEALTH_HOOK_VERSION} */`];
      if (spec.neutraliseTiming) parts.push(renderTimingNeutraliser(spec.timingMaxGapMs ?? 16));
      for (const wrap of spec.wraps ?? []) {
        parts.push(renderSingleWrap(spec.emitName, wrap));
      }
      return parts.join('\n');
    },
  };
}
