import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { TaskArtifacts, TaskMeta } from './types.js';
import { ResourceNotFoundError } from '../session/errors.js';

export interface TaskArtifactsDeps {
  /** Root containing the `tasks/` directory. Defaults to <cwd>/artifacts. */
  artifactsRoot?: string;
  /** In-repo template directory for task scaffolds. Defaults to <cwd>/templates/task. */
  templateDir?: string;
  /** Clock injection for tests. */
  now?: () => number;
}

const DEFAULT_TASK_FILES = ['runtime-evidence.jsonl', 'network.jsonl', 'scripts.jsonl'];
const DEFAULT_TASK_DIRS = ['env', 'run'];

function safeRelPath(taskDir: string, relPath: string): string {
  const normalized = path.normalize(relPath).replace(/^[/\\]+/, '');
  const abs = path.resolve(taskDir, normalized);
  const rel = path.relative(taskDir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`taskArtifacts: relPath escapes task directory: ${relPath}`);
  }
  return abs;
}

export function makeTaskArtifacts(deps: TaskArtifactsDeps = {}): TaskArtifacts {
  const root = deps.artifactsRoot ?? path.resolve(process.cwd(), 'artifacts');
  const templates = deps.templateDir ?? path.resolve(process.cwd(), 'templates', 'task');
  const now = deps.now ?? (() => Date.now());
  const tasksDir = path.join(root, 'tasks');

  return {
    artifactsRoot(): string {
      return root;
    },
    templateDir(): string {
      return templates;
    },
    taskRoot(taskId: string): string {
      return path.join(tasksDir, taskId);
    },

    async createTask(taskId: string): Promise<TaskMeta> {
      const taskDir = path.join(tasksDir, taskId);
      await fs.mkdir(taskDir, { recursive: true });
      for (const d of DEFAULT_TASK_DIRS) {
        await fs.mkdir(path.join(taskDir, d), { recursive: true });
      }
      for (const f of DEFAULT_TASK_FILES) {
        const p = path.join(taskDir, f);
        try {
          await fs.access(p);
        } catch {
          await fs.writeFile(p, '', 'utf8');
        }
      }
      const taskJsonPath = path.join(taskDir, 'task.json');
      let createdAt = now();
      try {
        const existing = await fs.readFile(taskJsonPath, 'utf8');
        const parsed = JSON.parse(existing) as TaskMeta;
        createdAt = parsed.createdAt ?? createdAt;
      } catch {
        const meta: TaskMeta = { taskId, taskRoot: taskDir, createdAt };
        await fs.writeFile(taskJsonPath, JSON.stringify(meta, null, 2), 'utf8');
      }
      const reportPath = path.join(taskDir, 'report.md');
      try {
        await fs.access(reportPath);
      } catch {
        await fs.writeFile(reportPath, `# Task ${taskId}\n`, 'utf8');
      }
      return { taskId, taskRoot: taskDir, createdAt };
    },

    async write(taskId: string, relPath: string, content: string | Uint8Array): Promise<void> {
      const taskDir = path.join(tasksDir, taskId);
      const target = safeRelPath(taskDir, relPath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (relPath.endsWith('.jsonl')) {
        const line = typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
        const withNewline = line.endsWith('\n') ? line : line + '\n';
        await fs.appendFile(target, withNewline, 'utf8');
        return;
      }
      if (typeof content === 'string') {
        await fs.writeFile(target, content, 'utf8');
      } else {
        await fs.writeFile(target, content);
      }
    },

    async read(taskId: string, relPath: string): Promise<string> {
      const taskDir = path.join(tasksDir, taskId);
      const target = safeRelPath(taskDir, relPath);
      try {
        return await fs.readFile(target, 'utf8');
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          throw new ResourceNotFoundError('artifact', `${taskId}/${relPath}`);
        }
        throw err;
      }
    },

    async listTasks(): Promise<string[]> {
      try {
        const entries = await fs.readdir(tasksDir, { withFileTypes: true });
        return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      } catch (err: any) {
        if (err?.code === 'ENOENT') return [];
        throw err;
      }
    },
  };
}
