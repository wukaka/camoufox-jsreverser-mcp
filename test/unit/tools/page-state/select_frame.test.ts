import { describe, it, expect } from 'vitest';
import { select_frame } from '../../../../src/tools/page-state/select_frame.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('select_frame', () => {
  it('sets activeFrameContextId', async () => {
    const session = { isReady: () => true, caps: {}, activeFrameContextId: null } as any;
    const r = await executeTool(select_frame, { frameContextId: 'iframe-1' }, session);
    expect(r.ok).toBe(true);
    expect(session.activeFrameContextId).toBe('iframe-1');
  });
});
