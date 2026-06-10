import { describe, it, expect, vi } from 'vitest';
import { makeStealth } from '../../../src/capabilities/stealth.js';

describe('stealth capability', () => {
  it('listFeatures returns the registered list', () => {
    const preload = { add: vi.fn(), addToWorker: vi.fn(), remove: vi.fn() };
    const s = makeStealth(preload);
    const feats = s.listFeatures();
    expect(feats.find(f => f.name === 'webdriver_false')).toBeDefined();
  });

  it('applyPreset(firefox-default) calls preload.add with the FIREFOX_DEFAULT_STEALTH payload', async () => {
    const preload = { add: vi.fn().mockResolvedValue('preload-1'), addToWorker: vi.fn(), remove: vi.fn() };
    const s = makeStealth(preload);
    const r = await s.applyPreset('firefox-default');
    expect(preload.add).toHaveBeenCalled();
    expect(preload.add.mock.calls[0][0]).toMatch(/webdriver/);
    expect(r.preset).toBe('firefox-default');
    expect(r.preloadIds).toEqual(['preload-1']);
  });

  it('applyPreset throws for unknown preset', async () => {
    const preload = { add: vi.fn(), addToWorker: vi.fn(), remove: vi.fn() };
    const s = makeStealth(preload);
    await expect(s.applyPreset('nope')).rejects.toThrow(/unknown preset/);
  });

  it('injectCustomScript wraps preload.add', async () => {
    const preload = { add: vi.fn().mockResolvedValue('p1'), addToWorker: vi.fn(), remove: vi.fn() };
    const s = makeStealth(preload);
    const r = await s.injectCustomScript('window.x = 1');
    expect(r.preloadId).toBe('p1');
  });
});
