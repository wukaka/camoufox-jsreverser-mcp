import { describe, it, expect } from 'vitest';
import { controlFlowFlattenReverse } from '../../../../src/ast/transforms/control-flow-flatten-reverse.js';

describe('control-flow-flatten-reverse', () => {
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

  it('falls back to HINT when state var is not in scope', () => {
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

  describe('Type 1 - dispatch array', () => {
    it('rebuilds linear sequence from "N|M|..".split() order', () => {
      const source = `
        var _order = "2|0|3|1".split('|');
        var _i = 0;
        while (true) {
          switch (_order[_i++]) {
            case '0': stmtA(); continue;
            case '1': stmtB(); continue;
            case '2': stmtC(); continue;
            case '3': stmtD(); continue;
          }
          break;
        }
      `;
      const r = controlFlowFlattenReverse(source);
      expect(r.changed).toBe(true);
      const idxC = r.code.indexOf('stmtC()');
      const idxA = r.code.indexOf('stmtA()');
      const idxD = r.code.indexOf('stmtD()');
      const idxB = r.code.indexOf('stmtB()');
      expect(idxC).toBeGreaterThanOrEqual(0);
      expect(idxA).toBeGreaterThan(idxC);
      expect(idxD).toBeGreaterThan(idxA);
      expect(idxB).toBeGreaterThan(idxD);
      expect(r.code).not.toMatch(/while\s*\(\s*true\s*\)/);
    });

    it('handles array-literal order var', () => {
      const source = `
        var _order = ['1','0'];
        var _i = 0;
        while (true) {
          switch (_order[_i++]) {
            case '0': first(); continue;
            case '1': second(); continue;
          }
          break;
        }
      `;
      const r = controlFlowFlattenReverse(source);
      expect(r.changed).toBe(true);
      const idxSecond = r.code.indexOf('second()');
      const idxFirst = r.code.indexOf('first()');
      expect(idxSecond).toBeGreaterThanOrEqual(0);
      expect(idxFirst).toBeGreaterThan(idxSecond);
    });
  });

  describe('Type 2 - state machine', () => {
    it('linearises an acyclic state transition graph', () => {
      const source = `
        var state = 0;
        while (true) {
          switch (state) {
            case 0: stmtA(); state = 2; break;
            case 2: stmtB(); state = 1; break;
            case 1: stmtC(); break;
          }
        }
      `;
      const r = controlFlowFlattenReverse(source);
      expect(r.changed).toBe(true);
      const idxA = r.code.indexOf('stmtA()');
      const idxB = r.code.indexOf('stmtB()');
      const idxC = r.code.indexOf('stmtC()');
      expect(idxA).toBeGreaterThanOrEqual(0);
      expect(idxB).toBeGreaterThan(idxA);
      expect(idxC).toBeGreaterThan(idxB);
    });

    it('emits CFF-GRAPH hint for cyclic transitions', () => {
      const source = `
        var state = 0;
        while (true) {
          switch (state) {
            case 0: stmtA(); state = 1; break;
            case 1: stmtB(); state = 0; break;
          }
        }
      `;
      const r = controlFlowFlattenReverse(source);
      expect(r.changed).toBe(true);
      expect(r.code).toMatch(/CFF-GRAPH/);
      expect(r.code).toMatch(/while\s*\(\s*true\s*\)/);
    });

    it('handles terminal case via return', () => {
      const source = `
        var state = 0;
        while (true) {
          switch (state) {
            case 0: doFirst(); state = 1; break;
            case 1: return doFinal();
          }
        }
      `;
      const r = controlFlowFlattenReverse(source);
      expect(r.changed).toBe(true);
      const idxFirst = r.code.indexOf('doFirst()');
      const idxFinal = r.code.indexOf('doFinal()');
      expect(idxFirst).toBeGreaterThanOrEqual(0);
      expect(idxFinal).toBeGreaterThan(idxFirst);
      expect(r.code).not.toMatch(/while\s*\(\s*true\s*\)/);
    });
  });
});
