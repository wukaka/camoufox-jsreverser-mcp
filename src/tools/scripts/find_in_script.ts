import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';

export interface Match { line: number; column: number; preview: string }

const schema = z.object({
  url: z.string(),
  pattern: z.string(),
  regex: z.boolean().optional(),
}).strict();
type Args = z.infer<typeof schema>;

function search(source: string, pattern: string, regex: boolean): Match[] {
  const matches: Match[] = [];
  const lines = source.split('\n');
  const re = regex ? new RegExp(pattern, 'g') : null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (re) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        matches.push({ line: i + 1, column: m.index + 1, preview: line.slice(Math.max(0, m.index - 20), m.index + 60) });
      }
    } else {
      let idx = line.indexOf(pattern);
      while (idx >= 0) {
        matches.push({ line: i + 1, column: idx + 1, preview: line.slice(Math.max(0, idx - 20), idx + 60) });
        idx = line.indexOf(pattern, idx + 1);
      }
    }
  }
  return matches;
}

export const find_in_script = defineTool<Args, { url: string; matchCount: number; matches: Match[] }>({
  name: 'find_in_script',
  description: 'Find string or regex pattern in a single cached script. Use get_script_source first to populate the cache.',
  schema,
  handler: async ({ url, pattern, regex }: Args, session) => {
    const entry = session.scripts.list().find(s => s.url === url);
    if (!entry) return fail(ErrorReason.ScriptNotCollectedYet, { hint: `Script ${url} not in cache. Call get_script_source first.` });
    const matches = search(entry.source, pattern, regex ?? false);
    return ok({ url, matchCount: matches.length, matches: matches.slice(0, 200) });
  },
});
