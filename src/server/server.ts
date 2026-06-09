import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from './zod-to-json.js';
import { ToolDefinition, executeTool } from './tool-registry.js';
import { Session } from '../session/Session.js';

export async function startServer(session: Session, tools: ToolDefinition<any, any>[]): Promise<void> {
  const srv = new Server({ name: 'js-reverse-firefox', version: '0.1.0' }, { capabilities: { tools: {} } });

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema),
    })),
  }));

  srv.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = tools.find(t => t.name === req.params.name);
    if (!def) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, reason: 'tool_not_found' }) }], isError: true };
    const result = await executeTool(def, req.params.arguments ?? {}, session);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const t = new StdioServerTransport();
  await srv.connect(t);
}
