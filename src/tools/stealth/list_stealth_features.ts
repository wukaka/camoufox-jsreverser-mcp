import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth, StealthFeature } from '../../capabilities/types.js';

export const list_stealth_features = defineTool<Record<string, never>, { features: StealthFeature[] }>({
  name: 'list_stealth_features',
  description: 'List the stealth features the capability knows about.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const s = session.caps.stealth as Stealth | undefined;
    if (!s) return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealth' } });
    return ok({ features: s.listFeatures() });
  },
});
