import { describe, it, expect, vi } from 'vitest';
import { list_pages } from '../../../../src/tools/page-state/list_pages.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_pages', () => {
  it('returns contexts from pageController.listContexts', async () => {
    const session = {
      isReady: () => true,
      caps: { pageController: { listContexts: vi.fn().mockResolvedValue([
        { context: 'c1', url: 'https://a', children: [] },
        { context: 'c2', url: 'https://b', children: [] },
      ]) } },
    } as any;
    const r = await executeTool(list_pages, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.contexts).toHaveLength(2);
  });
});
