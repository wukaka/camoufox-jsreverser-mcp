import { describe, it, expect, vi } from 'vitest';
import { new_page } from '../../../../src/tools/page-state/new_page.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('new_page', () => {
  it('opens with given url', async () => {
    const session = {
      isReady: () => true,
      caps: { pageController: { createPage: vi.fn().mockResolvedValue('ctx-new') } },
    } as any;
    const r = await executeTool(new_page, { url: 'https://example.com' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.contextId).toBe('ctx-new');
    expect(session.caps.pageController.createPage).toHaveBeenCalledWith({ url: 'https://example.com', background: undefined });
  });

  it('opens blank when url omitted', async () => {
    const session = {
      isReady: () => true,
      caps: { pageController: { createPage: vi.fn().mockResolvedValue('ctx-blank') } },
    } as any;
    const r = await executeTool(new_page, {}, session);
    expect(r.ok).toBe(true);
  });
});
