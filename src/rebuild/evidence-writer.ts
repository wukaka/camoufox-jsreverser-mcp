import type { TaskArtifacts } from '../capabilities/types.js';

export interface ReverseEvidence {
  /** Free-form category, e.g. "stealth", "crypto", "anti-bot". */
  category: string;
  /** Short label of the observation. */
  signal: string;
  /** Detailed body — narrative or structured payload. */
  detail?: unknown;
  /** Pointers to supporting artefacts (URLs, scriptIds, request IDs, etc.). */
  refs?: string[];
  /** Operator-supplied severity, optional. */
  severity?: 'info' | 'low' | 'medium' | 'high';
}

export interface StoredReverseEvidence extends ReverseEvidence {
  kind: 'evidence';
  ts: number;
}

export interface EvidenceWriterDeps {
  artifacts: TaskArtifacts;
  now?: () => number;
}

export interface EvidenceWriter {
  record(taskId: string, ev: ReverseEvidence): Promise<StoredReverseEvidence>;
  list(taskId: string): Promise<StoredReverseEvidence[]>;
}

const REL_PATH = 'runtime-evidence.jsonl';

export function makeEvidenceWriter(deps: EvidenceWriterDeps): EvidenceWriter {
  const now = deps.now ?? (() => Date.now());
  return {
    async record(taskId, ev) {
      const stored: StoredReverseEvidence = { kind: 'evidence', ts: now(), ...ev };
      await deps.artifacts.write(taskId, REL_PATH, JSON.stringify(stored));
      return stored;
    },
    async list(taskId) {
      let text: string;
      try {
        text = await deps.artifacts.read(taskId, REL_PATH);
      } catch {
        return [];
      }
      const out: StoredReverseEvidence[] = [];
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj && obj.kind === 'evidence') out.push(obj as StoredReverseEvidence);
        } catch {
          // skip malformed
        }
      }
      return out;
    },
  };
}
