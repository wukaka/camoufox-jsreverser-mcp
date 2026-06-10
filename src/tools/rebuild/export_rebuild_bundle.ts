import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { TaskArtifacts } from '../../capabilities/types.js';
import { makeBundleBuilder, networkSamplesFromRequests, type EnvProbe } from '../../rebuild/bundle-builder.js';

const schema = z.object({
  taskId: z.string().min(1),
  envProbes: z.array(z.object({ name: z.string(), value: z.unknown() })).optional(),
  includeNetwork: z.boolean().optional(),
  includeHooks: z.boolean().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const export_rebuild_bundle = defineTool<Args, { taskRoot: string; fileTree: string[] }>({
  name: 'export_rebuild_bundle',
  description: 'Bundle cached scripts + hook samples + network samples + env probes into artifacts/tasks/<taskId>/.',
  schema,
  handler: async ({ taskId, envProbes, includeNetwork, includeHooks }: Args, session) => {
    const ta = session.caps.taskArtifacts as TaskArtifacts | undefined;
    if (!ta) return fail(ErrorReason.CapabilityUnavailable, { hint: 'taskArtifacts not wired.' });

    const bb = makeBundleBuilder({ artifacts: ta });
    const scripts = session.scripts.list();
    const hooks = (includeHooks ?? true) ? session.hooks.list() : [];
    const networkSamples = (includeNetwork ?? true)
      ? networkSamplesFromRequests(session.requests.list())
      : [];
    const probes: EnvProbe[] = (envProbes ?? []).map(p => ({ name: p.name, value: p.value }));

    const r = await bb.build({ taskId, scripts, hooks, networkSamples, envProbes: probes });
    return ok(r);
  },
});
