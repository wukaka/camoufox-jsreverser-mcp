import { describe, it, expect } from 'vitest';
import { parseRequirements, diffRequirements, diffRequirementFiles } from '../../../src/rebuild/env-diff.js';

describe('env-diff: parseRequirements', () => {
  it('parses standard pinned versions', () => {
    const r = parseRequirements('flask==2.0.1\nrequests==2.31.0\n');
    expect(r).toEqual([
      { name: 'flask', version: '==2.0.1' },
      { name: 'requests', version: '==2.31.0' },
    ]);
  });

  it('parses unpinned and range specifiers', () => {
    const r = parseRequirements('numpy\npandas>=1.0\nrich~=13.7\n');
    expect(r).toEqual([
      { name: 'numpy' },
      { name: 'pandas', version: '>=1.0' },
      { name: 'rich', version: '~=13.7' },
    ]);
  });

  it('skips blank lines and comments', () => {
    const r = parseRequirements('# header\n\nflask==2.0.1  # main fw\n');
    expect(r).toEqual([{ name: 'flask', version: '==2.0.1' }]);
  });

  it('keeps unrecognized lines as raw', () => {
    const r = parseRequirements('-e git+https://x/y@main#egg=p\n');
    expect(r[0]?.name).toBe('');
    expect(r[0]?.raw).toContain('git+https');
  });
});

describe('env-diff: diffRequirements', () => {
  it('detects added / removed / changed / unchanged', () => {
    const left = [
      { name: 'flask', version: '==2.0.1' },
      { name: 'requests', version: '==2.30.0' },
      { name: 'numpy' },
    ];
    const right = [
      { name: 'flask', version: '==2.0.1' },
      { name: 'requests', version: '==2.31.0' },
      { name: 'rich', version: '==13.7.0' },
    ];
    const d = diffRequirements(left, right);
    expect(d.added).toEqual([{ name: 'rich', version: '==13.7.0' }]);
    expect(d.removed).toEqual([{ name: 'numpy' }]);
    expect(d.changed).toEqual([{ name: 'requests', from: '==2.30.0', to: '==2.31.0' }]);
    expect(d.unchanged).toEqual([{ name: 'flask', version: '==2.0.1' }]);
  });

  it('result lists are sorted alphabetically', () => {
    const d = diffRequirements(
      [],
      [{ name: 'zlib' }, { name: 'aaa' }, { name: 'mmm' }],
    );
    expect(d.added.map(r => r.name)).toEqual(['aaa', 'mmm', 'zlib']);
  });

  it('treats missing version on left vs pinned right as changed', () => {
    const d = diffRequirements([{ name: 'x' }], [{ name: 'x', version: '==1.0' }]);
    expect(d.changed).toEqual([{ name: 'x', from: undefined, to: '==1.0' }]);
  });
});

describe('env-diff: diffRequirementFiles', () => {
  it('combines parsing + diffing on raw text', () => {
    const left = 'flask==2.0.1\nrequests==2.30.0\n';
    const right = 'flask==2.0.1\nrequests==2.31.0\nrich==13.7\n';
    const d = diffRequirementFiles(left, right);
    expect(d.added.map(r => r.name)).toEqual(['rich']);
    expect(d.changed.map(c => c.name)).toEqual(['requests']);
  });
});
