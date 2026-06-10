import { describe, it, expect } from 'vitest';
import { controlFlowFlattenReverse } from '../../../../src/ast/transforms/control-flow-flatten-reverse.js';

describe('control-flow-flatten-reverse', () => {
  it('detects while(true)+switch pattern and sets changed=true', () => {
    const source = `
      while (true) {
        switch (state) {
          case 0: state = 1; break;
          case 1: return;
        }
      }
    `;
    const r = controlFlowFlattenReverse(source);
    expect(r.changed).toBe(true);
    expect(r.code).toMatch(/HINT.*flattened control flow/);
  });

  it('returns changed=false for plain while loop without switch', () => {
    const source = `while (true) { doSomething(); }`;
    const r = controlFlowFlattenReverse(source);
    expect(r.changed).toBe(false);
  });

  it('returns changed=false for switch without while(true) wrapper', () => {
    const source = `switch (x) { case 1: break; case 2: break; }`;
    const r = controlFlowFlattenReverse(source);
    expect(r.changed).toBe(false);
  });
});
