import { describe, it, expect, vi } from 'vitest';
import { step_over } from '../../../../src/tools/debugger/step_over.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('step_over', () => {
  it('calls pauseController.stepOver and returns pausedInfo', async () => {
    const info = {
      threadActor: 'thread1', pauseActor: 'pause1', frameActor: 'frame1',
      why: { type: 'resumeLimit' },
      currentFrame: { where: { source: { url: 'https://a' }, line: 6 } },
    };
    const pc = {
      stepOver: vi.fn().mockResolvedValue(undefined),
      getPausedInfo: vi.fn().mockReturnValue(info),
    };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(step_over, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.pausedInfo).toBe(info);
    expect(pc.stepOver).toHaveBeenCalledOnce();
  });
});
