import { describe, it, expect } from 'vitest';
import { deobfuscate_code } from '../../../../src/tools/ai-ast/deobfuscate_code.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeAstAnalyzer } from '../../../../src/capabilities/astAnalyzer.js';

describe('deobfuscate_code', () => {
  it('applies default pipeline and folds constants', async () => {
    const session = { isReady: () => true, caps: { astAnalyzer: makeAstAnalyzer() } } as any;
    const r = await executeTool(deobfuscate_code, { source: 'var x = 1 + 2;' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.code).toMatch(/var x = 3/);
      const cf = r.data.appliedTransforms.find(t => t.name === 'constant-fold');
      expect(cf?.changed).toBe(true);
    }
  });

  it('rejects unknown transform', async () => {
    const session = { isReady: () => true, caps: { astAnalyzer: makeAstAnalyzer() } } as any;
    const r = await executeTool(deobfuscate_code, { source: 'var x;', transforms: ['no-such'] }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.BadArgs);
  });

  it('respects custom pipeline order', async () => {
    const session = { isReady: () => true, caps: { astAnalyzer: makeAstAnalyzer() } } as any;
    const r = await executeTool(deobfuscate_code, { source: 'var x = 1 + 2;', transforms: ['constant-fold'] }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.appliedTransforms).toHaveLength(1);
      expect(r.data.iterations).toBe(1);
    }
  });

  it('returns CapabilityUnavailable when astAnalyzer missing', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(deobfuscate_code, { source: 'x' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
