import { describe, it, expect } from 'vitest';
import { generateEmitName } from '../../../src/session/emit-name.js';

describe('emit-name', () => {
  it('returns __mcp_emit_<16-hex>', () => {
    const n = generateEmitName();
    expect(n).toMatch(/^__mcp_emit_[0-9a-f]{16}$/);
  });
  it('returns distinct values', () => {
    expect(generateEmitName()).not.toBe(generateEmitName());
  });
});
