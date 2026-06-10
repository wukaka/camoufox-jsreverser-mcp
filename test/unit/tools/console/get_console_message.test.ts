import { describe, it, expect } from 'vitest';
import { get_console_message } from '../../../../src/tools/console/get_console_message.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ConsoleRing } from '../../../../src/session/caches.js';

describe('get_console_message', () => {
  it('returns by index', async () => {
    const ring = new ConsoleRing();
    ring.push({ level: 'info', text: 'a' });
    ring.push({ level: 'warn', text: 'b' });
    const session = { isReady: () => true, consoleRing: ring } as any;
    const r = await executeTool(get_console_message, { index: 1 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.message as any).text).toBe('b');
  });

  it('resource_not_found for out-of-range index', async () => {
    const ring = new ConsoleRing();
    const session = { isReady: () => true, consoleRing: ring } as any;
    const r = await executeTool(get_console_message, { index: 5 }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('resource_not_found');
  });
});
