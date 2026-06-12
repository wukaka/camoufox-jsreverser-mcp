import { describe, it, expect, vi } from 'vitest';
import { Session } from '../../../src/session/Session.js';

/** Build a fake BiDi driver with the EventEmitter surface that capability factories
 *  exercise during Session.init (on / off / emit / subscribe / send / close). */
function fakeBidi(overrides: Partial<{ send: ReturnType<typeof vi.fn> }> = {}): any {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    send: overrides.send ?? vi.fn().mockResolvedValue({}),
    close: vi.fn(),
  };
}

/** Minimal RDP driver surface needed by Session.ensureRdp + bootstrapRdp. The fake
 *  resolves every call() with placeholder actor names so bootstrap can build a tree. */
function fakeRdp(): any {
  return {
    awaitGreeting: vi.fn().mockResolvedValue({ from: 'root' }),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    call: vi.fn().mockImplementation(async (_actor: string, req: { type: string }) => {
      switch (req.type) {
        case 'getRoot':    return { preferenceActor: 'prefActor-1', perfActor: 'perfActor-1' };
        case 'listTabs':   return { tabs: [{ actor: 'tabDesc-1', selected: true }] };
        case 'getTarget':  return { frame: { actor: 'targetActor-1', threadActor: 'thread-1' } };
        case 'getWatcher': return { actor: 'watcher-1' };
        default:           return {};
      }
    }),
  };
}

describe('Session', () => {
  it('init in launch mode wires BidiDriver, defers RDP', async () => {
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const bidi = fakeBidi();
    const makeBidi = vi.fn().mockResolvedValue(bidi);
    const makeRdp = vi.fn().mockResolvedValue({ close: vi.fn() });
    const s = new Session({ launcher: launcher as any, makeBidi, makeRdp });
    await s.init({ mode: 'launch' });
    expect(s.isReady()).toBe(true);
    expect(makeBidi).toHaveBeenCalledWith('ws://x');
    expect(makeRdp).not.toHaveBeenCalled();
  });

  it('ensureRdp lazily connects once', async () => {
    const launcher = { launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }), attach: vi.fn(), shutdown: vi.fn() };
    const makeBidi = vi.fn().mockResolvedValue(fakeBidi());
    const rdp = fakeRdp();
    const makeRdp = vi.fn().mockResolvedValue(rdp);
    const s = new Session({ launcher: launcher as any, makeBidi, makeRdp });
    await s.init({ mode: 'launch' });
    const r1 = await s.ensureRdp();
    const r2 = await s.ensureRdp();
    expect(r1).toBe(r2);
    expect(makeRdp).toHaveBeenCalledTimes(1);
    // Greeting was consumed exactly once.
    expect(rdp.awaitGreeting).toHaveBeenCalledTimes(1);
  });

  it('emitName is per session random', () => {
    const launcher = { launch: vi.fn(), attach: vi.fn(), shutdown: vi.fn() };
    const s1 = new Session({ launcher: launcher as any, makeBidi: vi.fn(), makeRdp: vi.fn() });
    const s2 = new Session({ launcher: launcher as any, makeBidi: vi.fn(), makeRdp: vi.fn() });
    expect(s1.emitName).not.toBe(s2.emitName);
  });

  it('attach mode without endpoints throws', async () => {
    const launcher = { launch: vi.fn(), attach: vi.fn(), shutdown: vi.fn() };
    const s = new Session({ launcher: launcher as any, makeBidi: vi.fn(), makeRdp: vi.fn() });
    await expect(s.init({ mode: 'attach' })).rejects.toThrow(/attach mode requires/);
  });

  it('shutdown calls launcher.shutdown and clears ready flag', async () => {
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const bidi = fakeBidi();
    const s = new Session({ launcher: launcher as any, makeBidi: vi.fn().mockResolvedValue(bidi), makeRdp: vi.fn() });
    await s.init({ mode: 'launch' });
    await s.shutdown();
    expect(bidi.close).toHaveBeenCalled();
    expect(launcher.shutdown).toHaveBeenCalled();
    expect(s.isReady()).toBe(false);
  });

  it('init with stealth=auto wires caps and applies firefox-default preset', async () => {
    // mock bidi.send to record the preload call
    const bidiSends: Array<{ method: string; params: unknown }> = [];
    const bidi = fakeBidi({
      send: vi.fn().mockImplementation(async (method: string, params: unknown) => {
        bidiSends.push({ method, params });
        if (method === 'script.addPreloadScript') return { script: 'preload-1' };
        return {};
      }),
    });
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(), shutdown: vi.fn(),
    };
    const s = new Session({ launcher: launcher as any, makeBidi: vi.fn().mockResolvedValue(bidi), makeRdp: vi.fn() });
    await s.init({ mode: 'launch', stealth: 'auto' });
    // scriptHost / preloadInjector / stealth all wired
    expect(s.caps.scriptHost).toBeDefined();
    expect(s.caps.preloadInjector).toBeDefined();
    expect(s.caps.stealth).toBeDefined();
    // bidi.send was called for script.addPreloadScript with the firefox-default payload
    const preloadCall = bidiSends.find(c => c.method === 'script.addPreloadScript');
    expect(preloadCall).toBeDefined();
    expect((preloadCall!.params as { functionDeclaration: string }).functionDeclaration).toMatch(/webdriver/);
    expect(s.stealthApplyError).toBeNull();
  });

  it('init with stealth=off wires caps but does NOT apply preset', async () => {
    const bidiSends: Array<{ method: string }> = [];
    const bidi = fakeBidi({
      send: vi.fn().mockImplementation(async (method: string) => {
        bidiSends.push({ method });
        return {};
      }),
    });
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(), shutdown: vi.fn(),
    };
    const s = new Session({ launcher: launcher as any, makeBidi: vi.fn().mockResolvedValue(bidi), makeRdp: vi.fn() });
    await s.init({ mode: 'launch', stealth: 'off' });
    expect(s.caps.stealth).toBeDefined();
    const preloadCall = bidiSends.find(c => c.method === 'script.addPreloadScript');
    expect(preloadCall).toBeUndefined();
  });

  it('init records stealthApplyError when preset apply throws', async () => {
    const bidi = fakeBidi({
      send: vi.fn().mockImplementation(async (method: string) => {
        if (method === 'script.addPreloadScript') throw new Error('boom');
        return {};
      }),
    });
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(), shutdown: vi.fn(),
    };
    const s = new Session({ launcher: launcher as any, makeBidi: vi.fn().mockResolvedValue(bidi), makeRdp: vi.fn() });
    await s.init({ mode: 'launch', stealth: 'auto' });
    expect(s.isReady()).toBe(true);
    expect(s.stealthApplyError).toBeInstanceOf(Error);
  });
});

describe('Session worker-stealth unsubscribe tracking', () => {
  it('registerWorkerStealthUnsubscribe collects fns and shutdown runs them', async () => {
    const session = new Session({
      launcher: { shutdown: vi.fn().mockResolvedValue(undefined) } as any,
      makeBidi: vi.fn() as any,
      makeRdp: vi.fn() as any,
    });
    const a = vi.fn();
    const b = vi.fn();
    session.registerWorkerStealthUnsubscribe(a);
    session.registerWorkerStealthUnsubscribe(b);
    await session.shutdown();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
