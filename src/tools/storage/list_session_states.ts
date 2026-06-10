import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

export interface SnapInfo { name: string; capturedAt: number; cookieCount: number; originCount: number }

export const list_session_states = defineTool({
  name: 'list_session_states',
  description: 'List all named session snapshots in memory.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const snapshots: SnapInfo[] = [];
    for (const s of session.sessionSnapshots.values()) {
      snapshots.push({
        name: s.name,
        capturedAt: s.capturedAt,
        cookieCount: s.cookies.length,
        originCount: Object.keys(s.localByOrigin).length,
      });
    }
    return ok({ snapshots });
  },
});
