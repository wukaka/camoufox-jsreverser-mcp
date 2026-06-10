import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { DomAccess, NodeRef, ScriptHost } from './types.js';

/**
 * v1 type() uses synthetic value assignment via scriptHost.evaluate.
 * This is testable without a real browser but does not simulate real key events.
 * M3 will swap this for real input.performActions key sequence once pauseController
 * lands and key mapping tables are available.
 * DONE_WITH_CONCERNS: documented trade-off.
 */
async function syntheticType(
  scripts: ScriptHost,
  contextId: string,
  sharedId: string,
  text: string,
  clearFirst: boolean,
): Promise<void> {
  const realms = await scripts.listRealms(contextId);
  const realm = realms.find(r => r.type === 'window');
  if (!realm) throw new Error(`domAccess.type: no window realm found for context ${contextId}`);

  // v1 synthetic: set .value and dispatch input/change events.
  // Real key-event simulation (input.performActions per-key) deferred to M3.
  // Note: __bidiSharedIdMap requires a companion preload to be set up by the caller.
  // Without it the evaluate returns false and is a no-op, which is intentional in v1.
  const expr = `(() => {
    const sharedId = ${JSON.stringify(sharedId)};
    const text = ${JSON.stringify(text)};
    const clearFirst = ${JSON.stringify(clearFirst)};
    const el = (typeof __bidiSharedIdMap !== 'undefined' && __bidiSharedIdMap.get(sharedId)) || null;
    if (!el) return false;
    if (clearFirst) el.value = '';
    el.value += text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;

  await scripts.evaluate(realm.realmId, expr, { awaitPromise: false });
}

export function makeDomAccess(bidi: BidiDriver, scripts: ScriptHost): DomAccess {
  return {
    async query(contextId, selector) {
      const r = await bidi.send('browsingContext.locateNodes', {
        context: contextId,
        locator: { type: 'css', value: selector },
      }) as { nodes: Array<{ sharedId: string; [k: string]: unknown }> };
      return (r.nodes ?? []).map((n): NodeRef => ({ sharedId: n.sharedId }));
    },

    async click(contextId, sharedId) {
      await bidi.send('input.performActions', {
        context: contextId,
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            actions: [
              { type: 'pointerMove', x: 0, y: 0, origin: { type: 'element', element: { sharedId } } },
              { type: 'pointerDown', button: 0 },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      });
    },

    async type(contextId, sharedId, text, opts) {
      await syntheticType(scripts, contextId, sharedId, text, opts?.clearFirst ?? false);
    },

    async waitFor(contextId, selector, opts) {
      const timeoutMs = opts?.timeoutMs ?? 5000;
      const pollMs = 100;
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const r = await bidi.send('browsingContext.locateNodes', {
          context: contextId,
          locator: { type: 'css', value: selector },
        }) as { nodes: Array<{ sharedId: string; [k: string]: unknown }> };

        const nodes = r.nodes ?? [];
        const first = nodes[0];
        if (first != null) {
          return { sharedId: first.sharedId };
        }

        await new Promise<void>(resolve => setTimeout(resolve, pollMs));
      }

      throw new Error(`domAccess.waitFor: selector "${selector}" not found within ${timeoutMs}ms`);
    },
  };
}
