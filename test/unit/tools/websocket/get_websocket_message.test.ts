import { describe, it, expect, vi } from 'vitest';
import { get_websocket_message } from '../../../../src/tools/websocket/get_websocket_message.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_websocket_message', () => {
  it('returns single frame by index', async () => {
    const obs = { getFrames: vi.fn().mockReturnValue([
      { ts: 1, dir: 'out', data: 'a', source: 'preload-hook' },
      { ts: 2, dir: 'in', data: 'b', source: 'preload-hook' },
    ]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    const r = await executeTool(get_websocket_message, { wsid: 'w1', frameIndex: 1 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.frame as any).dir).toBe('in');
  });

  it('resource_not_found for out-of-range index', async () => {
    const obs = { getFrames: vi.fn().mockReturnValue([]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    const r = await executeTool(get_websocket_message, { wsid: 'w1', frameIndex: 0 }, session);
    expect(r.ok).toBe(false);
  });
});
