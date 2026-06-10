import { describe, it, expect } from 'vitest';
import { functionExtract } from '../../../../src/ast/transforms/function-extract.js';

describe('function-extract', () => {
  it('extracts named function declarations', () => {
    const source = `function foo(a, b) { return a + b; } function bar() {}`;
    const r = functionExtract(source);
    expect(r.changed).toBe(false);
    const analysis = r.analysis as { functions: Array<{ name: string | null; paramCount: number; line: number }> };
    expect(analysis.functions).toHaveLength(2);
    expect(analysis.functions[0].name).toBe('foo');
    expect(analysis.functions[0].paramCount).toBe(2);
    expect(analysis.functions[1].name).toBe('bar');
    expect(analysis.functions[1].paramCount).toBe(0);
  });

  it('extracts anonymous function expressions', () => {
    const source = `var f = function(x) { return x; };`;
    const r = functionExtract(source);
    const analysis = r.analysis as { functions: Array<{ name: string | null; paramCount: number }> };
    expect(analysis.functions.length).toBeGreaterThanOrEqual(1);
    const fn = analysis.functions.find(f => f.paramCount === 1);
    expect(fn).toBeDefined();
  });

  it('returns empty functions array for source with no functions', () => {
    const source = `var x = 1; var y = 2;`;
    const r = functionExtract(source);
    const analysis = r.analysis as { functions: Array<unknown> };
    expect(analysis.functions).toHaveLength(0);
    expect(r.changed).toBe(false);
  });

  it('does not modify the code', () => {
    const source = `function foo(a) { return a; }`;
    const r = functionExtract(source);
    // Code should still contain the function (just reformatted by generator)
    expect(r.code).toMatch(/function foo/);
  });
});
