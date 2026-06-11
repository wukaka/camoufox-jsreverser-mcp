import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface McpStdioOptions {
  args?: string[];
  env?: Record<string, string>;
  /** Path to the entry; defaults to the compiled build/src/index.js. */
  entry?: string;
}

export interface McpStdioHandle {
  client: Client;
  close(): Promise<void>;
}

/** Spawn the MCP server over stdio and return an initialised Client.
 *  Caller must have run `npm run build` so build/src/index.js exists. */
export async function connectMcpStdio(opts: McpStdioOptions = {}): Promise<McpStdioHandle> {
  const entry = opts.entry ?? path.join(REPO_ROOT, 'build', 'src', 'index.js');
  const transport = new StdioClientTransport({
    command: process.execPath, // node binary
    args: [entry, ...(opts.args ?? [])],
    env: { ...process.env, ...(opts.env ?? {}) } as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'integration-test-client', version: '0.0.0' });
  await client.connect(transport);
  return {
    client,
    async close() {
      await client.close();
    },
  };
}

/** Helper to call a tool and return its parsed ToolResult-shaped body. */
export async function callTool<T = unknown>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const first = (res.content as Array<{ type: string; text?: string }>)[0];
  if (!first || first.type !== 'text' || !first.text) {
    throw new Error(`tool ${name} returned no text content`);
  }
  return JSON.parse(first.text) as T;
}
