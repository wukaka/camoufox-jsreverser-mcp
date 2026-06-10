import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import { diffRequirementFiles, type EnvDiff } from '../../rebuild/env-diff.js';

const schema = z.object({
  left: z.string(),
  right: z.string(),
}).strict();
type Args = z.infer<typeof schema>;

export const diff_env_requirements = defineTool<Args, EnvDiff & { summary: { added: number; removed: number; changed: number; unchanged: number } }>({
  name: 'diff_env_requirements',
  description: 'Diff two pip-style requirement files. Returns added / removed / changed / unchanged buckets plus counts.',
  schema,
  handler: async ({ left, right }: Args) => {
    const diff = diffRequirementFiles(left, right);
    return ok({
      ...diff,
      summary: {
        added: diff.added.length,
        removed: diff.removed.length,
        changed: diff.changed.length,
        unchanged: diff.unchanged.length,
      },
    });
  },
});
