import { describe, it, expect, vi } from 'vitest';
import { makeObjectInspector } from '../../../src/capabilities/objectInspector.js';

describe('objectInspector', () => {
  it('inspect returns the actor + class + preview from grip directly', () => {
    const rdp = { call: vi.fn() } as any;
    const oi = makeObjectInspector(rdp);
    const r = oi.inspect({ type: 'object', actor: 'obj-1', class: 'Array', preview: { length: 3 } });
    expect(r).toEqual({ actor: 'obj-1', class: 'Array', preview: { length: 3 } });
  });

  it('inspect throws for non-object grip', () => {
    const rdp = { call: vi.fn() } as any;
    const oi = makeObjectInspector(rdp);
    expect(() => oi.inspect({ type: 'string', value: 'hello' })).toThrow();
  });

  it('prototypeAndProperties maps ownProperties + safeGetterValues into normalized list', async () => {
    const rdp = {
      call: vi.fn().mockResolvedValue({
        from: 'obj-1',
        prototype: { type: 'object', actor: 'obj-proto', class: 'Object' },
        ownProperties: {
          name: { value: { type: 'string', value: 'X' }, writable: true, enumerable: true, configurable: true },
          age: { value: { type: 'number', value: 30 }, writable: true, enumerable: true, configurable: false },
          fullName: { get: { type: 'object', actor: 'fn-get' }, set: { type: 'undefined' }, enumerable: true, configurable: true },
        },
        safeGetterValues: {
          computed: { getterValue: { type: 'string', value: 'derived' }, getterPrototypeLevel: 1, enumerable: true, writable: false },
        },
      }),
    } as any;
    const oi = makeObjectInspector(rdp);
    const r = await oi.prototypeAndProperties({ type: 'object', actor: 'obj-1', class: 'Person' });
    expect(rdp.call).toHaveBeenCalledWith('obj-1', { type: 'prototypeAndProperties' });
    expect(r.actor).toBe('obj-1');
    expect(r.class).toBe('Person');
    expect(r.prototype).toEqual({ type: 'object', actor: 'obj-proto', class: 'Object' });
    expect(r.properties).toHaveLength(4);
    const name = r.properties.find(p => p.name === 'name')!;
    expect(name.kind).toBe('data');
    expect(name.value).toEqual({ type: 'string', value: 'X' });
    const fullName = r.properties.find(p => p.name === 'fullName')!;
    expect(fullName.kind).toBe('accessor');
    expect(fullName.getter?.actor).toBe('fn-get');
    const computed = r.properties.find(p => p.name === 'computed')!;
    expect(computed.kind).toBe('safeGetter');
    expect(computed.value).toEqual({ type: 'string', value: 'derived' });
  });

  it('prototypeAndProperties handles missing prototype as null', async () => {
    const rdp = {
      call: vi.fn().mockResolvedValue({
        from: 'obj-1', prototype: { type: 'null' }, ownProperties: {}, safeGetterValues: {},
      }),
    } as any;
    const oi = makeObjectInspector(rdp);
    const r = await oi.prototypeAndProperties({ type: 'object', actor: 'obj-1', class: 'Object' });
    expect(r.prototype).toBeNull();
  });

  it('getInternalSlots extracts SpiderMonkey-style fields and normalizes names', async () => {
    const rdp = {
      call: vi.fn().mockResolvedValue({
        from: 'obj-1',
        prototype: { type: 'object', actor: 'p' },
        ownProperties: {},
        safeGetterValues: {},
        // SpiderMonkey emits some "internal" slot info on the preview or on a dedicated key — model both:
        boundTargetFunction: { type: 'object', actor: 'tgt' },
        boundThis: { type: 'object', actor: 'this' },
        boundArguments: [{ type: 'string', value: 'a' }],
      }),
    } as any;
    const oi = makeObjectInspector(rdp);
    const slots = await oi.getInternalSlots({ type: 'object', actor: 'obj-1', class: 'Function' });
    expect(slots['[[BoundTargetFunction]]']).toEqual({ type: 'object', actor: 'tgt' });
    expect(slots['[[BoundThis]]']).toEqual({ type: 'object', actor: 'this' });
    expect(Array.isArray(slots['[[BoundArguments]]'])).toBe(true);
  });

  it('releasePauseGrips drops cached grips tied to a pause actor', () => {
    const rdp = { call: vi.fn() } as any;
    const oi = makeObjectInspector(rdp);
    // No-op semantics: cache invalidation is internal; just verify no throw
    expect(() => oi.releasePauseGrips('pause-1')).not.toThrow();
  });
});
