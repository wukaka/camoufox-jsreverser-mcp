import { describe, it, expect } from 'vitest';
import { collection_diff } from '../../../../src/tools/rebuild/collection_diff.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('collection_diff', () => {
  it('classifies added / removed / changed / unchanged by key + hash', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(collection_diff, {
      left: [
        { key: 'a', hash: '1' },
        { key: 'b', hash: '1' },
        { key: 'c', hash: '1' },
      ],
      right: [
        { key: 'a', hash: '1' },
        { key: 'b', hash: '2' },
        { key: 'd', hash: '3' },
      ],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.added).toEqual(['d']);
      expect(r.data.removed).toEqual(['c']);
      expect(r.data.changed).toEqual([{ key: 'b', leftHash: '1', rightHash: '2' }]);
      expect(r.data.unchanged).toEqual(['a']);
    }
  });

  it('treats missing hash on either side as different from present hash', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(collection_diff, {
      left: [{ key: 'x' }],
      right: [{ key: 'x', hash: '1' }],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.changed[0]?.key).toBe('x');
  });

  it('sorts result lists', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(collection_diff, {
      left: [],
      right: [{ key: 'z' }, { key: 'a' }, { key: 'm' }],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.added).toEqual(['a', 'm', 'z']);
  });
});
