import { describe, it, expect, vi } from 'vitest';
import { pause } from '../../../../src/tools/debugger/pause.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('pause', () => {
  it('calls pauseController.pause and returns pausedInfo', async () => {
    const info = {
      threadActor: 'thread1', pauseActor: 'pause1', frameActor: 'frame1',
      why: { type: 'clientRequest' },
      currentFrame: { where: { source: { url: 'https://a' }, line: 5 } },
    };
    const pc = {
      pause: vi.fn().mockResolvedValue(undefined),
      getPausedInfo: vi.fn().mockReturnValue(info),
    };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(pause, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pausedInfo).toBe(info);
    expect(pc.pause).toHaveBeenCalledOnce();
  });

  it('returns pausedInfo null if not yet paused after pause call', async () => {
    const pc = {
      pause: vi.fn().mockResolvedValue(undefined),
      getPausedInfo: vi.fn().mockReturnValue(null),
    };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(pause, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pausedInfo).toBeNull();
  });
});
