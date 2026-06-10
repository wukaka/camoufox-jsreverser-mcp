import { describe, it, expect } from 'vitest';
import { deadCode } from '../../../../src/ast/transforms/dead-code.js';

describe('dead-code', () => {
  it('removes statements after return', () => {
    const source = `function f() { return 1; var x = 2; var y = 3; }`;
    const r = deadCode(source);
    expect(r.changed).toBe(true);
    expect(r.code).not.toMatch(/var x = 2/);
    expect(r.code).not.toMatch(/var y = 3/);
    expect(r.code).toMatch(/return 1/);
  });

  it('removes statements after throw', () => {
    const source = `function f() { throw new Error('e'); console.log('never'); }`;
    const r = deadCode(source);
    expect(r.changed).toBe(true);
    expect(r.code).not.toMatch(/console\.log/);
    expect(r.code).toMatch(/throw/);
  });

  it('returns changed=false when no dead code exists', () => {
    const source = `function f() { var x = 1; return x; }`;
    const r = deadCode(source);
    expect(r.changed).toBe(false);
  });

  it('only removes in the block where return occurs, not parent blocks', () => {
    const source = `function f() { if (x) { return; var dead = 1; } var alive = 2; }`;
    const r = deadCode(source);
    expect(r.changed).toBe(true);
    // var alive = 2 is in the outer block, not after a return — should be kept
    expect(r.code).toMatch(/var alive = 2/);
    // var dead = 1 should be removed
    expect(r.code).not.toMatch(/var dead = 1/);
  });
});
