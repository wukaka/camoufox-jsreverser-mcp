import { describe, it, expect, vi } from 'vitest';
import { find_clickable_elements } from '../../../../src/tools/dom/find_clickable_elements.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('find_clickable_elements', () => {
  it('queries with fixed clickable selector', async () => {
    const da = { query: vi.fn().mockResolvedValue([{ sharedId: 'btn1' }, { sharedId: 'a1' }]) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(find_clickable_elements, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.nodes).toHaveLength(2);
      expect(r.data.selector).toContain('button');
      expect(r.data.selector).toContain('input[type="submit"]');
    }
    expect(da.query).toHaveBeenCalledWith('c1', expect.stringContaining('button'));
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { domAccess: { query: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(find_clickable_elements, {}, session);
    expect(r.ok).toBe(false);
  });
});
