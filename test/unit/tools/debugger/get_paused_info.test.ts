import { describe, it, expect, vi } from 'vitest';
import { get_paused_info } from '../../../../src/tools/debugger/get_paused_info.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('get_paused_info', () => {
  it('returns pausedInfo when paused', async () => {
    const info = {
      threadActor: 'thread1', pauseActor: 'pause1', frameActor: 'frame1',
      why: { type: 'breakpoint' },
      currentFrame: { where: { source: { url: 'https://a' }, line: 15 } },
    };
    const pc = { getPausedInfo: vi.fn().mockReturnValue(info) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(get_paused_info, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pausedInfo).toBe(info);
  });

  it('returns not_paused error when not paused', async () => {
    const pc = { getPausedInfo: vi.fn().mockReturnValue(null) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(get_paused_info, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_paused');
  });
});
