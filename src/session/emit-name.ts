import { randomBytes } from 'node:crypto';
export function generateEmitName(): string {
  return `__mcp_emit_${randomBytes(8).toString('hex')}`;
}
