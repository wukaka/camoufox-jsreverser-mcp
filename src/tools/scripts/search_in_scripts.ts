import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok } from '../../server/result.js';

export interface Hit { url: string; line: number; column: number; preview: string }

const schema = z.object({
  pattern: z.string(),
  regex: z.boolean().optional(),
  urlSubstring: z.string().optional(),
  maxHits: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

function searchOne(source: string, url: string, pattern: string, regex: boolean): Hit[] {
  const hits: Hit[] = [];
  const lines = source.split('\n');
  const re = regex ? new RegExp(pattern, 'g') : null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (re) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        hits.push({ url, line: i + 1, column: m.index + 1, preview: line.slice(Math.max(0, m.index - 20), m.index + 60) });
      }
    } else {
      let idx = line.indexOf(pattern);
      while (idx >= 0) {
        hits.push({ url, line: i + 1, column: idx + 1, preview: line.slice(Math.max(0, idx - 20), idx + 60) });
        idx = line.indexOf(pattern, idx + 1);
      }
    }
  }
  return hits;
}

export const search_in_scripts = defineTool<Args, { totalHits: number; hits: Hit[] }>({
  name: 'search_in_scripts',
  description: 'Search a string or regex across ALL cached scripts. Populate the cache with get_script_source first.',
  schema,
  handler: async ({ pattern, regex, urlSubstring, maxHits }: Args, session) => {
    const cap = maxHits ?? 500;
    const allHits: Hit[] = [];
    for (const entry of session.scripts.list()) {
      if (urlSubstring && !entry.url.includes(urlSubstring)) continue;
      const hits = searchOne(entry.source, entry.url, pattern, regex ?? false);
      for (const h of hits) {
        if (allHits.length >= cap) break;
        allHits.push(h);
      }
      if (allHits.length >= cap) break;
    }
    return ok({ totalHits: allHits.length, hits: allHits });
  },
});
