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

/** Emit a TOP-LEVEL bootstrap IIFE (NOT per-wrap) that installs a single shared
 *  `{ maskAs, installInRealm }` surface on the top realm and patches the
 *  top realm + every reachable iframe realm's `Function.prototype.toString`.
 *
 *  Cross-realm correctness rests on three properties:
 *
 *   1. The `map`, `maskAs`, and the override function ALL live in top realm.
 *      Every iframe realm's `Function.prototype.toString` is replaced by the
 *      SAME top-realm override (assigned cross-realm via
 *      `iframeWin.Function.prototype.toString = override`). Thus a probe like
 *      `iframe.contentWindow.Function.prototype.toString.call(window.fetch)`
 *      always queries the top map and hits.
 *
 *   2. When the preload re-executes inside a sub-realm (BiDi addPreloadScript
 *      runs once per browsing context), this IIFE detects that it is not the
 *      top realm and SKIPS creating a new surface. The wrap IIFEs in that
 *      sub-realm then look up the existing surface on `globalThis.top` and
 *      register their wrapped functions through it — so iframe-realm wraps
 *      also live in the top map.
 *
 *   3. The surface key is a private Symbol on `globalThis`. The key string
 *      `__sh_surface` does NOT appear in `Object.getOwnPropertyNames(globalThis)`
 *      (Symbols are listed via `getOwnPropertySymbols`, not `getOwnPropertyNames`).
 *      Function.prototype.toString carries no own Symbols (the override is
 *      registered in the map under itself, not as an own-Symbol anchor). */
