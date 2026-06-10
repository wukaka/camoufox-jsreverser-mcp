import { describe, it, expect, vi } from 'vitest';
import { makePreloadInjector } from '../../../src/capabilities/preloadInjector.js';

describe('preloadInjector', () => {
  it('add() sends script.addPreloadScript with functionDeclaration', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ script: 'preload-1' }) };
    const sh = { callFunction: vi.fn() };
    const inj = makePreloadInjector(bidi as any, sh as any);
    const id = await inj.add(`window.x = 1;`);
    expect(bidi.send).toHaveBeenCalledWith('script.addPreloadScript', {
      functionDeclaration: '() => { window.x = 1; }',
    });
    expect(id).toBe('preload-1');
  });

  it('add() with contexts forwards contexts param', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ script: 'preload-2' }) };
    const sh = { callFunction: vi.fn() };
    const inj = makePreloadInjector(bidi as any, sh as any);
    await inj.add(`a;`, { contexts: ['c1', 'c2'] });
    expect(bidi.send).toHaveBeenCalledWith('script.addPreloadScript', {
      functionDeclaration: '() => { a; }',
      contexts: ['c1', 'c2'],
    });
  });

  it('add() with sandbox forwards sandbox param', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ script: 'p3' }) };
    const sh = { callFunction: vi.fn() };
    const inj = makePreloadInjector(bidi as any, sh as any);
    await inj.add(`a;`, { sandbox: 'stealth' });
    expect(bidi.send).toHaveBeenCalledWith('script.addPreloadScript', {
      functionDeclaration: '() => { a; }',
      sandbox: 'stealth',
    });
  });

  it('addToWorker() uses scriptHost.callFunction on the worker realm', async () => {
    const bidi = { send: vi.fn() };
    const sh = { callFunction: vi.fn().mockResolvedValue({ result: { value: undefined } }) };
    const inj = makePreloadInjector(bidi as any, sh as any);
    const r = await inj.addToWorker(`self.x = 1;`, 'worker-realm-1');
    expect(sh.callFunction).toHaveBeenCalledWith(
      'worker-realm-1',
      '() => { self.x = 1; }',
      [],
      { awaitPromise: false },
    );
    expect(r.injectedAt).toBe('post-start');
    // BiDi addPreloadScript was NOT called for the worker path
    expect(bidi.send).not.toHaveBeenCalled();
  });

  it('addToWorker() surfaces injection failure as a thrown error', async () => {
    const sh = {
      callFunction: vi.fn().mockResolvedValue({ result: undefined, exceptionDetails: { text: 'self is undefined' } }),
    };
    const inj = makePreloadInjector({ send: vi.fn() } as any, sh as any);
    await expect(inj.addToWorker(`x;`, 'w1')).rejects.toThrow(/self is undefined/);
  });

  it('remove() calls script.removePreloadScript with the id', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({}) };
    const inj = makePreloadInjector(bidi as any, { callFunction: vi.fn() } as any);
    await inj.remove('preload-1');
    expect(bidi.send).toHaveBeenCalledWith('script.removePreloadScript', { script: 'preload-1' });
  });
});
