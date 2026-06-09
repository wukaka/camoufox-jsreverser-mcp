import { ZodTypeAny, ZodObject } from 'zod';

export function zodToJsonSchema(schema: ZodTypeAny): unknown {
  if (schema instanceof ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = singleZodToJson(v);
      if (!v.isOptional()) required.push(k);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  return singleZodToJson(schema);
}

function singleZodToJson(s: ZodTypeAny): unknown {
  const def = (s as { _def: { typeName: string; type?: ZodTypeAny; innerType?: ZodTypeAny; values?: string[]; value?: unknown; valueType?: ZodTypeAny } })._def;
  switch (def.typeName) {
    case 'ZodString': return { type: 'string' };
    case 'ZodNumber': return { type: 'number' };
    case 'ZodBoolean': return { type: 'boolean' };
    case 'ZodArray': return { type: 'array', items: singleZodToJson(def.type!) };
    case 'ZodOptional': return singleZodToJson(def.innerType!);
    case 'ZodEnum': return { type: 'string', enum: def.values };
    case 'ZodLiteral': return { const: def.value };
    case 'ZodObject': return zodToJsonSchema(s);
    case 'ZodRecord': return { type: 'object', additionalProperties: singleZodToJson(def.valueType!) };
    default: return {};
  }
}
