import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

const itemSchema = z.object({
  key: z.string(),
  hash: z.string().optional(),
});
const schema = z.object({
  left: z.array(itemSchema),
  right: z.array(itemSchema),
}).strict();
type Args = z.infer<typeof schema>;

export const collection_diff = defineTool<Args, {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; leftHash?: string; rightHash?: string }>;
  unchanged: string[];
}>({
  name: 'collection_diff',
  description: 'Diff two keyed collections (scripts / requests / hooks). Items with the same key but different hash become "changed". Used by evidence comparisons.',
  schema,
  handler: async ({ left, right }: Args) => {
    const lm = new Map(left.map(i => [i.key, i.hash]));
    const rm = new Map(right.map(i => [i.key, i.hash]));
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ key: string; leftHash?: string; rightHash?: string }> = [];
    const unchanged: string[] = [];
    for (const [k, h] of rm) {
      if (!lm.has(k)) added.push(k);
      else if ((lm.get(k) ?? '') !== (h ?? '')) changed.push({ key: k, leftHash: lm.get(k), rightHash: h });
      else unchanged.push(k);
    }
    for (const [k] of lm) if (!rm.has(k)) removed.push(k);
    added.sort();
    removed.sort();
    changed.sort((a, b) => a.key.localeCompare(b.key));
    unchanged.sort();
    return ok({ added, removed, changed, unchanged });
  },
});
