import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { CryptoSignatures, CryptoMatch } from '../../capabilities/types.js';

const schema = z.object({
  source: z.string().optional(),
  scriptUrl: z.string().optional(),
}).strict().refine(v => !!(v.source || v.scriptUrl), {
  message: 'Provide either source or scriptUrl',
});
type Args = z.infer<typeof schema>;

export const detect_crypto = defineTool<Args, {
  matches: CryptoMatch[];
  source: 'inline' | 'cached-script';
  scriptUrl?: string;
}>({
  name: 'detect_crypto',
  description: 'Run static crypto-algorithm signature rules (AES/RC4/MD5/SHA*/Base64/HMAC/RSA/SM*) against inline source or a cached script.',
  schema,
  handler: async ({ source, scriptUrl }: Args, session) => {
    const cs = session.caps.cryptoSignatures as CryptoSignatures | undefined;
    if (!cs) return fail(ErrorReason.CapabilityUnavailable, { hint: 'cryptoSignatures not wired on Session.' });

    let code: string;
    let kind: 'inline' | 'cached-script';
    if (source) {
      code = source;
      kind = 'inline';
    } else {
      const entry = session.scripts.list().find(s => s.url === scriptUrl);
      if (!entry) {
        return fail(ErrorReason.ScriptNotCollectedYet, {
          hint: `No cached script for ${scriptUrl}. Call get_script_source first.`,
        });
      }
      code = entry.source;
      kind = 'cached-script';
    }
    const matches = cs.detect(code);
    return ok({ matches, source: kind, ...(scriptUrl ? { scriptUrl } : {}) });
  },
});
