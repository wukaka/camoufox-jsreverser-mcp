import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

/**
 * Removes unreachable statements after a top-level `return` or `throw`
 * within the same block. Only removes statements in the immediate block
 * where the early exit occurs — does not recurse into nested blocks.
 */
export function deadCode(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous' });
  let changed = false;

  traverse(ast, {
    BlockStatement(path: any) {
      const stmts: t.Statement[] = (path.node as t.BlockStatement).body;
      let cutAt = -1;
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        if (t.isReturnStatement(stmt) || t.isThrowStatement(stmt)) {
          cutAt = i;
          break;
        }
      }
      // If there are statements after the early exit, remove them
      if (cutAt >= 0 && cutAt < stmts.length - 1) {
        (path.node as t.BlockStatement).body = stmts.slice(0, cutAt + 1);
        changed = true;
      }
    },
  });

  const out = generate(ast, { retainLines: false });
  return { code: out.code, changed };
}
