import { describe, it, expect } from 'vitest';
import { risk_panel } from '../../../../src/tools/ai-ast/risk_panel.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeCryptoSignatures } from '../../../../src/capabilities/cryptoSignatures.js';
import { ScriptCache } from '../../../../src/session/caches.js';

describe('risk_panel', () => {
  it('flags eval + fingerprint + crypto and returns high level', async () => {
    const scripts = new ScriptCache();
    scripts.put({
      id: 's1',
      url: 'https://x/big.js',
      hash: 'h',
      source: [
        'eval("danger");',
        'new Function("x", "return x")',
        'canvas.toDataURL("image/png");',
        'CryptoJS.AES.encrypt(d, k);',
        'CryptoJS.MD5(p);',
        'navigator.webdriver;',
        'document.cookie = "a=1";',
        'localStorage.setItem("k", "v");',
        'navigator.sendBeacon("/x", body);',
      ].join('\n'),
    });
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts,
    } as any;
    const r = await executeTool(risk_panel, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.scriptCount).toBe(1);
      expect(r.data.totalScore).toBeGreaterThanOrEqual(30);
      expect(r.data.level).toBe('high');
      const cats = new Set(r.data.items.map(i => i.category));
      expect(cats.has('crypto')).toBe(true);
      expect(cats.has('eval')).toBe(true);
      expect(cats.has('fingerprint')).toBe(true);
      expect(cats.has('storage')).toBe(true);
      expect(cats.has('exfil')).toBe(true);
    }
  });

  it('low level when no signals', async () => {
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://x/clean.js', hash: 'h', source: 'function add(a,b){return a+b;}' });
    const session = {
      isReady: () => true,
      caps: { cryptoSignatures: makeCryptoSignatures() },
      scripts,
    } as any;
    const r = await executeTool(risk_panel, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.totalScore).toBe(0);
      expect(r.data.level).toBe('low');
    }
  });

  it('returns CapabilityUnavailable when cryptoSignatures missing', async () => {
    const session = { isReady: () => true, caps: {}, scripts: new ScriptCache() } as any;
    const r = await executeTool(risk_panel, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
