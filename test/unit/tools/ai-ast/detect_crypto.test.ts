import { describe, it, expect } from 'vitest';
import { detect_crypto } from '../../../../src/tools/ai-ast/detect_crypto.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeCryptoSignatures } from '../../../../src/capabilities/cryptoSignatures.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('detect_crypto', () => {
  it('detects from inline source', async () => {
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(detect_crypto, { source: 'CryptoJS.AES.encrypt(x, k)' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.source).toBe('inline');
      expect(r.data.matches.map(m => m.name)).toContain('AES');
    }
  });

  it('detects from cached script', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://x/y.js', hash: 'h', source: 'btoa(secret)' });
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts,
    } as any;
    const r = await executeTool(detect_crypto, { scriptUrl: 'https://x/y.js' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.source).toBe('cached-script');
      expect(r.data.matches.map(m => m.name)).toContain('Base64');
    }
  });

  it('returns ScriptNotCollectedYet when scriptUrl unknown', async () => {
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(detect_crypto, { scriptUrl: 'https://gone' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.ScriptNotCollectedYet);
  });

  it('rejects when neither source nor scriptUrl provided', async () => {
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts: new ScriptCache(),
    } as any;
    const r = await executeTool(detect_crypto, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.BadArgs);
  });
});
