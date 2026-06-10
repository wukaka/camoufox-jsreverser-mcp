import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { DomAccess, NodeRef, ScriptHost } from './types.js';

/**
 * v1 type() uses synthetic value assignment. The element is passed by sharedId
 * directly through scriptHost.callFunction's `arguments` channel — BiDi's
 * standard handle for DOM nodes — so no companion preload is needed.
 * Real key-event simulation (input.performActions per-key) lands in M3.
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

  const r = await scripts.callFunction(
    realm.realmId,
    `(el, text, clearFirst) => {
      if (clearFirst) el.value = '';
      el.value += text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    [
      { sharedId },
      { type: 'string', value: text },
      { type: 'boolean', value: clearFirst },
    ],
    { awaitPromise: false },
  );
  if (r.exceptionDetails) {
    const text = (r.exceptionDetails as { text?: string }).text ?? 'unknown';
    throw new Error(`domAccess.type: ${text}`);
  }
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
