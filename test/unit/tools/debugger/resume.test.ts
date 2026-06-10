import { describe, it, expect, vi } from 'vitest';
import { resume } from '../../../../src/tools/debugger/resume.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('resume', () => {
  it('calls pauseController.resume and returns empty data', async () => {
    const pc = { resume: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(resume, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({});
    expect(pc.resume).toHaveBeenCalledOnce();
  });

  it('propagates errors from resume via translateError', async () => {
    const pc = { resume: vi.fn().mockRejectedValue(new Error('not paused')) };
    const session = { isReady: () => true, caps: { pauseController: pc } } as any;
    const r = await executeTool(resume, {}, session);
    // translateError converts unknown errors — result is not ok
    expect(r.ok).toBe(false);
  });
});
