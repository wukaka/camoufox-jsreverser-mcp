import { ZodTypeAny, ZodObject } from 'zod';

function unwrapEffects(s: ZodTypeAny): ZodTypeAny {
  let cur: ZodTypeAny = s;
  while (true) {
    const def = (cur as { _def?: { typeName?: string; schema?: ZodTypeAny; innerType?: ZodTypeAny } })._def;
    if (!def) return cur;
    if (def.typeName === 'ZodEffects' && def.schema) { cur = def.schema; continue; }
    if (def.typeName === 'ZodOptional' && def.innerType) { cur = def.innerType; continue; }
    if (def.typeName === 'ZodNullable' && def.innerType) { cur = def.innerType; continue; }
    return cur;
  }
}

export function zodToJsonSchema(schema: ZodTypeAny): unknown {
  const root = unwrapEffects(schema);
  if (root instanceof ZodObject) {
    const shape = root.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = singleZodToJson(v);
      if (!v.isOptional()) required.push(k);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return singleZodToJson(root);
}

function singleZodToJson(s: ZodTypeAny): unknown {
  const def = (s as { _def: { typeName: string; type?: ZodTypeAny; innerType?: ZodTypeAny; schema?: ZodTypeAny; values?: string[]; value?: unknown; valueType?: ZodTypeAny } })._def;
  switch (def.typeName) {
    case 'ZodString': return { type: 'string' };
    case 'ZodNumber': return { type: 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodArray': return { type: 'array', items: singleZodToJson(def.type!) };
    case 'ZodOptional': return singleZodToJson(def.innerType!);
    case 'ZodNullable': return singleZodToJson(def.innerType!);
    case 'ZodEffects': return singleZodToJson(def.schema!);
    case 'ZodEnum': return { type: 'string', enum: def.values };
    case 'ZodLiteral': return { const: def.value };
    case 'ZodObject': return zodToJsonSchema(s);
    case 'ZodRecord': return { type: 'object', additionalProperties: singleZodToJson(def.valueType!) };
    default: return {};
  }
}
