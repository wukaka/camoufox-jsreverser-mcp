import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { ScriptHost } from '../../capabilities/types.js';

const WALK_SCRIPT = `(() => {
  function walk(el, depth, maxDepth) {
    if (depth > maxDepth) return null;
    const node = {
      tag: el.tagName ? el.tagName.toLowerCase() : '#text',
      id: el.id || undefined,
      classes: el.classList ? Array.from(el.classList) : [],
      childCount: el.children ? el.children.length : 0,
      children: [],
    };
    if (el.children) {
      for (let i = 0; i < el.children.length && i < 20; i++) {
        node.children.push(walk(el.children[i], depth + 1, maxDepth));
      }
    }
    return node;
  }
  return walk(document.documentElement, 0, 4);
})()`;

const schema = z.object({}).strict();

export const get_dom_structure = defineTool({
  name: 'get_dom_structure',
  description: 'Get a flattened summary of the DOM tree (up to depth 4, 20 children per node).',
  schema,
  handler: async (_args, session) => {
    const ctxId = session.activeContextId;
    if (!ctxId) return fail(ErrorReason.TargetNotFound, { hint: 'No active page.' });
    const sh = session.caps.scriptHost as ScriptHost;
    const realms = await sh.listRealms(ctxId);
    const realm = realms.find(r => r.type === 'window');
    if (!realm) return fail(ErrorReason.TargetNotFound, { hint: 'No window realm.' });
    const r = await sh.evaluate(realm.realmId, WALK_SCRIPT, { awaitPromise: false });
    const root = (r.result as { value?: unknown })?.value ?? null;
    return ok({ root });
  },
});
