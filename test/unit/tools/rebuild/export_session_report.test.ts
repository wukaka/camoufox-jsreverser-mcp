import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { export_session_report } from '../../../../src/tools/rebuild/export_session_report.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeTaskArtifacts } from '../../../../src/capabilities/taskArtifacts.js';
import { ScriptCache, HookTable, RequestPool } from '../../../../src/session/caches.js';

describe('export_session_report', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(tmpdir(), 'esr-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('writes report.md with counts and script table', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://x/a.js', hash: 'abc', source: 'console.log(1)' });
    const hooks = new HookTable();
    hooks.put({ hookId: 'h1', def: { fn: 'fetch' }, workerInjections: [], samples: [{}, {}] });
    const session = {
      isReady: () => true,
      caps: { taskArtifacts: ta },
      scripts,
      hooks,
      requests: new RequestPool(),
    } as any;

    const r = await executeTool(export_session_report, { taskId: 't1', title: 'My Report' }, session);
    expect(r.ok).toBe(true);
    const body = await fs.readFile(path.join(root, 'tasks', 't1', 'report.md'), 'utf8');
    expect(body).toContain('# My Report');
    expect(body).toContain('Scripts cached: **1**');
    expect(body).toContain('https://x/a.js');
    expect(body).toContain('**h1**');
    expect(body).toContain('2 sample(s)');
  });

  it('returns CapabilityUnavailable without taskArtifacts', async () => {
    const session = {
      isReady: () => true, caps: {},
      scripts: new ScriptCache(), hooks: new HookTable(), requests: new RequestPool(),
    } as any;
    const r = await executeTool(export_session_report, { taskId: 't1' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
