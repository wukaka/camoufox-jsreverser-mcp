import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { AstAnalyzer } from '../../capabilities/types.js';

const schema = z.object({
  source: z.string(),
  transforms: z.array(z.string()).optional(),
}).strict();
type Args = z.infer<typeof schema>;

const DEFAULT_PIPELINE = ['string-decrypt', 'constant-fold', 'dead-code', 'control-flow-flatten-reverse'];

export const deobfuscate_code = defineTool<Args, {
  code: string;
  appliedTransforms: Array<{ name: string; changed: boolean }>;
  iterations: number;
}>({
  name: 'deobfuscate_code',
  description: 'Apply local AST transforms (constant fold / string array decrypt / dead-code / control-flow hint) to deobfuscate a JS snippet.',
  schema,
  handler: async ({ source, transforms }: Args, session) => {
    const ast = session.caps.astAnalyzer as AstAnalyzer | undefined;
    if (!ast) {
      return fail(ErrorReason.CapabilityUnavailable, { hint: 'astAnalyzer not wired on Session.' });
    }
    const pipeline = transforms && transforms.length > 0 ? transforms : DEFAULT_PIPELINE;
    const known = new Set(ast.listTransforms());
    for (const name of pipeline) {
      if (!known.has(name)) {
        return fail(ErrorReason.BadArgs, {
          hint: `Unknown transform: ${name}. Available: ${ast.listTransforms().join(', ')}`,
        });
      }
    }
    let code = source;
    const applied: Array<{ name: string; changed: boolean }> = [];
    for (const name of pipeline) {
      const r = ast.runTransform(code, name);
      applied.push({ name, changed: r.changed });
      if (r.changed) code = r.code;
    }
    return ok({ code, appliedTransforms: applied, iterations: pipeline.length });
  },
});
