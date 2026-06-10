import { InitiatorTracer, NormalizedInitiator, NormalizedStackFrame } from './types.js';

interface BidiCallFrame {
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  functionName?: string;
}

interface BidiInitiator {
  type?: string;
  request?: string;
  stackTrace?: { callFrames?: BidiCallFrame[] };
}

const KNOWN_TYPES = new Set(['script', 'parser', 'preflight', 'preload']);

export function makeInitiatorTracer(): InitiatorTracer {
  return {
    normalize(initiator) {
      if (!initiator || typeof initiator !== 'object') {
        return { type: 'other', stack: [] };
      }
      const i = initiator as BidiInitiator;
      const t = (i.type && KNOWN_TYPES.has(i.type) ? i.type : 'other') as NormalizedInitiator['type'];
      const frames = i.stackTrace?.callFrames ?? [];
      const stack: NormalizedStackFrame[] = [];
      for (const f of frames) {
        stack.push({
          scriptUrl: f.url ?? '',
          line: f.lineNumber ?? 0,
          column: f.columnNumber ?? 0,
          ...(f.functionName ? { functionName: f.functionName } : {}),
        });
      }
      const result: NormalizedInitiator = { type: t, stack };
      if (i.request) result.request = i.request;
      return result;
    },
  };
}
