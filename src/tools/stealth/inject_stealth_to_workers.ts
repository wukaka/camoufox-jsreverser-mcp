import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth } from '../../capabilities/types.js';
import { StealthWorkersUnavailableError } from '../../capabilities/errors.js';

const schema = z.object({
  preset: z.string().default('firefox-default'),
  watch: z.boolean().default(true),
}).strict();
type Args = z.infer<typeof schema>;

interface Output {
  injected: string[];
  failed: { realmId: string; reason: string }[];
  injectedAt: 'post-start';
  watching: boolean;
}

export const inject_stealth_to_workers = defineTool<Args, Output>({
  name: 'inject_stealth_to_workers',
  description:
    'Push a stealth preset (default firefox-default) into every dedicated/shared worker realm via post-start eval. With watch:true (default) subscribes to new-worker events for the rest of the session.',
  schema,
  handler: async ({ preset, watch }, session) => {
    const stealth = session.caps.stealth as Stealth | undefined;
    if (!stealth) {
      return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealth' } });
    }
    try {
      const report = await stealth.applyPresetToWorkers(preset, { watch });
      if (report.watching) {
        session.registerWorkerStealthUnsubscribe(report.unwatch);
      }
      return ok({
        injected: report.injected,
        failed: report.failed,
        injectedAt: report.injectedAt,
        watching: report.watching,
      });
    } catch (e) {
      if (e instanceof StealthWorkersUnavailableError) {
        return fail(ErrorReason.StealthWorkersUnavailable, {
          hint: 'Call ensureRdp first or check that workerTopology was wired at Session.init.',
        });
      }
      if (e instanceof Error && /unknown preset/.test(e.message)) {
        return fail(ErrorReason.BadArgs, { hint: `Unknown preset: ${preset}. Call list_stealth_presets.` });
      }
      throw e;
    }
  },
});
