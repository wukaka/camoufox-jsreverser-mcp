import { describe, it, expect } from 'vitest';
import { diff_env_requirements } from '../../../../src/tools/rebuild/diff_env_requirements.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('diff_env_requirements', () => {
  it('returns diff buckets + summary counts', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(diff_env_requirements, {
      left: 'flask==2.0.1\nrequests==2.30.0\nnumpy\n',
      right: 'flask==2.0.1\nrequests==2.31.0\nrich==13.7\n',
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.added.map(x => x.name)).toEqual(['rich']);
      expect(r.data.removed.map(x => x.name)).toEqual(['numpy']);
      expect(r.data.changed[0]?.name).toBe('requests');
      expect(r.data.summary).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    }
  });
});
