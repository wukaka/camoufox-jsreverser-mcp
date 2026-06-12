import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { Stealth, StealthHook } from '../../capabilities/types.js';

const wrapSchema = z.object({
  targetPath: z.string(),
  channelName: z.string().optional(),
  capture: z.array(z.enum(['args', 'return', 'this', 'stack'])).optional(),
}).strict();

const schema = z.object({
  wraps: z.array(wrapSchema).optional(),
  neutraliseTiming: z.boolean().optional(),
  timingMaxGapMs: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

interface Output { preloadId: string; wraps: number; neutraliseTiming: boolean }

export const inject_stealth_hook = defineTool<Args, Output>({
  name: 'inject_stealth_hook',
  description:
    'Render a stealth-hardened wrap (Function.toString masking + channel-emitting Proxy) over one or more dotted global paths, optionally with performance.now/Date.now timing neutralisation, then install via BiDi preload. Main world only — use inject_stealth_to_workers for worker realms.',
  schema,
  handler: async ({ wraps, neutraliseTiming, timingMaxGapMs }, session) => {
    const sh = session.caps.stealthHook as StealthHook | undefined;
    const stealth = session.caps.stealth as Stealth | undefined;
    if (!sh || !stealth) {
      return fail(ErrorReason.CapabilityUnavailable, { details: { capability: 'stealthHook' } });
    }
    if ((!wraps || wraps.length === 0) && !neutraliseTiming) {
      return fail(ErrorReason.BadArgs, { hint: 'Provide at least one wrap or neutraliseTiming:true' });
    }
    const source = sh.renderPreload({
      emitName: session.emitName,
      wraps,
      neutraliseTiming,
      timingMaxGapMs,
    });
    const r = await stealth.injectCustomScript(source);
    return ok({
      preloadId: r.preloadId,
      wraps: wraps?.length ?? 0,
      neutraliseTiming: !!neutraliseTiming,
    });
  },
});
