export interface Requirement {
  name: string;
  version?: string;
  /** Free-form line for things we don't parse (e.g. `-e git+...`). */
  raw?: string;
}

export interface EnvDiff {
  added: Requirement[];
  removed: Requirement[];
  changed: Array<{ name: string; from?: string; to?: string }>;
  unchanged: Requirement[];
}

const REQ_LINE = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:([<>=!~]=?|===)\s*([^\s;#]+))?\s*(?:#.*)?$/;

/** Parses a pip-style requirements.txt body. Skips comments and blank lines.
 *  Unrecognized lines are kept as { name: '', raw } so callers can still see them. */
export function parseRequirements(text: string): Requirement[] {
  const out: Requirement[] = [];
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = REQ_LINE.exec(line);
    if (m) {
      const name = m[1]!;
      const op = m[2];
      const ver = m[3];
      const version = op && ver ? `${op}${ver}` : undefined;
      out.push(version ? { name, version } : { name });
    } else {
      out.push({ name: '', raw: line });
    }
  }
  return out;
}

export function diffRequirements(left: Requirement[], right: Requirement[]): EnvDiff {
  const leftMap = new Map<string, Requirement>();
  const rightMap = new Map<string, Requirement>();
  for (const r of left) if (r.name) leftMap.set(r.name, r);
  for (const r of right) if (r.name) rightMap.set(r.name, r);

  const added: Requirement[] = [];
  const removed: Requirement[] = [];
  const changed: EnvDiff['changed'] = [];
  const unchanged: Requirement[] = [];

  for (const [name, r] of rightMap) {
    const l = leftMap.get(name);
    if (!l) {
      added.push(r);
    } else if ((l.version ?? '') !== (r.version ?? '')) {
      changed.push({ name, from: l.version, to: r.version });
    } else {
      unchanged.push(r);
    }
  }
  for (const [name, r] of leftMap) {
    if (!rightMap.has(name)) removed.push(r);
  }

  added.sort((a, b) => a.name.localeCompare(b.name));
  removed.sort((a, b) => a.name.localeCompare(b.name));
  changed.sort((a, b) => a.name.localeCompare(b.name));
  unchanged.sort((a, b) => a.name.localeCompare(b.name));

  return { added, removed, changed, unchanged };
}

/** Convenience: diff two raw requirement file bodies. */
export function diffRequirementFiles(leftText: string, rightText: string): EnvDiff {
  return diffRequirements(parseRequirements(leftText), parseRequirements(rightText));
}
