import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineTool, ToolDefinition, executeTool } from '../../../src/server/tool-registry.js';
import { ok } from '../../../src/server/result.js';

describe('tool-registry', () => {
  it('validates args with zod schema, returns bad_args on mismatch', async () => {
    const def: ToolDefinition<{ name: string }, { greeting: string }> = defineTool({
      name: 'greet',
      description: 'greet someone',
      schema: z.object({ name: z.string() }),
      handler: async ({ name }) => ok({ greeting: 'hi ' + name }),
    });
    const good = await executeTool(def, { name: 'world' }, {} as any);
    expect(good.ok).toBe(true);
    const bad = await executeTool(def, { name: 123 }, {} as any);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('bad_args');
  });

  it('translates thrown errors into ToolResult', async () => {
    const def: ToolDefinition<{}, {}> = defineTool({
      name: 'boom',
      description: 'boom',
      schema: z.object({}),
      handler: async () => { throw new Error('mystery'); },
    });
    const r = await executeTool(def, {}, {} as any);
    expect(r.ok).toBe(false);
  });
});
