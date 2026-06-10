import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth, StealthPreset } from '../../capabilities/types.js';

export const list_stealth_presets = defineTool<Record<string, never>, { presets: StealthPreset[] }>({
  name: 'list_stealth_presets',
  description: 'List the stealth presets the capability knows about.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const s = session.caps.stealth as Stealth | undefined;
    if (!s) return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealth' } });
    return ok({ presets: s.listPresets() });
  },
});
