import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { WorkerTopology, WorkerInfo } from '../../capabilities/types.js';

export const list_workers = defineTool({
  name: 'list_workers',
  description: 'List workers (dedicated, shared, service) visible on the active page. M3 RDP version adds offline worker detection.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const wt = session.caps.workerTopology as WorkerTopology;
    const workers: WorkerInfo[] = await wt.listWorkers();
    return ok({ workers });
  },
});
