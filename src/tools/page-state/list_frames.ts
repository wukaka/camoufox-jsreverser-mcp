import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { PageController, BrowsingContextInfo } from '../../capabilities/types.js';

function flatten(root: BrowsingContextInfo): Array<{ contextId: string; url: string; parent: string | null }> {
  const out: Array<{ contextId: string; url: string; parent: string | null }> = [];
  const walk = (node: BrowsingContextInfo, parent: string | null) => {
    out.push({ contextId: node.context, url: node.url, parent });
    for (const child of node.children ?? []) walk(child, node.context);
  };
  walk(root, null);
  return out;
}

export const list_frames = defineTool({
  name: 'list_frames',
  description: 'List frames (top + iframes) under the active page as a flat array.',
  schema: z.object({}).strict(),
  handler: async (_args, session) => {
    const pc = session.caps.pageController as PageController;
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page; call select_page first.' });
    const tree = await pc.listContexts();
    const root = tree.find(c => c.context === ctxId);
    if (!root) return fail(ErrorReason.TargetNotFound, { hint: `Active context ${ctxId} not found in tree.` });
    return ok({ frames: flatten(root) });
  },
});
