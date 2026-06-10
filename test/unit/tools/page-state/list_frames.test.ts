import { describe, it, expect, vi } from 'vitest';
import { list_frames } from '../../../../src/tools/page-state/list_frames.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_frames', () => {
  it('flattens the browsing context tree under the active page', async () => {
    const pc = { listContexts: vi.fn().mockResolvedValue([
      { context: 'top', url: 'https://a', children: [
        { context: 'iframe-1', url: 'https://a/inner', children: [] },
        { context: 'iframe-2', url: 'https://other', children: [] },
      ] },
    ]) };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: 'top' } as any;
    const r = await executeTool(list_frames, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.frames.map((f: any) => f.contextId)).toEqual(['top', 'iframe-1', 'iframe-2']);
  });

  it('returns target_not_found when no active context', async () => {
    const pc = { listContexts: vi.fn().mockResolvedValue([]) };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: null } as any;
    const r = await executeTool(list_frames, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
