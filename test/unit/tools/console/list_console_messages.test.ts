import { describe, it, expect } from 'vitest';
import { list_console_messages } from '../../../../src/tools/console/list_console_messages.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ConsoleRing } from '../../../../src/session/caches.js';

describe('list_console_messages', () => {
  it('returns all messages by default', async () => {
    const ring = new ConsoleRing();
    ring.push({ level: 'info', text: 'a' });
    ring.push({ level: 'warn', text: 'b' });
    const session = { isReady: () => true, consoleRing: ring } as any;
    const r = await executeTool(list_console_messages, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.messages).toHaveLength(2);
  });

  it('filters by level', async () => {
    const ring = new ConsoleRing();
    ring.push({ level: 'info', text: 'a' });
    ring.push({ level: 'warn', text: 'b' });
    ring.push({ level: 'warn', text: 'c' });
    const session = { isReady: () => true, consoleRing: ring } as any;
    const r = await executeTool(list_console_messages, { level: 'warn' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.messages).toHaveLength(2);
  });

  it('limits results', async () => {
    const ring = new ConsoleRing();
    for (let i = 0; i < 10; i++) ring.push({ level: 'info', text: `msg${i}` });
    const session = { isReady: () => true, consoleRing: ring } as any;
    const r = await executeTool(list_console_messages, { limit: 3 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.messages).toHaveLength(3);
      expect(r.data.totalCount).toBe(10);
    }
  });
});
