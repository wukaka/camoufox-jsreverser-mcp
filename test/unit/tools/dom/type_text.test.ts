import { describe, it, expect, vi } from 'vitest';
import { type_text } from '../../../../src/tools/dom/type_text.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('type_text', () => {
  it('calls domAccess.type and returns sharedId + text', async () => {
    const da = { type: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    const r = await executeTool(type_text, { sharedId: 'inp1', text: 'hello' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sharedId).toBe('inp1');
      expect(r.data.text).toBe('hello');
    }
    expect(da.type).toHaveBeenCalledWith('c1', 'inp1', 'hello', { clearFirst: undefined });
  });

  it('passes clearFirst option', async () => {
    const da = { type: vi.fn().mockResolvedValue(undefined) };
    const session = { isReady: () => true, caps: { domAccess: da }, activeContextId: 'c1' } as any;
    await executeTool(type_text, { sharedId: 'inp1', text: 'world', clearFirst: true }, session);
    expect(da.type).toHaveBeenCalledWith('c1', 'inp1', 'world', { clearFirst: true });
  });

  it('target_not_found without active context', async () => {
    const session = { isReady: () => true, caps: { domAccess: { type: vi.fn() } }, activeContextId: null } as any;
    const r = await executeTool(type_text, { sharedId: 'inp1', text: 'hi' }, session);
    expect(r.ok).toBe(false);
  });
});
