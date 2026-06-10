import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { TaskArtifacts } from '../../capabilities/types.js';
import { makeEvidenceWriter } from '../../rebuild/evidence-writer.js';

const schema = z.object({
  taskId: z.string().min(1),
  title: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

function fmtTs(ms: number): string {
  return new Date(ms).toISOString();
}

export const export_session_report = defineTool<Args, { path: string; bytes: number }>({
  name: 'export_session_report',
  description: 'Render a Markdown summary of the current session (scripts / requests / hooks / evidence) into artifacts/tasks/<taskId>/report.md.',
  schema,
  handler: async ({ taskId, title }: Args, session) => {
    const ta = session.caps.taskArtifacts as TaskArtifacts | undefined;
    if (!ta) return fail(ErrorReason.CapabilityUnavailable, { hint: 'taskArtifacts not wired.' });
    await ta.createTask(taskId);

    const scripts = session.scripts.list();
    const requests = session.requests.list();
    const hooks = session.hooks.list();
    const writer = makeEvidenceWriter({ artifacts: ta });
    const evidence = await writer.list(taskId);

    const lines: string[] = [];
    lines.push(`# ${title ?? `Task ${taskId} report`}`);
    lines.push('');
    lines.push(`_Generated: ${fmtTs(Date.now())}_`);
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(`- Scripts cached: **${scripts.length}**`);
    lines.push(`- Network requests captured: **${requests.length}**`);
    lines.push(`- Hooks registered: **${hooks.length}**`);
    lines.push(`- Evidence records: **${evidence.length}**`);
    lines.push('');

    if (scripts.length) {
      lines.push('## Scripts');
      lines.push('');
      lines.push('| Hash | URL | Bytes |');
      lines.push('|---|---|---:|');
      for (const s of scripts.slice(0, 50)) {
        lines.push(`| \`${s.hash}\` | ${s.url} | ${s.source.length} |`);
      }
      if (scripts.length > 50) lines.push(`| … | _and ${scripts.length - 50} more_ | |`);
      lines.push('');
    }

    if (hooks.length) {
      lines.push('## Hooks');
      lines.push('');
      for (const h of hooks) {
        lines.push(`- **${h.hookId}** — ${h.samples.length} sample(s), ${h.workerInjections.length} worker injection(s)`);
      }
      lines.push('');
    }

    if (evidence.length) {
      lines.push('## Reverse Evidence');
      lines.push('');
      for (const e of evidence) {
        const sev = e.severity ? ` _(${e.severity})_` : '';
        lines.push(`- **[${e.category}]** ${e.signal}${sev} — ${fmtTs(e.ts)}`);
        if (e.refs?.length) lines.push(`  refs: ${e.refs.map(r => `\`${r}\``).join(', ')}`);
      }
      lines.push('');
    }

    const body = lines.join('\n');
    await ta.write(taskId, 'report.md', body);
    return ok({ path: `${ta.taskRoot(taskId)}/report.md`, bytes: body.length });
  },
});
