import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

/**
 * Detects `while(true) { switch(state) { ... } }` control-flow-flattening patterns.
 * v1: does not rewrite — just prepends a HINT comment to each detected pattern.
 * Sets changed=true if at least one pattern was detected.
 */
export function controlFlowFlattenReverse(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
  let changed = false;

  traverse(ast, {
    WhileStatement(path: any) {
      const { test, body } = path.node;
      // Check: while (true) { ... }
      const isTrueLoop = t.isBooleanLiteral(test) && (test as t.BooleanLiteral).value === true;
      if (!isTrueLoop) return;
      // Check: body is a block containing a switch statement
      if (!t.isBlockStatement(body)) return;
      const hasSwitchOnState = (body as t.BlockStatement).body.some(stmt => {
        if (!t.isSwitchStatement(stmt)) return false;
        // discriminant can be any identifier — we just check it's a switch
        return true;
      });
      if (!hasSwitchOnState) return;

      // Prepend a comment to the while statement
      const hint = '/* HINT: flattened control flow */';
      const existing = (path.node.leadingComments ?? []) as Array<{ value: string }>;
      if (existing.some(c => c.value.trim() === 'HINT: flattened control flow')) return;

      // Use innerComments approach: add leading comment to the while node
      if (!path.node.leadingComments) path.node.leadingComments = [];
      (path.node.leadingComments as Array<{ type: string; value: string }>).push({
        type: 'CommentBlock',
        value: ' HINT: flattened control flow ',
      });
      changed = true;
    },
  });

  const out = generate(ast, { retainLines: false, comments: true });
  return { code: out.code, changed };
}
