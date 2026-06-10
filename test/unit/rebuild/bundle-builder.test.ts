import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeTaskArtifacts } from '../../../src/capabilities/taskArtifacts.js';
import { makeBundleBuilder, networkSamplesFromRequests } from '../../../src/rebuild/bundle-builder.js';
import type { ScriptEntry, HookEntry, RequestEntry } from '../../../src/session/caches.js';

describe('rebuild bundle-builder', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  function readTaskFile(taskId: string, rel: string): Promise<string> {
    return fs.readFile(path.join(root, 'tasks', taskId, rel), 'utf8');
  }

  it('writes scripts + index + manifest + env probes', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    const bb = makeBundleBuilder({ artifacts });

    const scripts: ScriptEntry[] = [
      { id: 's1', url: 'https://a/x.js', hash: 'abc123', source: 'console.log(1);' },
      { id: 's2', url: 'https://b/m.mjs', hash: 'def456', source: 'export const k = 1;' },
    ];

    const r = await bb.build({
      taskId: 't1',
      scripts,
      hooks: [],
      networkSamples: [],
      envProbes: [
        { name: 'userAgent', value: 'Firefox' },
        { name: 'platform', value: 'darwin' },
      ],
    });

    expect(r.taskRoot).toBe(path.join(root, 'tasks', 't1'));
    expect(r.fileTree).toContain('scripts/abc123.js');
    expect(r.fileTree).toContain('scripts/def456.mjs');
    expect(r.fileTree).toContain('scripts.index.json');
    expect(r.fileTree).toContain('env/probes.json');
    expect(r.fileTree).toContain('bundle.manifest.json');

    expect(await readTaskFile('t1', 'scripts/abc123.js')).toBe('console.log(1);');
    expect(await readTaskFile('t1', 'scripts/def456.mjs')).toBe('export const k = 1;');

    const index = JSON.parse(await readTaskFile('t1', 'scripts.index.json'));
    expect(index).toHaveLength(2);
    expect(index[0]).toEqual({ id: 's1', url: 'https://a/x.js', hash: 'abc123', bytes: 15, file: 'scripts/abc123.js' });

    const env = JSON.parse(await readTaskFile('t1', 'env/probes.json'));
    expect(env).toEqual({ userAgent: 'Firefox', platform: 'darwin' });

    const manifest = JSON.parse(await readTaskFile('t1', 'bundle.manifest.json'));
    expect(manifest.taskId).toBe('t1');
    expect(manifest.scriptCount).toBe(2);
    expect(manifest.envProbeCount).toBe(2);
  });

  it('appends hooks as runtime-evidence.jsonl lines', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    const bb = makeBundleBuilder({ artifacts });
    const hooks: HookEntry[] = [
      { hookId: 'h1', def: { fn: 'fetch' }, workerInjections: [], samples: [{ at: 1, args: ['/a'] }] },
      { hookId: 'h2', def: { fn: 'JSON.parse' }, workerInjections: [], samples: [] },
    ];
    const r = await bb.build({ taskId: 't2', scripts: [], hooks, networkSamples: [], envProbes: [] });
    expect(r.fileTree).toContain('runtime-evidence.jsonl');
    const content = await readTaskFile('t2', 'runtime-evidence.jsonl');
    const lines = content.trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].kind).toBe('hook');
    expect(lines[0].hookId).toBe('h1');
    expect(lines[0].samples).toEqual([{ at: 1, args: ['/a'] }]);
  });

  it('writes network samples to network.jsonl', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    const bb = makeBundleBuilder({ artifacts });
    const r = await bb.build({
      taskId: 't3',
      scripts: [],
      hooks: [],
      networkSamples: [
        { requestId: 'r1', url: 'https://a/api', method: 'POST', status: 200 },
        { requestId: 'r2', url: 'https://a/api2', method: 'GET', status: 404 },
      ],
      envProbes: [],
    });
    expect(r.fileTree).toContain('network.jsonl');
    const lines = (await readTaskFile('t3', 'network.jsonl')).trim().split('\n').map(l => JSON.parse(l));
    expect(lines.map((l: any) => l.requestId)).toEqual(['r1', 'r2']);
  });

  it('skips network/runtime-evidence files when empty', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    const bb = makeBundleBuilder({ artifacts });
    const r = await bb.build({ taskId: 't4', scripts: [], hooks: [], networkSamples: [], envProbes: [] });
    expect(r.fileTree).not.toContain('runtime-evidence.jsonl');
    expect(r.fileTree).not.toContain('network.jsonl');
    expect(r.fileTree).toContain('env/probes.json');
    expect(r.fileTree).toContain('bundle.manifest.json');
  });

  it('sanitizes filenames and falls back to id when hash absent', async () => {
    const artifacts = makeTaskArtifacts({ artifactsRoot: root });
    const bb = makeBundleBuilder({ artifacts });
    const r = await bb.build({
      taskId: 't5',
      scripts: [{ id: 's/weird id', url: 'https://x/?q=1', hash: '', source: 'x' }],
      hooks: [],
      networkSamples: [],
      envProbes: [],
    });
    const written = r.fileTree.find(f => f.startsWith('scripts/'));
    expect(written).toBeDefined();
    expect(written).toMatch(/scripts\/s_weird_id\.js/);
  });

  it('networkSamplesFromRequests flattens RequestPool entries', () => {
    const entries: RequestEntry[] = [
      {
        requestId: 'r1',
        req: { url: 'https://x/a', method: 'GET', headers: { 'x-test': '1' } },
        res: { status: 200 },
        initiator: { type: 'script' },
        bodyRef: 'body-1',
      },
      { requestId: 'r2', req: {}, res: undefined },
    ];
    const samples = networkSamplesFromRequests(entries);
    expect(samples[0]).toEqual({
      requestId: 'r1',
      url: 'https://x/a',
      method: 'GET',
      status: 200,
      initiator: { type: 'script' },
      headers: { 'x-test': '1' },
      bodyRef: 'body-1',
    });
    expect(samples[1].requestId).toBe('r2');
    expect(samples[1].url).toBeUndefined();
  });
});
