import { describe, it, expect } from 'vitest';
import { constantFold } from '../../../../src/ast/transforms/constant-fold.js';

describe('constant-fold', () => {
  it('folds numeric addition', () => {
    const r = constantFold('var x = 1 + 2;');
    expect(r.code).toMatch(/var x = 3/);
    expect(r.changed).toBe(true);
  });

  it('folds string concatenation', () => {
    const r = constantFold('var x = "a" + "b";');
    expect(r.code).toMatch(/var x = "ab"/);
    expect(r.changed).toBe(true);
  });

  it('folds !true to false', () => {
    const r = constantFold('var x = !true;');
    expect(r.code).toMatch(/var x = false/);
    expect(r.changed).toBe(true);
  });

  it('reports changed=false when nothing to fold', () => {
    const r = constantFold('var x = a + b;');
    expect(r.changed).toBe(false);
  });

  it('folds numeric subtraction', () => {
    const r = constantFold('var x = 10 - 3;');
    expect(r.code).toMatch(/var x = 7/);
    expect(r.changed).toBe(true);
  });

  it('folds !false to true', () => {
    const r = constantFold('var x = !false;');
    expect(r.code).toMatch(/var x = true/);
    expect(r.changed).toBe(true);
  });
});
