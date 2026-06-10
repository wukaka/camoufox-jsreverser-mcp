import { describe, it, expect, vi } from 'vitest';
import { inspect_object } from '../../../../src/tools/debugger/inspect_object.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('inspect_object', () => {
  it('inspects by actor id', async () => {
    const oi = {
      inspect: vi.fn().mockReturnValue({ actor: 'obj-1', class: 'Object', preview: { ownPropertyCount: 2 } }),
      prototypeAndProperties: vi.fn().mockResolvedValue({
        actor: 'obj-1', class: 'Object', prototype: null, properties: [], internalSlots: {},
      }),
      getInternalSlots: vi.fn(),
    };
    const session = { isReady: () => true, caps: { objectInspector: oi } } as any;
    const r = await executeTool(inspect_object, { actor: 'obj-1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.inspect.actor).toBe('obj-1');
    expect(oi.getInternalSlots).not.toHaveBeenCalled();
  });

  it('inspects by full grip and fetches internal slots when requested', async () => {
    const oi = {
      inspect: vi.fn().mockReturnValue({ actor: 'obj-2', class: 'Function', preview: null }),
      prototypeAndProperties: vi.fn().mockResolvedValue({
        actor: 'obj-2', class: 'Function', prototype: null, properties: [], internalSlots: {},
      }),
      getInternalSlots: vi.fn().mockResolvedValue({ '[[BoundTargetFunction]]': { type: 'object', actor: 't' } }),
    };
    const session = { isReady: () => true, caps: { objectInspector: oi } } as any;
    const r = await executeTool(inspect_object, {
      grip: { type: 'object', actor: 'obj-2', class: 'Function' },
      withInternalSlots: true,
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.internalSlots?.['[[BoundTargetFunction]]']).toBeDefined();
  });

  it('bad_args when neither grip nor actor provided', async () => {
    const session = { isReady: () => true, caps: { objectInspector: {} } } as any;
    const r = await executeTool(inspect_object, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_args');
  });
});
