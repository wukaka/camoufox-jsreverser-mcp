import { describe, it, expect } from 'vitest';
import { makeAstAnalyzer } from '../../../src/capabilities/astAnalyzer.js';

describe('astAnalyzer', () => {
  it('parse returns ast for valid input', () => {
    const a = makeAstAnalyzer();
    const r = a.parse('var x = 1;');
    expect(r.ast).not.toBeNull();
    expect(r.error).toBeUndefined();
  });

  it('parse returns error for invalid syntax', () => {
    const a = makeAstAnalyzer();
    const r = a.parse('var x = ;');
    expect(r.error).toBeDefined();
    expect(r.error?.message).toMatch(/Unexpected|expected/i);
  });

  it('listTransforms returns 5 transform names', () => {
    const a = makeAstAnalyzer();
    const names = a.listTransforms();
    expect(names).toContain('constant-fold');
    expect(names).toContain('string-decrypt');
    expect(names).toContain('control-flow-flatten-reverse');
    expect(names).toContain('dead-code');
    expect(names).toContain('function-extract');
    expect(names).toHaveLength(5);
  });

  it('runTransform constant-fold folds 1+2', () => {
    const a = makeAstAnalyzer();
    const r = a.runTransform('var x = 1 + 2;', 'constant-fold');
    expect(r.code).toMatch(/var x = 3/);
    expect(r.changed).toBe(true);
  });

  it('runTransform throws for unknown transform name', () => {
    const a = makeAstAnalyzer();
    expect(() => a.runTransform('x', 'no-such')).toThrow(/unknown transform/);
  });

  it('runTransform dead-code removes unreachable statements', () => {
    const a = makeAstAnalyzer();
    const r = a.runTransform('function f() { return 1; var dead = 2; }', 'dead-code');
    expect(r.changed).toBe(true);
    expect(r.code).not.toMatch(/var dead/);
  });

  it('runTransform function-extract populates analysis', () => {
    const a = makeAstAnalyzer();
    const r = a.runTransform('function hello(a, b, c) {}', 'function-extract');
    expect(r.changed).toBe(false);
    const analysis = r.analysis as { functions: Array<{ name: string; paramCount: number }> };
    expect(analysis.functions[0].name).toBe('hello');
    expect(analysis.functions[0].paramCount).toBe(3);
  });
});
