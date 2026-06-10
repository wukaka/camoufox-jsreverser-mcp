import type { TaskArtifacts } from '../capabilities/types.js';
import type { ScriptEntry, RequestEntry, HookEntry } from '../session/caches.js';

export interface EnvProbe {
  name: string;
  value: unknown;
}

export interface NetworkSample {
  requestId: string;
  url?: string;
  method?: string;
  status?: number;
  initiator?: unknown;
  headers?: Record<string, string>;
  bodyRef?: string;
}

export interface BundleInput {
  taskId: string;
  scripts: ScriptEntry[];
  hooks: HookEntry[];
  networkSamples: NetworkSample[];
  envProbes: EnvProbe[];
}

export interface BundleResult {
  taskRoot: string;
  fileTree: string[];
}

function sanitizeFsName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'unnamed';
}

function scriptFilename(s: ScriptEntry): string {
  let suffix = '.js';
  try {
    const u = new URL(s.url);
    const tail = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (tail.endsWith('.mjs')) suffix = '.mjs';
    else if (tail.endsWith('.js')) suffix = '.js';
  } catch {
    // not a URL
  }
  return `${sanitizeFsName(s.hash || s.id)}${suffix}`;
}

export interface BundleBuilderDeps {
  artifacts: TaskArtifacts;
}

export function makeBundleBuilder(deps: BundleBuilderDeps) {
  const { artifacts } = deps;
  return {
    async build(input: BundleInput): Promise<BundleResult> {
      await artifacts.createTask(input.taskId);
      const fileTree: string[] = [];

      const scriptIndex = input.scripts.map(s => ({
        id: s.id,
        url: s.url,
        hash: s.hash,
        bytes: s.source.length,
        file: `scripts/${scriptFilename(s)}`,
      }));
      for (const s of input.scripts) {
        const file = `scripts/${scriptFilename(s)}`;
        await artifacts.write(input.taskId, file, s.source);
        fileTree.push(file);
      }
      await artifacts.write(input.taskId, 'scripts.index.json', JSON.stringify(scriptIndex, null, 2));
      fileTree.push('scripts.index.json');

      for (const h of input.hooks) {
        await artifacts.write(
          input.taskId,
          'runtime-evidence.jsonl',
          JSON.stringify({ kind: 'hook', hookId: h.hookId, def: h.def, samples: h.samples }),
        );
      }
      if (input.hooks.length > 0) fileTree.push('runtime-evidence.jsonl');

      for (const n of input.networkSamples) {
        await artifacts.write(input.taskId, 'network.jsonl', JSON.stringify(n));
      }
      if (input.networkSamples.length > 0) fileTree.push('network.jsonl');

      const envObj: Record<string, unknown> = {};
      for (const e of input.envProbes) envObj[e.name] = e.value;
      await artifacts.write(input.taskId, 'env/probes.json', JSON.stringify(envObj, null, 2));
      fileTree.push('env/probes.json');

      const manifest = {
        taskId: input.taskId,
        scriptCount: input.scripts.length,
        hookCount: input.hooks.length,
        networkSampleCount: input.networkSamples.length,
        envProbeCount: input.envProbes.length,
        files: fileTree.slice(),
      };
      await artifacts.write(input.taskId, 'bundle.manifest.json', JSON.stringify(manifest, null, 2));
      fileTree.push('bundle.manifest.json');

      const taskRoot = artifacts.taskRoot(input.taskId);
      return { taskRoot, fileTree };
    },
  };
}

/** Build network samples from RequestPool entries. Pulls a small flat shape per request. */
export function networkSamplesFromRequests(entries: RequestEntry[]): NetworkSample[] {
  return entries.map(e => {
    const req = (e.req ?? {}) as { url?: string; method?: string; headers?: Record<string, string> };
    const res = (e.res ?? {}) as { status?: number };
    return {
      requestId: e.requestId,
      url: req.url,
      method: req.method,
      status: res.status,
      initiator: e.initiator,
      headers: req.headers,
      bodyRef: e.bodyRef,
    };
  });
}
