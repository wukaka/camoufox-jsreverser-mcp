import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeDomAccess } from '../../../src/capabilities/domAccess.js';
import type { ScriptHost } from '../../../src/capabilities/types.js';

function fakeBidi() {
  const ee = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  ee.send = vi.fn().mockResolvedValue({});
  return ee;
}

function fakeScripts(): ScriptHost & { evaluate: ReturnType<typeof vi.fn>; callFunction: ReturnType<typeof vi.fn> } {
  return {
    listRealms: vi.fn().mockResolvedValue([
      { realmId: 'realm-window', origin: 'https://example.com', type: 'window' as const },
    ]),
    evaluate: vi.fn().mockResolvedValue({ result: null }),
    callFunction: vi.fn().mockResolvedValue({ result: null }),
  };
}

describe('domAccess', () => {
  it('query maps locateNodes result into NodeRef array', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    bidi.send.mockResolvedValueOnce({
      nodes: [
        { sharedId: 'node-1', type: 'node' },
        { sharedId: 'node-2', type: 'node' },
      ],
    });
    const dom = makeDomAccess(bidi as any, scripts);
    const refs = await dom.query('ctx-1', '.btn');
    expect(refs).toEqual([{ sharedId: 'node-1' }, { sharedId: 'node-2' }]);
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.locateNodes', {
      context: 'ctx-1',
      locator: { type: 'css', value: '.btn' },
    });
  });

  it('query returns empty array when locateNodes returns no nodes', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    bidi.send.mockResolvedValueOnce({ nodes: [] });
    const dom = makeDomAccess(bidi as any, scripts);
    const refs = await dom.query('ctx-1', '.missing');
    expect(refs).toEqual([]);
  });

  it('click performs pointer actions on the element origin', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    const dom = makeDomAccess(bidi as any, scripts);
    await dom.click('ctx-1', 'node-abc');
    expect(bidi.send).toHaveBeenCalledWith('input.performActions', {
      context: 'ctx-1',
      actions: [
        {
          type: 'pointer',
          id: 'mouse',
          actions: [
            { type: 'pointerMove', x: 0, y: 0, origin: { type: 'element', element: { sharedId: 'node-abc' } } },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  });

  it('type uses synthetic value assignment via scriptHost (v1 behaviour, documented trade-off)', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    // v1: sets value + dispatches input/change events via scriptHost.evaluate
    scripts.evaluate.mockResolvedValue({ result: null });
    const dom = makeDomAccess(bidi as any, scripts);
    await dom.type('ctx-1', 'node-xyz', 'hello');
    // v1 must call evaluate with the sharedId and value
    expect(scripts.evaluate).toHaveBeenCalled();
  });

  it('waitFor resolves immediately when query returns a node', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    bidi.send.mockResolvedValueOnce({ nodes: [{ sharedId: 'node-found', type: 'node' }] });
    const dom = makeDomAccess(bidi as any, scripts);
    const ref = await dom.waitFor('ctx-1', '#target', { timeoutMs: 1000 });
    expect(ref.sharedId).toBe('node-found');
  });

  it('waitFor rejects after timeout when no node is found', async () => {
    const bidi = fakeBidi();
    const scripts = fakeScripts();
    // always returns empty
    bidi.send.mockResolvedValue({ nodes: [] });
    const dom = makeDomAccess(bidi as any, scripts);
    await expect(dom.waitFor('ctx-1', '.never', { timeoutMs: 150 })).rejects.toThrow();
  });
});
