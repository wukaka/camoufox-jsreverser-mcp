import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { makeTaskArtifacts } from '../../../src/capabilities/taskArtifacts.js';
import { ResourceNotFoundError } from '../../../src/session/errors.js';

describe('taskArtifacts', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), 'ta-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('createTask scaffolds the standard layout', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root, now: () => 1234 });
    const meta = await ta.createTask('t1');
    expect(meta.taskId).toBe('t1');
    expect(meta.createdAt).toBe(1234);
    const dir = path.join(root, 'tasks', 't1');
    expect(meta.taskRoot).toBe(dir);

    const expected = [
      'task.json',
      'runtime-evidence.jsonl',
      'network.jsonl',
      'scripts.jsonl',
      'report.md',
      'env',
      'run',
    ];
    for (const f of expected) {
      const exists = await fs.access(path.join(dir, f)).then(() => true).catch(() => false);
      expect(exists, `missing ${f}`).toBe(true);
    }
    const taskJson = JSON.parse(await fs.readFile(path.join(dir, 'task.json'), 'utf8'));
    expect(taskJson.taskId).toBe('t1');
    expect(taskJson.createdAt).toBe(1234);
  });

  it('createTask is idempotent and preserves createdAt', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root, now: () => 1000 });
    await ta.createTask('t1');
    const ta2 = makeTaskArtifacts({ artifactsRoot: root, now: () => 9999 });
    const meta = await ta2.createTask('t1');
    expect(meta.createdAt).toBe(1000);
  });

  it('write appends newline to .jsonl files', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('t1');
    await ta.write('t1', 'runtime-evidence.jsonl', JSON.stringify({ a: 1 }));
    await ta.write('t1', 'runtime-evidence.jsonl', JSON.stringify({ a: 2 }) + '\n');
    const content = await fs.readFile(path.join(root, 'tasks', 't1', 'runtime-evidence.jsonl'), 'utf8');
    expect(content).toBe('{"a":1}\n{"a":2}\n');
  });

  it('write to non-jsonl path overwrites file and creates subdirs', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('t1');
    await ta.write('t1', 'env/requirements.txt', 'pkg==1.0');
    await ta.write('t1', 'env/requirements.txt', 'pkg==2.0');
    const content = await ta.read('t1', 'env/requirements.txt');
    expect(content).toBe('pkg==2.0');
  });

  it('read throws ResourceNotFoundError when missing', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('t1');
    await expect(ta.read('t1', 'nope.txt')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('write rejects path that escapes task dir', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('t1');
    await expect(ta.write('t1', '../../etc/passwd', 'x')).rejects.toThrow(/escapes/);
  });

  it('listTasks returns all created task IDs sorted', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('b-task');
    await ta.createTask('a-task');
    expect(await ta.listTasks()).toEqual(['a-task', 'b-task']);
  });

  it('listTasks returns [] when tasks dir absent', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: path.join(root, 'missing') });
    expect(await ta.listTasks()).toEqual([]);
  });

  it('artifactsRoot / templateDir / taskRoot expose configured paths', () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root, templateDir: '/tmpl' });
    expect(ta.artifactsRoot()).toBe(root);
    expect(ta.templateDir()).toBe('/tmpl');
    expect(ta.taskRoot('xyz')).toBe(path.join(root, 'tasks', 'xyz'));
  });

  it('write accepts Uint8Array for non-jsonl paths', async () => {
    const ta = makeTaskArtifacts({ artifactsRoot: root });
    await ta.createTask('t1');
    await ta.write('t1', 'env/raw.bin', new Uint8Array([0xde, 0xad]));
    const file = await fs.readFile(path.join(root, 'tasks', 't1', 'env', 'raw.bin'));
    expect(file[0]).toBe(0xde);
    expect(file[1]).toBe(0xad);
  });
});
