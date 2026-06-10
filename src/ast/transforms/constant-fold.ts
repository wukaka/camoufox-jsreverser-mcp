import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

// Babel modules are CJS — when imported in ESM context, default is on .default.
const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

export function constantFold(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous' });
  let changed = false;

  traverse(ast, {
    BinaryExpression(path: any) {
      const { left, right, operator } = path.node;
      if (!t.isLiteral(left) || !t.isLiteral(right)) return;
      const lv = (left as any).value;
      const rv = (right as any).value;
      let folded: any;
      switch (operator) {
        case '+': folded = lv + rv; break;
        case '-': folded = lv - rv; break;
        case '*': folded = lv * rv; break;
        case '/': folded = lv / rv; break;
        default: return;
      }
      if (typeof folded === 'number') path.replaceWith(t.numericLiteral(folded));
      else if (typeof folded === 'string') path.replaceWith(t.stringLiteral(folded));
      else return;
      changed = true;
    },
    UnaryExpression(path: any) {
      const { operator, argument } = path.node;
      if (operator === '!' && t.isBooleanLiteral(argument)) {
        path.replaceWith(t.booleanLiteral(!(argument as any).value));
        changed = true;
      }
    },
  });

  const out = generate(ast, { retainLines: false });
  return { code: out.code, changed };
}
