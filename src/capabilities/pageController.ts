import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { BrowsingContextInfo, PageController } from './types.js';

export function makePageController(bidi: BidiDriver): PageController {
  return {
    async listContexts() {
      const r = await bidi.send('browsingContext.getTree', {}) as { contexts: BrowsingContextInfo[] };
      return r.contexts;
    },

    async createPage(opts) {
      const params: Record<string, unknown> = { type: 'tab' };
      if (opts?.url != null) params.url = opts.url;
      if (opts?.background != null) params.background = opts.background;
      const r = await bidi.send('browsingContext.create', params) as { context: string };
      return r.context;
    },

    async closePage(contextId) {
      await bidi.send('browsingContext.close', { context: contextId });
    },

    async activate(contextId) {
      await bidi.send('browsingContext.activate', { context: contextId });
    },

    async navigate(contextId, url, wait = 'complete') {
      return await bidi.send('browsingContext.navigate', { context: contextId, url, wait }) as { navigation: string | null; url: string };
    },

    async reload(contextId) {
      await bidi.send('browsingContext.reload', { context: contextId });
    },

    async traverseHistory(contextId, delta) {
      await bidi.send('browsingContext.traverseHistory', { context: contextId, delta });
    },

    async screenshot(contextId, opts) {
      const params: Record<string, unknown> = { context: contextId };
      if (opts?.format != null) params.format = opts.format;
      if (opts?.clip != null) params.clip = opts.clip;
      return await bidi.send('browsingContext.captureScreenshot', params) as { data: string };
    },

    async print(contextId, opts) {
      const params: Record<string, unknown> = { context: contextId, ...(opts ?? {}) };
      return await bidi.send('browsingContext.print', params) as { data: string };
    },

    async setViewport(contextId, viewport) {
      await bidi.send('browsingContext.setViewport', { context: contextId, viewport });
    },

    async handleUserPrompt(contextId, action, userText) {
      const params: Record<string, unknown> = { context: contextId, accept: action === 'accept' };
      if (userText != null) params.userText = userText;
      await bidi.send('browsingContext.handleUserPrompt', params);
    },
  };
}
