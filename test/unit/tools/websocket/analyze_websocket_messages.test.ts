import { describe, it, expect, vi } from 'vitest';
import { analyze_websocket_messages } from '../../../../src/tools/websocket/analyze_websocket_messages.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('analyze_websocket_messages', () => {
  it('clusters frames by signature, sorted descending by count', async () => {
    const obs = { getFrames: vi.fn().mockReturnValue([
      { ts: 1, dir: 'in', data: 'ping', source: 'preload-hook' },
      { ts: 2, dir: 'in', data: 'ping', source: 'preload-hook' },
      { ts: 3, dir: 'in', data: '{"event":"chat","msg":"hello"}', source: 'preload-hook' },
    ]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    const r = await executeTool(analyze_websocket_messages, { wsid: 'w1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.groups.length).toBeGreaterThanOrEqual(2);
      expect(r.data.groups[0]?.count).toBe(2);
    }
  });
});
