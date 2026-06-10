import { describe, it, expect } from 'vitest';
import { analyze_target } from '../../../../src/tools/ai-ast/analyze_target.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeCryptoSignatures } from '../../../../src/capabilities/cryptoSignatures.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('analyze_target', () => {
  it('reports crypto + API hits per script', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h', source: 'fetch("/api"); CryptoJS.AES.encrypt(x, k); fetch("/p")' });
    scripts.put({ id: 's2', url: 'https://a/y.js', hash: 'h', source: 'var ws = new WebSocket("wss://x"); document.cookie = "a=1";' });
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts,
    } as any;
    const r = await executeTool(analyze_target, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.scriptCount).toBe(2);
      expect(r.data.cryptoSummary.AES).toBe(1);
      expect(r.data.apiSummary.fetch).toBe(2);
      expect(r.data.apiSummary.WebSocket).toBe(1);
    }
  });

  it('filters by urlSubstring', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h', source: 'fetch("/")' });
    scripts.put({ id: 's2', url: 'https://b/y.js', hash: 'h', source: 'fetch("/")' });
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts,
    } as any;
    const r = await executeTool(analyze_target, { urlSubstring: 'a/' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.scriptCount).toBe(1);
  });

  it('returns CapabilityUnavailable when cryptoSignatures missing', async () => {
    const session = { isReady: () => true, caps: {}, scripts: new ScriptCache() } as any;
    const r = await executeTool(analyze_target, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
