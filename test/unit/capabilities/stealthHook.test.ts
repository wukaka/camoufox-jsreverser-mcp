import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { makeStealthHook } from '../../../src/capabilities/stealthHook.js';

/**
 * The stealth-hook renderer produces JS that runs inside a page. We test the
 * rendered string by executing it in a fresh V8 context that emulates the
 * page's `globalThis`. This catches real bugs (syntax errors, mis-quoted
 * identifiers, wrong this-binding) that pure string snapshots cannot.
 */
function runInPage(globals: Record<string, unknown>, script: string): vm.Context {
  const ctx = vm.createContext({ ...globals, console });
  vm.runInContext(script, ctx, { displayErrors: true });
  return ctx;
}

describe('stealthHook: renderPreload basics', () => {
  it('emits an empty preamble when nothing is requested', () => {
    const sh = makeStealthHook();
    const src = sh.renderPreload({ emitName: '__emit', wraps: [] });
    expect(src).toContain('stealth-hook v');
    expect(src).not.toContain('Function.prototype.toString =');
  });

  it('wrapNative + neutraliseTiming compose without globalThis pollution (M7.11)', () => {
    const sh = makeStealthHook();
    const src = sh.renderPreload({
      emitName: '__emit',
      neutraliseTiming: true,
      wraps: [{ targetPath: 'fetch' }, { targetPath: 'XMLHttpRequest.prototype.open' }],
    });
    // M7.11: no globalThis.__sh_* anchor of any kind.
    expect(src).not.toMatch(/globalThis\.__sh_/);
    expect(src).not.toMatch(/__sh_mask__/);
    expect(src).not.toMatch(/__sh_timing__/);
    // M7.11.x cross-realm fix: a single shared mask surface is bootstrapped
    // once at the top of renderPreload; both wrap IIFEs register into it
    // (not into per-wrap private maps). installInRealm assigns the realm's
    // own override (built via that realm's Function constructor) exactly
    // once per installInRealm call.
    expect((src.match(/targetWin\.Function\.prototype\.toString = ov/g) ?? []).length).toBe(1);
    // Timing fragment is present.
    expect(src).toContain('MAX_GAP');
    expect(src).toContain('virtNow');
  });

  it('wrapper body carries no stealth-tool identifier tokens (M7.11)', () => {
    const sh = makeStealthHook();
    const src = sh.wrapNative({
      emitName: '__mcp_emit_abc',
      targetPath: 'window.fetch',
      channelName: 'fetch_calls',
      capture: ['args', 'return', 'stack'],
    });
    // Substring scan: none of these identifiers should appear anywhere in the
    // rendered source (renderSingleWrap is the worst-case detector target since
    // its body leaks first via cross-realm probes that beat the iframe sweep).
    expect(src).not.toMatch(/__capture/);
    expect(src).not.toMatch(/__sample/);
    expect(src).not.toMatch(/__args/);
    expect(src).not.toMatch(/__ret/);
    expect(src).not.toMatch(/__emit\b/); // __emit identifier, not __mcp_emit_<hex> global name
    expect(src).not.toMatch(/Reflect\.apply/);
    // Channel name should NOT appear as a string literal inside the wrapper
    // function body — only as a closure-captured const above it.
    const wrapperBodyStart = src.indexOf('var __wrapped = function () {');
    const wrapperBodyEnd = src.indexOf('};', wrapperBodyStart);
    const body = src.slice(wrapperBodyStart, wrapperBodyEnd);
    expect(body).not.toContain('fetch_calls');
  });

  it('renderPreload contains the cross-realm installer scaffolding (M7.11)', () => {
    const sh = makeStealthHook();
    const src = sh.renderPreload({ emitName: '__emit', wraps: [{ targetPath: 'fetch' }] });
    expect(src).toContain('installInRealm');
    expect(src).toMatch(/querySelectorAll\(['"]iframe['"]\)/);
    expect(src).toContain('MutationObserver');
    expect(src).toContain('contentWindow');
    expect(src).toContain('addEventListener');
  });

  it('renderPreload assigns nothing to globalThis (M7.11)', () => {
    const sh = makeStealthHook();
    const src = sh.renderPreload({
      emitName: '__emit',
      neutraliseTiming: true,
      wraps: [{ targetPath: 'fetch' }, { targetPath: 'XMLHttpRequest.prototype.open' }],
    });
    // No assignments of any form `globalThis.<identifier> =`.
    // (`Object.defineProperty(globalThis, ...)` would also be a leak — same regex.)
    expect(src).not.toMatch(/globalThis\.\w+\s*=/);
    expect(src).not.toMatch(/Object\.defineProperty\(\s*globalThis/);
  });
});

describe('stealthHook: wrapped function survives toString detection', () => {
  it("fetch.toString() reports native code AND a call is intercepted", () => {
    const sh = makeStealthHook();
    const emitted: unknown[] = [];

    const ctx = runInPage({
      __emit: (s: unknown) => { emitted.push(s); },
      fetch: function fetch(url: string) { return `OK:${url}`; },
    } as any, sh.renderPreload({
      emitName: '__emit',
      wraps: [{ targetPath: 'fetch', capture: ['args', 'return'] }],
    }));

    // 1) The page sees a wrapped fetch...
    const result = vm.runInContext('fetch("/api/x")', ctx);
    expect(result).toBe('OK:/api/x');
    // 2) ...but Function.prototype.toString lies, and `+f` reports native code.
    const ts = vm.runInContext('fetch.toString()', ctx);
    expect(ts).toBe('function fetch() { [native code] }');
    // 3) Function.prototype.toString.call(fetch) goes through the mask too.
    const tsCall = vm.runInContext('Function.prototype.toString.call(fetch)', ctx);
    expect(tsCall).toBe('function fetch() { [native code] }');
    // 4) The interception fired exactly once with args + ret captured.
    expect(emitted).toHaveLength(1);
    const s = emitted[0] as Record<string, unknown>;
    expect(s.args).toEqual(['/api/x']);
    expect(s.ret).toBe('OK:/api/x');
    expect(s.target).toBe('fetch');
  });

  it('toString of the toString override itself also looks native', () => {
    const sh = makeStealthHook();
    const ctx = runInPage({
      __emit: () => {},
      fetch: function fetch() { return 0; },
    } as any, sh.renderPreload({ emitName: '__emit', wraps: [{ targetPath: 'fetch' }] }));
    const ts = vm.runInContext('Function.prototype.toString.toString()', ctx);
    expect(ts).toBe('function toString() { [native code] }');
  });

  it('exceptions from the original still throw, and the sample records them', () => {
    const sh = makeStealthHook();
    const emitted: any[] = [];
    const ctx = runInPage({
      __emit: (s: any) => emitted.push(s),
      fetch: function fetch() { throw new Error('boom'); },
    } as any, sh.renderPreload({ emitName: '__emit', wraps: [{ targetPath: 'fetch' }] }));
    let threw: unknown;
    try { vm.runInContext('fetch()', ctx); } catch (e) { threw = e; }
    expect((threw as Error).message).toBe('boom');
    expect(emitted[0].threw).toMatch(/boom/);
  });

  it('install failure (missing target) does not poison the page', () => {
    const sh = makeStealthHook();
    expect(() => runInPage(
      { __emit: () => {} } as any,
      sh.renderPreload({ emitName: '__emit', wraps: [{ targetPath: 'never.exists' }] }),
    )).not.toThrow();
  });
});

describe('stealthHook: timing neutraliser smooths debugger-pause spikes', () => {
  it('performance.now() never exceeds the maxGap delta even after a real-time jump', () => {
    const sh = makeStealthHook();
    let pretend = 1000;
    const ctx = vm.createContext({
      performance: { now: () => pretend },
      Date: { now: () => pretend },
      console,
    } as any);
    vm.runInContext(sh.neutraliseTiming({ maxGapMs: 5 }), ctx);
    // First call anchors virtNow at 1000.
    const t0 = vm.runInContext('performance.now()', ctx) as number;
    expect(t0).toBe(1000);
    // Real clock jumps 200ms (debugger pause). Reported delta is clamped to maxGap.
    pretend = 1200;
    const t1 = vm.runInContext('performance.now()', ctx) as number;
    expect(t1 - t0).toBeLessThanOrEqual(5);
  });

  it('subsequent small ticks still advance smoothly', () => {
    const sh = makeStealthHook();
    let pretend = 0;
    const ctx = vm.createContext({
      performance: { now: () => pretend },
      Date: { now: () => pretend },
      console,
    } as any);
    vm.runInContext(sh.neutraliseTiming({ maxGapMs: 50 }), ctx);
    const a = vm.runInContext('performance.now()', ctx) as number;
    pretend += 3;
    const b = vm.runInContext('performance.now()', ctx) as number;
    pretend += 3;
    const c = vm.runInContext('performance.now()', ctx) as number;
    expect(b - a).toBe(3);
    expect(c - b).toBe(3);
  });
});
