import { ZodTypeAny } from 'zod';
import { ToolResult, fail, ErrorReason } from './result.js';
import { translateError } from './error-translator.js';
import { Session } from '../session/Session.js';

export interface ToolDefinition<Args, Data> {
  name: string;
  description: string;
  schema: ZodTypeAny;
  handler: (args: Args, session: Session) => Promise<ToolResult<Data>>;
}

export function defineTool<Args, Data>(def: ToolDefinition<Args, Data>): ToolDefinition<Args, Data> {
  return def;
}

export async function executeTool<Args, Data>(
  def: ToolDefinition<Args, Data>,
  rawArgs: unknown,
  session: Session,
): Promise<ToolResult<Data>> {
  const parsed = def.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(ErrorReason.BadArgs, { details: parsed.error.format() }) as ToolResult<Data>;
  }
  try {
    return await def.handler(parsed.data as Args, session);
  } catch (e) {
    return translateError(e as Error) as ToolResult<Data>;
  }
}
