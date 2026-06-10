import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { record_reverse_evidence } from '../../../../src/tools/rebuild/record_reverse_evidence.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeTaskArtifacts } from '../../../../src/capabilities/taskArtifacts.js';

describe('record_reverse_evidence', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(tmpdir(), 'rre-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('writes an evidence line and returns the stored record', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    const session = { isReady: () => true, caps: { taskArtifacts: ta } } as any;
    const r = await executeTool(record_reverse_evidence, {
      taskId: 't1',
      category: 'stealth',
      signal: 'webdriver visible',
      severity: 'medium',
      refs: ['scriptA'],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.evidence.kind).toBe('evidence');
      expect(r.data.evidence.signal).toBe('webdriver visible');
      expect(r.data.evidence.severity).toBe('medium');
    }
    const file = await fs.readFile(path.join(root, 'tasks', 't1', 'runtime-evidence.jsonl'), 'utf8');
    expect(file).toContain('webdriver visible');
  });

  it('returns CapabilityUnavailable without taskArtifacts', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(record_reverse_evidence, {
      taskId: 't1', category: 'a', signal: 'b',
    }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