function emitToStringMasking(): string {
  return `
    (function () {
      // Detect whether we are the top realm. \`globalThis.top\` is undefined
      // in non-DOM realms (test VM contexts, workers) — treat those as top.
      // Cross-origin parent access throws — treat as sub-realm.
      var isTop = true;
      try {
        var __t = globalThis.top;
        if (__t && __t !== globalThis) isTop = false;
      } catch (e) { isTop = false; }

      // Surface lookup helper — walks own-Symbols looking for a brand we set.
      function findSurface(host) {
        try {
          var syms = Object.getOwnPropertySymbols(host);
          for (var i = 0; i < syms.length; i++) {
            var v = host[syms[i]];
            if (v && v.__shTag === 1) return v;
          }
        } catch (e) {}
        return null;
      }

      // If a surface already exists on this realm's host, we're done. Useful
      // when this IIFE is re-rendered (e.g. two inject_stealth_hook calls).
      if (findSurface(globalThis)) return;

      // Sub-realm path: don't create a new surface, don't install locally.
      // The wrap IIFE will route through top's surface. We DO still try to
      // install top's override into our own Function.prototype.toString so
      // that \`iframeWin.Function.prototype.toString\` is the top override.
      if (!isTop) {
        try {
          var topSurf = findSurface(globalThis.top);
          if (topSurf) topSurf.installInRealm(globalThis);
        } catch (e) {}
        return;
      }

      // Top realm: build the shared surface. The mask map is a top-realm
      // WeakMap shared across every realm we patch — WeakMaps work across
      // realms because they key on object identity, not prototype chain.
      var map = new WeakMap();

      // Build a fresh override for the given realm. Constraints:
      //
      //  - override.__proto__ === targetWin.Function.prototype (so
      //    \`override instanceof targetWin.Function === true\` — CreepJS
      //    cross-realm pollution probe).
      //  - 'prototype' in override === false (native built-ins have none).
      //  - \`new override()\` throws (native built-ins are not constructable).
      //
      // We achieve all three by returning a target-realm ARROW function from
      // a target-realm Function-constructed factory. The factory itself is a
      // regular function so it must be built via \`new TargetFn(...)\`; the
      // arrow it returns inherits target's Function.prototype and has no
      // own \`prototype\`.
      function buildOverrideIn(targetWin) {
        var TargetFn = targetWin.Function;
        var TargetFp = TargetFn.prototype;
        var TargetProxy = targetWin.Proxy;
        var TargetReflect = targetWin.Reflect;
        var realFnToString = TargetFp.toString;
        // Wrap the realm's real Function.prototype.toString in a Proxy. The
        // Proxy:
        //
        //   - inherits TargetFn.prototype so \`ov instanceof TargetFn\` holds
        //     (CreepJS cross-realm-pollution probe);
        //   - has no own \`prototype\` because its target (realFnToString)
        //     has none — Proxy forwards \`has\` / \`get\` for unknown keys;
        //   - throws on \`new ov(...)\` because the construct trap rejects.
        //
        // We forward apply through a map lookup keyed on \`thisArg\` so
        // calls like \`Function.prototype.toString.call(maskedFn)\` resolve
        // to the masked native-code string. All Proxy / Reflect references
        // are pulled from the TARGET realm so no cross-realm objects leak.
        var ov = new TargetProxy(realFnToString, {
          apply: function (target, thisArg, args) {
            var masked = map.get(thisArg);
            if (masked !== undefined) return masked;
            return TargetReflect.apply(target, thisArg, args);
          },
          construct: function () {
            throw new TypeError('Function.prototype.toString is not a constructor');
          }
        });
        // Make the override identify as native code when probed via itself.
        map.set(ov, 'function toString() { [native code] }');
        return ov;
      }

      // Top realm override (used here + cached for sub-realms that find
      // surface before they get their own preload run).
      var override = buildOverrideIn(globalThis);

      function installInRealm(targetWin) {
        try {
          var ov = (targetWin === globalThis) ? override : buildOverrideIn(targetWin);
          targetWin.Function.prototype.toString = ov;
        } catch (e) {
          // Cross-origin frames throw on Function access; documented limitation.
        }
      }
      function maskAs(target, asNativeName) {
        map.set(target, 'function ' + asNativeName + '() { [native code] }');
      }

      var surface = { __shTag: 1, maskAs: maskAs, installInRealm: installInRealm };
      // Anchor under a private Symbol so the surface key is not enumerable via
      // getOwnPropertyNames (only via getOwnPropertySymbols). Bracket
      // assignment is intentional.
      var SH = Symbol();
      globalThis[SH] = surface;

      // 1) Install in the top realm.
      installInRealm(globalThis);

      // 2) Initial sweep: existing iframes (same-origin / about:blank only).
      try {
        var doc = (typeof document !== 'undefined') ? document : null;
        if (doc && doc.querySelectorAll) {
          var frames = doc.querySelectorAll('iframe');
          for (var i = 0; i < frames.length; i++) {
            try {
              var cw = frames[i].contentWindow;
              if (cw) installInRealm(cw);
            } catch (e) {}
          }
        }
      } catch (e) {}

      // 3) Future iframes: MutationObserver on the document.
      try {
        var MO = (typeof MutationObserver !== 'undefined') ? MutationObserver : null;
        if (MO && doc) {
          var obs = new MO(function (records) {
            for (var r = 0; r < records.length; r++) {
              var added = records[r].addedNodes;
              for (var n = 0; n < added.length; n++) {
                var node = added[n];
                if (!node || node.nodeType !== 1) continue;
                if (node.tagName === 'IFRAME') {
                  try { if (node.contentWindow) installInRealm(node.contentWindow); } catch (e) {}
                  try { node.addEventListener('load', function (ev) {
                    try { installInRealm(ev.target.contentWindow); } catch (e) {}
                  }); } catch (e) {}
                } else if (node.querySelectorAll) {
                  try {
                    var nested = node.querySelectorAll('iframe');
                    for (var k = 0; k < nested.length; k++) {
                      try { if (nested[k].contentWindow) installInRealm(nested[k].contentWindow); } catch (e) {}
                    }
                  } catch (e) {}
                }
              }
            }
          });
          try { obs.observe(doc, { childList: true, subtree: true }); } catch (e) {}
        }
      } catch (e) {}
    })();
  `;
}

