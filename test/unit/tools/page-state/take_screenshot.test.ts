import { describe, it, expect, vi } from 'vitest';
import { take_screenshot } from '../../../../src/tools/page-state/take_screenshot.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('take_screenshot', () => {
  it('returns base64 screenshot from pageController.screenshot', async () => {
    const pc = { screenshot: vi.fn().mockResolvedValue({ data: 'b64data' }) };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: 'c1' } as any;
    const r = await executeTool(take_screenshot, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.data).toBe('b64data');
  });

  it('returns target_not_found with no active context', async () => {
    const session = { isReady: () => true, caps: { pageController: {} }, activeContextId: null } as any;
    const r = await executeTool(take_screenshot, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
