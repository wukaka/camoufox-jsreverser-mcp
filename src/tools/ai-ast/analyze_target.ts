import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { CryptoSignatures, CryptoMatch } from '../../capabilities/types.js';

const schema = z.object({
  urlSubstring: z.string().optional(),
  maxScripts: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

const API_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'fetch', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', re: /\bnew\s+WebSocket\s*\(/ },
  { name: 'localStorage', re: /\blocalStorage\b/ },
  { name: 'sessionStorage', re: /\bsessionStorage\b/ },
  { name: 'document.cookie', re: /document\.cookie/ },
  { name: 'eval', re: /\beval\s*\(/ },
  { name: 'Function-ctor', re: /\bnew\s+Function\s*\(/ },
  { name: 'postMessage', re: /\.postMessage\s*\(/ },
  { name: 'Worker', re: /\bnew\s+Worker\s*\(/ },
];

export interface ScriptReport {
  url: string;
  bytes: number;
  cryptoMatches: CryptoMatch[];
  apiHits: Array<{ name: string; count: number }>;
}

export const analyze_target = defineTool<Args, {
  scripts: ScriptReport[];
  cryptoSummary: Record<string, number>;
  apiSummary: Record<string, number>;
  scriptCount: number;
}>({
  name: 'analyze_target',
  description: 'Summarize cached scripts: crypto signature hits + sensitive API usage. Filter by URL substring.',
  schema,
  handler: async ({ urlSubstring, maxScripts }: Args, session) => {
    const cs = session.caps.cryptoSignatures as CryptoSignatures | undefined;
    if (!cs) return fail(ErrorReason.CapabilityUnavailable, { hint: 'cryptoSignatures not wired on Session.' });

    const cap = maxScripts ?? 50;
    const reports: ScriptReport[] = [];
    const cryptoSummary: Record<string, number> = {};
    const apiSummary: Record<string, number> = {};

    for (const entry of session.scripts.list()) {
      if (reports.length >= cap) break;
      if (urlSubstring && !entry.url.includes(urlSubstring)) continue;

      const cryptoMatches = cs.detect(entry.source);
      for (const m of cryptoMatches) cryptoSummary[m.name] = (cryptoSummary[m.name] ?? 0) + 1;

      const apiHits: Array<{ name: string; count: number }> = [];
      for (const p of API_PATTERNS) {
        const matches = entry.source.match(new RegExp(p.re.source, 'g'));
        const count = matches ? matches.length : 0;
        if (count > 0) {
          apiHits.push({ name: p.name, count });
          apiSummary[p.name] = (apiSummary[p.name] ?? 0) + count;
        }
      }
      reports.push({ url: entry.url, bytes: entry.source.length, cryptoMatches, apiHits });
    }

    return ok({
      scripts: reports,
      cryptoSummary,
      apiSummary,
      scriptCount: reports.length,
    });
  },
});
