import { describe, it, expect } from 'vitest';
import { select_page } from '../../../../src/tools/page-state/select_page.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('select_page', () => {
  it('sets session.activeContextId', async () => {
    const session = { isReady: () => true, caps: {}, activeContextId: null } as any;
    const r = await executeTool(select_page, { contextId: 'ctx-7' }, session);
    expect(r.ok).toBe(true);
    expect(session.activeContextId).toBe('ctx-7');
  });
});
