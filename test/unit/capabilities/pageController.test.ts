import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makePageController } from '../../../src/capabilities/pageController.js';

function fakeBidi() {
  const ee = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  ee.send = vi.fn().mockResolvedValue({});
  return ee;
}

describe('pageController', () => {
  it('listContexts returns tree from browsingContext.getTree', async () => {
    const bidi = fakeBidi();
    const tree = [{ context: 'ctx-1', url: 'about:blank', children: [] }];
    bidi.send.mockResolvedValueOnce({ contexts: tree });
    const pc = makePageController(bidi as any);
    const result = await pc.listContexts();
    expect(result).toEqual(tree);
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.getTree', {});
  });

  it('createPage returns context id from browsingContext.create', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ context: 'ctx-new' });
    const pc = makePageController(bidi as any);
    const id = await pc.createPage({ url: 'https://example.com', background: false });
    expect(id).toBe('ctx-new');
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.create', {
      type: 'tab',
      url: 'https://example.com',
      background: false,
    });
  });

  it('navigate defaults wait param to "complete"', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ navigation: 'nav-1', url: 'https://example.com/' });
    const pc = makePageController(bidi as any);
    const r = await pc.navigate('ctx-1', 'https://example.com/');
    expect(r).toEqual({ navigation: 'nav-1', url: 'https://example.com/' });
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.navigate', {
      context: 'ctx-1',
      url: 'https://example.com/',
      wait: 'complete',
    });
  });

  it('navigate passes explicit wait param through', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ navigation: null, url: 'https://a.com/' });
    const pc = makePageController(bidi as any);
    await pc.navigate('ctx-1', 'https://a.com/', 'none');
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.navigate', {
      context: 'ctx-1',
      url: 'https://a.com/',
      wait: 'none',
    });
  });

  it('screenshot forwards context and opts to browsingContext.captureScreenshot', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ data: 'base64encodedimage==' });
    const pc = makePageController(bidi as any);
    const r = await pc.screenshot('ctx-1', { format: { type: 'png' } });
    expect(r.data).toBe('base64encodedimage==');
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.captureScreenshot', {
      context: 'ctx-1',
      format: { type: 'png' },
    });
  });

  it('closePage calls browsingContext.close with the context id', async () => {
    const bidi = fakeBidi();
    const pc = makePageController(bidi as any);
    await pc.closePage('ctx-5');
    expect(bidi.send).toHaveBeenCalledWith('browsingContext.close', { context: 'ctx-5' });
  });
});
