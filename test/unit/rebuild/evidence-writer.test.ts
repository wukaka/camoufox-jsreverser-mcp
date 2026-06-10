import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeTaskArtifacts } from '../../../src/capabilities/taskArtifacts.js';
import { makeEvidenceWriter } from '../../../src/rebuild/evidence-writer.js';

describe('evidence-writer', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'ew-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('record appends evidence with kind=evidence + ts', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    await artifacts.createTask('t1');
    const writer = makeEvidenceWriter({ artifacts, now: () => 1234 });

    const r = await writer.record('t1', { category: 'crypto', signal: 'AES detected', refs: ['s1'] });
    expect(r).toEqual({ kind: 'evidence', ts: 1234, category: 'crypto', signal: 'AES detected', refs: ['s1'] });

    const list = await writer.list('t1');
    expect(list).toHaveLength(1);
    expect(list[0]?.signal).toBe('AES detected');
  });

  it('list returns multiple records in order', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    await artifacts.createTask('t1');
    let t = 0;
    const writer = makeEvidenceWriter({ artifacts, now: () => ++t });
    await writer.record('t1', { category: 'stealth', signal: 'webdriver leaked' });
    await writer.record('t1', { category: 'anti-bot', signal: 'canvas fp run' });
    const list = await writer.list('t1');
    expect(list.map(e => e.signal)).toEqual(['webdriver leaked', 'canvas fp run']);
    expect(list[0]?.ts).toBe(1);
    expect(list[1]?.ts).toBe(2);
  });

  it('list returns [] when file missing', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    await artifacts.createTask('t1');
    const writer = makeEvidenceWriter({ artifacts });
    expect(await writer.list('t1')).toEqual([]);
  });

  it('list skips non-evidence lines (e.g. hook entries) and malformed JSON', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    await artifacts.createTask('t1');
    await artifacts.write('t1', 'runtime-evidence.jsonl', JSON.stringify({ kind: 'hook', hookId: 'h1' }));
    await artifacts.write('t1', 'runtime-evidence.jsonl', '!! not json');
    const writer = makeEvidenceWriter({ artifacts, now: () => 7 });
    await writer.record('t1', { category: 'stealth', signal: 'x' });
    const list = await writer.list('t1');
    expect(list).toHaveLength(1);
    expect(list[0]?.signal).toBe('x');
  });
});
