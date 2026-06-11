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

/** Emit the JS that registers `wrapped` in `toStringMap` so that
 *  `Function.prototype.toString.call(wrapped)` reports a native-code body
 *  identical to the original's. */
function emitToStringMasking(): string {
  // Shared map across all wraps installed by the same preload payload.
  return `
    var __maskFn = (globalThis.__sh_mask__ || (globalThis.__sh_mask__ = (function () {
      var map = new WeakMap();
      // Install a single Function.prototype.toString override. We always grab the
      // ORIGINAL toString here so chained installs don't compose.
      var realFnToString = Function.prototype.toString;
      var realCall = Function.prototype.call;
      Function.prototype.toString = function () {
        var masked = map.get(this);
        if (masked !== undefined) return masked;
        return realCall.call(realFnToString, this);
      };
      // Mask the override itself so toString.toString() also looks native.
      map.set(Function.prototype.toString, 'function toString() { [native code] }');
      return function maskAs(target, asNativeName) {
        map.set(target, 'function ' + asNativeName + '() { [native code] }');
      };
    })()));
    Object.defineProperty(globalThis, '__sh_mask__', { enumerable: false, configurable: false });
  `;
}

function renderSingleWrap(emitName: string, wrap: StealthHookWrapSpec): string {
  const capture = JSON.stringify(wrap.capture ?? ['args', 'return']);
  const channelName = wrap.channelName ?? 'stealth-hook';
  return `(function () {
    try {
      ${emitResolveTarget(wrap.targetPath)}
      ${emitToStringMasking()}
      var __emit = globalThis[${q(emitName)}];
      var __capture = ${capture};
      var __name = __original.name || ${q(wrap.targetPath.split('.').pop() ?? 'fn')};
      // The wrapper is an arrow-less regular function so .name reports __name when
      // Object.defineProperty is used to copy it across, and so it can be called
      // as a constructor when the original was constructable.
      var __wrapped = function () {
        var __args = arguments;
        var __sample = { channel: ${q(channelName)}, ts: Date.now(), target: ${q(wrap.targetPath)} };
        if (__capture.indexOf('args')   >= 0) try { __sample.args = Array.prototype.slice.call(__args); } catch (e) {}
        if (__capture.indexOf('this')   >= 0) try { __sample.thisArg = this; } catch (e) {}
        if (__capture.indexOf('stack')  >= 0) try { __sample.stack = (new Error()).stack; } catch (e) {}
        var __ret;
        try {
          __ret = Reflect.apply(__original, this, __args);
        } catch (e) {
          __sample.threw = String(e);
          try { if (typeof __emit === 'function') __emit(__sample); } catch (e2) {}
          throw e;
        }
        if (__capture.indexOf('return') >= 0) __sample.ret = __ret;
        try { if (typeof __emit === 'function') __emit(__sample); } catch (e2) {}
        return __ret;
      };
      // Copy name + length so toString.fingerprint heuristics that include
      // those agree with the original.
      try { Object.defineProperty(__wrapped, 'name',   { value: __name,            configurable: true }); } catch (e) {}
      try { Object.defineProperty(__wrapped, 'length', { value: __original.length, configurable: true }); } catch (e) {}
      __maskFn(__wrapped, __name);
      // Install with the same property-descriptor shape as the original where
      // possible; fall back to a direct assignment if the slot is non-configurable.
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
 *  through a ratchet that caps the per-tick gap. */
function renderTimingNeutraliser(maxGapMs: number): string {
  return `(function () {
    if (globalThis.__sh_timing__) return;
    Object.defineProperty(globalThis, '__sh_timing__', { value: true, enumerable: false });
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