/** Emit a fragment that, when run in any realm, returns the shared
 *  `{ maskAs, installInRealm }` surface or null. The wrap IIFE uses this to
 *  hand its `__wrapped` function to the top realm's mask map regardless of
 *  which realm the wrap IIFE itself is executing in. */
function emitFindSurface(): string {
  return `
    var __sh = (function () {
      function find(host) {
        try {
          var syms = Object.getOwnPropertySymbols(host);
          for (var i = 0; i < syms.length; i++) {
            var v = host[syms[i]];
            if (v && v.__shTag === 1) return v;
          }
        } catch (e) {}
        return null;
      }
      var local = find(globalThis);
      if (local) return local;
      try { return find(globalThis.top); } catch (e) { return null; }
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
  //
  // We render the wrapper as an ARROW function so it has no own `prototype`
  // and is NOT constructable — matching the shape of native built-ins like
  // window.fetch. CreepJS probes `'prototype' in fetch` and `new fetch()`.
  // Capturing `this` is done via the trailing `, this` parameter forwarded
  // from the bound activation function (see __wrapped construction below).
  const parts: string[] = ['var b={channel:k,ts:Date.now(),target:p};'];
  if (wantArgs) parts.push('try{b.args=[].slice.call(a)}catch(e){}');
  if (wantThis) parts.push('try{b.thisArg=t}catch(e){}');
  if (wantStack) parts.push('try{b.stack=(new Error()).stack}catch(e){}');
  parts.push('var d;try{d=o.apply(t,a)}catch(e){b.threw=String(e);try{e2(b)}catch(_){}throw e}');
  if (wantRet) parts.push('b.ret=d;');
  parts.push('try{e2(b)}catch(_){}return d');
  const wrapperBody = parts.join('');

  return `(function () {
    try {
      ${emitResolveTarget(wrap.targetPath)}
      ${emitFindSurface()}
      var e2 = globalThis[${q(emitName)}];
      var k = ${q(channelName)};
      var p = ${q(wrap.targetPath)};
      var o = __original;
      var __name = __original.name || ${q(fallbackName)};
      // Arrow function: no own \`prototype\` and not constructable, matching
      // native built-ins like window.fetch. \`'prototype' in fetch\` returns
      // false and \`new fetch()\` throws — both checks CreepJS uses. The
      // tradeoff: arrow functions don't bind their own \`this\`, so we cannot
      // forward dynamic-this. For the wraps we currently support
      // (fetch / XHR.open / WebSocket.send / WebSocket.onmessage etc.) the
      // receiver is determined by the property's owner at call site and the
      // implementations don't read \`this\` from the wrapper anyway — but if
      // a future wrap target needs dynamic-this, switch to a Proxy-based
      // wrap for that target.
      var __wrapped = (...a) => { var t = undefined; ${wrapperBody} };
      try { Object.defineProperty(__wrapped, 'name',   { value: __name,            configurable: true }); } catch (e) {}
      try { Object.defineProperty(__wrapped, 'length', { value: __original.length, configurable: true }); } catch (e) {}
      // Register the wrap into the shared (top-realm) mask map, then make sure
      // THIS realm's Function.prototype.toString is the top override too.
      if (__sh) {
        try { __sh.maskAs(__wrapped, __name); } catch (e) {}
        try { __sh.installInRealm(globalThis); } catch (e) {}
      }
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
      // Bootstrap the shared toString mask surface once per realm (only when
      // there is at least one wrap that needs it). Top realm builds the
      // surface; sub-realms only install the override into their local
      // Function.prototype.toString.
      const wraps = spec.wraps ?? [];
      if (wraps.length > 0) parts.push(emitToStringMasking());
      if (spec.neutraliseTiming) parts.push(renderTimingNeutraliser(spec.timingMaxGapMs ?? 16));
      for (const wrap of wraps) {
        parts.push(renderSingleWrap(spec.emitName, wrap));
      }
      return parts.join('\n');
    },
  };
}
