import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { TaskArtifacts } from '../../capabilities/types.js';
import { makeEvidenceWriter, type StoredReverseEvidence } from '../../rebuild/evidence-writer.js';

const schema = z.object({
  taskId: z.string().min(1),
  category: z.string().min(1),
  signal: z.string().min(1),
  detail: z.unknown().optional(),
  refs: z.array(z.string()).optional(),
  severity: z.enum(['info', 'low', 'medium', 'high']).optional(),
}).strict();
type Args = z.infer<typeof schema>;

export const record_reverse_evidence = defineTool<Args, { evidence: StoredReverseEvidence }>({
  name: 'record_reverse_evidence',
  description: 'Append a reverse-engineering evidence record to artifacts/tasks/<taskId>/runtime-evidence.jsonl.',
  schema,
  handler: async ({ taskId, ...ev }: Args, session) => {
    const ta = session.caps.taskArtifacts as TaskArtifacts | undefined;
    if (!ta) return fail(ErrorReason.CapabilityUnavailable, { hint: 'taskArtifacts not wired.' });
    await ta.createTask(taskId);
    const writer = makeEvidenceWriter({ artifacts: ta });
    const stored = await writer.record(taskId, ev);
    return ok({ evidence: stored });
  },
});
