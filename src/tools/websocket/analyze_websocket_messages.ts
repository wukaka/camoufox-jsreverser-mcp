import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';
import type { WsObserver, WsFrame } from '../../capabilities/types.js';

export interface Group { signature: string; count: number; firstTs: number; lastTs: number; sampleData: unknown }

function signatureOf(data: unknown): string {
  if (typeof data === 'string') {
    const head = data.slice(0, 40);
    return `str:${head.length}:${head.replace(/[^\w]/g, '').slice(0, 16)}`;
  }
  return `other:${String(data).slice(0, 24)}`;
}

const schema = z.object({ wsid: z.string() }).strict();
type Args = z.infer<typeof schema>;

export const analyze_websocket_messages = defineTool<Args, { wsid: string; groups: Group[] }>({
  name: 'analyze_websocket_messages',
  description: 'Cluster frames by byte-signature heuristic. v1 local-only; no LLM.',
  schema,
  handler: async ({ wsid }, session) => {
    const obs = session.caps.wsObserver as WsObserver;
    const frames = obs.getFrames(wsid);
    const groups = new Map<string, Group>();
    for (const f of frames as WsFrame[]) {
      const sig = signatureOf(f.data);
      const g = groups.get(sig);
      if (g) {
        g.count++;
        g.lastTs = f.ts;
      } else {
        groups.set(sig, { signature: sig, count: 1, firstTs: f.ts, lastTs: f.ts, sampleData: f.data });
      }
    }
    return ok({ wsid, groups: Array.from(groups.values()).sort((a, b) => b.count - a.count) });
  },
});
