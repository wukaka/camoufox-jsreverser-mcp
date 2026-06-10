import { describe, it, expect, vi } from 'vitest';
import { get_websocket_messages } from '../../../../src/tools/websocket/get_websocket_messages.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_websocket_messages', () => {
  it('returns frames and forwards filter args', async () => {
    const obs = { getFrames: vi.fn().mockReturnValue([
      { ts: 1, dir: 'out', data: 'a', source: 'preload-hook' },
    ]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    const r = await executeTool(get_websocket_messages, { wsid: 'w1', limit: 10 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.frames).toHaveLength(1);
    expect(obs.getFrames).toHaveBeenCalledWith('w1', { limit: 10, since: undefined, dir: undefined });
  });
});
