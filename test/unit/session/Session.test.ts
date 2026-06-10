import { describe, it, expect, vi } from 'vitest';
import { Session } from '../../../src/session/Session.js';

describe('Session', () => {
  it('init in launch mode wires BidiDriver, defers RDP', async () => {
    const launcher = {
      launch: vi.fn().mockResolvedValue({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: '/tmp/x' }),
      attach: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const bidi = { close: vi.fn() };
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
    const makeBidi = vi.fn().mockResolvedValue({ close: vi.fn() });
    const rdp = { close: vi.fn() };
    const makeRdp = vi.fn().mockResolvedValue(rdp);
    const s = new Session({ launcher: launcher as any, makeBidi, makeRdp });
    await s.init({ mode: 'launch' });
    const r1 = await s.ensureRdp();
    const r2 = await s.ensureRdp();
    expect(r1).toBe(r2);
    expect(makeRdp).toHaveBeenCalledTimes(1);
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
    const bidi = { close: vi.fn() };
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
    const bidi = {
      send: vi.fn().mockImplementation(async (method: string, params: unknown) => {
        bidiSends.push({ method, params });
        if (method === 'script.addPreloadScript') return { script: 'preload-1' };
        return {};
      }),
      close: vi.fn(),
    };
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
    const bidi = {
      send: vi.fn().mockImplementation(async (method: string) => {
        bidiSends.push({ method });
        return {};
      }),
      close: vi.fn(),
    };
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
    const bidi = {
      send: vi.fn().mockImplementation(async (method: string) => {
        if (method === 'script.addPreloadScript') throw new Error('boom');
        return {};
      }),
      close: vi.fn(),
    };
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
