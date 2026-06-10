import { describe, it, expect, vi } from 'vitest';
import { navigate_page } from '../../../../src/tools/page-state/navigate_page.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('navigate_page', () => {
  it('navigates to a url', async () => {
    const pc = {
      navigate: vi.fn().mockResolvedValue({ navigation: 'nav1', url: 'https://a' }),
      reload: vi.fn(),
      traverseHistory: vi.fn(),
    };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: 'c1' } as any;
    const r = await executeTool(navigate_page, { action: 'navigate', url: 'https://a' }, session);
    expect(r.ok).toBe(true);
    expect(pc.navigate).toHaveBeenCalledWith('c1', 'https://a', undefined);
  });

  it('reload action calls reload', async () => {
    const pc = { reload: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(), traverseHistory: vi.fn() };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: 'c1' } as any;
    const r = await executeTool(navigate_page, { action: 'reload' }, session);
    expect(r.ok).toBe(true);
    expect(pc.reload).toHaveBeenCalledWith('c1');
  });

  it('back action calls traverseHistory(-1)', async () => {
    const pc = { reload: vi.fn(), navigate: vi.fn(), traverseHistory: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: 'c1' } as any;
    await executeTool(navigate_page, { action: 'back' }, session);
    expect(pc.traverseHistory).toHaveBeenCalledWith('c1', -1);
  });

  it('navigate action without url returns bad_args', async () => {
    const session = { isReady: () => true, caps: { pageController: {} }, activeContextId: 'c1' } as any;
    const r = await executeTool(navigate_page, { action: 'navigate' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });

  it('returns target_not_found-ish when no active context', async () => {
    const pc = { reload: vi.fn() };
    const session = { isReady: () => true, caps: { pageController: pc }, activeContextId: null } as any;
    const r = await executeTool(navigate_page, { action: 'reload' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('target_not_found');
  });
});
