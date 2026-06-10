import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { ObjectInspector, ObjectInspection, RdpGrip, InspectedProperty } from './types.js';

interface RdpDescriptor {
  value?: RdpGrip;
  get?: RdpGrip;
  set?: RdpGrip;
  writable?: boolean;
  enumerable?: boolean;
  configurable?: boolean;
}

interface SafeGetterValue {
  getterValue: RdpGrip;
  getterPrototypeLevel: number;
  enumerable?: boolean;
  writable?: boolean;
}

interface ProtoAndProps {
  prototype: RdpGrip | { type: 'null' } | null;
  ownProperties: Record<string, RdpDescriptor>;
  safeGetterValues?: Record<string, SafeGetterValue>;
  [k: string]: unknown;
}

// SpiderMonkey internal field names → ECMAScript spec [[InternalSlot]] mapping.
const INTERNAL_SLOT_MAP: Record<string, string> = {
  boundTargetFunction: '[[BoundTargetFunction]]',
  boundThis: '[[BoundThis]]',
  boundArguments: '[[BoundArguments]]',
  proxyTarget: '[[ProxyTarget]]',
  proxyHandler: '[[ProxyHandler]]',
  primitiveValue: '[[PrimitiveValue]]',
  wrappedDate: '[[DateValue]]',
};

export function makeObjectInspector(rdp: RdpDriver): ObjectInspector {
  return {
    inspect(grip) {
      if (grip.type !== 'object') {
        throw new Error(`objectInspector.inspect: not an object grip (type=${grip.type})`);
      }
      return {
        actor: grip.actor ?? '',
        class: grip.class ?? 'Object',
        preview: grip.preview ?? null,
      };
    },

    async prototypeAndProperties(grip) {
      if (grip.type !== 'object' || !grip.actor) {
        throw new Error(`objectInspector.prototypeAndProperties: not an object grip (type=${grip.type})`);
      }
      const reply = await rdp.call<ProtoAndProps>(grip.actor, { type: 'prototypeAndProperties' });
      const proto = reply.prototype && (reply.prototype as { type?: string }).type === 'null'
        ? null
        : (reply.prototype as RdpGrip);

      const props: InspectedProperty[] = [];
      for (const [name, desc] of Object.entries(reply.ownProperties ?? {})) {
        if (desc.get !== undefined || desc.set !== undefined) {
          props.push({
            name, kind: 'accessor',
            getter: desc.get,
            setter: desc.set,
            enumerable: desc.enumerable,
            configurable: desc.configurable,
          });
        } else {
          props.push({
            name, kind: 'data',
            value: desc.value,
            writable: desc.writable,
            enumerable: desc.enumerable,
            configurable: desc.configurable,
          });
        }
      }
      for (const [name, sgv] of Object.entries(reply.safeGetterValues ?? {})) {
        props.push({
          name, kind: 'safeGetter',
          value: sgv.getterValue,
          writable: sgv.writable,
          enumerable: sgv.enumerable,
        });
      }

      return {
        actor: grip.actor,
        class: grip.class ?? 'Object',
        prototype: proto,
        properties: props,
        internalSlots: {},
      } as ObjectInspection;
    },

    async getInternalSlots(grip) {
      if (grip.type !== 'object' || !grip.actor) {
        throw new Error(`objectInspector.getInternalSlots: not an object grip (type=${grip.type})`);
      }
      const reply = await rdp.call<Record<string, unknown>>(grip.actor, { type: 'prototypeAndProperties' });
      const slots: Record<string, unknown> = {};
      for (const [smName, eSName] of Object.entries(INTERNAL_SLOT_MAP)) {
        if (smName in reply) {
          slots[eSName] = reply[smName];
        }
      }
      return slots;
    },

    releasePauseGrips(_pauseActor) {
      // No-op in v1: grip lifetime is bound to pauseActor server-side already.
      // M3.05+ may add a local cache that we'd invalidate here.
    },
  };
}
