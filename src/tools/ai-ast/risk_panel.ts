import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { CryptoSignatures } from '../../capabilities/types.js';

const schema = z.object({
  urlSubstring: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

export interface RiskItem {
  category: 'crypto' | 'storage' | 'exfil' | 'eval' | 'fingerprint';
  signal: string;
  evidence: string;
  weight: number;
}

const FINGERPRINT_PATTERNS: Array<{ signal: string; re: RegExp; weight: number }> = [
  { signal: 'canvas.toDataURL', re: /\.toDataURL\s*\(/, weight: 6 },
  { signal: 'WebGL renderer info', re: /UNMASKED_RENDERER_WEBGL|UNMASKED_VENDOR_WEBGL/, weight: 8 },
  { signal: 'navigator.plugins enumeration', re: /navigator\.plugins/, weight: 4 },
  { signal: 'AudioContext fingerprint', re: /OfflineAudioContext|createOscillator/, weight: 5 },
  { signal: 'navigator.webdriver', re: /navigator\.webdriver/, weight: 7 },
];
const STORAGE_PATTERNS: Array<{ signal: string; re: RegExp; weight: number }> = [
  { signal: 'document.cookie write', re: /document\.cookie\s*=/, weight: 5 },
  { signal: 'localStorage.setItem', re: /localStorage\.setItem/, weight: 3 },
  { signal: 'IndexedDB open', re: /indexedDB\.open/, weight: 3 },
];
const EXFIL_PATTERNS: Array<{ signal: string; re: RegExp; weight: number }> = [
  { signal: 'fetch + body', re: /\bfetch\s*\([^)]+,\s*\{[^}]*body/, weight: 5 },
  { signal: 'navigator.sendBeacon', re: /navigator\.sendBeacon\s*\(/, weight: 7 },
  { signal: 'new Image() pixel', re: /new\s+Image\s*\(\s*\)\s*;[^;]*\.src/, weight: 4 },
];
const EVAL_PATTERNS: Array<{ signal: string; re: RegExp; weight: number }> = [
  { signal: 'eval()', re: /\beval\s*\(/, weight: 6 },
  { signal: 'new Function()', re: /\bnew\s+Function\s*\(/, weight: 6 },
];

function scoreToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 30) return 'high';
  if (score >= 10) return 'medium';
  return 'low';
}

export const risk_panel = defineTool<Args, {
  totalScore: number;
  level: 'low' | 'medium' | 'high';
  items: RiskItem[];
  scriptCount: number;
}>({
  name: 'risk_panel',
  description: 'Aggregate risk signals across cached scripts: crypto, exfil, fingerprint, storage writes, dynamic eval. Returns weighted score.',
  schema,
  handler: async ({ urlSubstring }: Args, session) => {
    const cs = session.caps.cryptoSignatures as CryptoSignatures | undefined;
    if (!cs) return fail(ErrorReason.CapabilityUnavailable, { hint: 'cryptoSignatures not wired on Session.' });

    const items: RiskItem[] = [];
    let scriptCount = 0;
    let totalScore = 0;

    for (const entry of session.scripts.list()) {
      if (urlSubstring && !entry.url.includes(urlSubstring)) continue;
      scriptCount++;

      for (const m of cs.detect(entry.source)) {
        const weight = m.name === 'Base64' ? 2 : 5;
        items.push({ category: 'crypto', signal: m.name, evidence: entry.url, weight });
        totalScore += weight;
      }
      const buckets: Array<[RiskItem['category'], typeof FINGERPRINT_PATTERNS]> = [
        ['fingerprint', FINGERPRINT_PATTERNS],
        ['storage', STORAGE_PATTERNS],
        ['exfil', EXFIL_PATTERNS],
        ['eval', EVAL_PATTERNS],
      ];
      for (const [category, patterns] of buckets) {
        for (const p of patterns) {
          if (p.re.test(entry.source)) {
            items.push({ category, signal: p.signal, evidence: entry.url, weight: p.weight });
            totalScore += p.weight;
          }
        }
      }
    }

    return ok({ totalScore, level: scoreToLevel(totalScore), items, scriptCount });
  },
});
