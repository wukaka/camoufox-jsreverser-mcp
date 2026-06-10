import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { export_rebuild_bundle } from '../../../../src/tools/rebuild/export_rebuild_bundle.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';
import { makeTaskArtifacts } from '../../../../src/capabilities/taskArtifacts.js';
import { ScriptCache, HookTable, RequestPool } from '../../../../src/session/caches.js';

describe('export_rebuild_bundle', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(tmpdir(), 'erb-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('writes a bundle and returns taskRoot + fileTree', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    const scripts = new ScriptCache();
    scripts.put({ id: 's1', url: 'https://a/x.js', hash: 'h1', source: 'console.log(1)' });
    const session = {
      isReady: () => true,
      caps: { taskArtifacts: ta },
      scripts,
      hooks: new HookTable(),
      requests: new RequestPool(),
    } as any;

    const r = await executeTool(export_rebuild_bundle, {
      taskId: 'demo',
      envProbes: [{ name: 'ua', value: 'Firefox' }],
    }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.taskRoot).toContain('tasks/demo');
      expect(r.data.fileTree).toContain('bundle.manifest.json');
    }
    const env = await fs.readFile(path.join(root, 'tasks', 'demo', 'env', 'probes.json'), 'utf8');
    expect(JSON.parse(env)).toEqual({ ua: 'Firefox' });
  });

  it('returns CapabilityUnavailable when taskArtifacts missing', async () => {
    const session = {
      isReady: () => true,
      caps: {},
      scripts: new ScriptCache(),
      hooks: new HookTable(),
      requests: new RequestPool(),
    } as any;
    const r = await executeTool(export_rebuild_bundle, { taskId: 't1' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.CapabilityUnavailable);
  });
});
