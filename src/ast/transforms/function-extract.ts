import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

export interface FunctionInfo {
  name: string | null;
  paramCount: number;
  line: number;
  column: number;
}

/**
 * Read-only transform: extracts metadata about every named/anonymous function
 * declaration in the source. Does not modify the code.
 * Returns analysis: { functions: FunctionInfo[] }.
 */
export function functionExtract(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous' });
  const functions: FunctionInfo[] = [];

  traverse(ast, {
    FunctionDeclaration(path: any) {
      const node: t.FunctionDeclaration = path.node;
      functions.push({
        name: node.id ? node.id.name : null,
        paramCount: node.params.length,
        line: node.loc?.start.line ?? 0,
        column: node.loc?.start.column ?? 0,
      });
    },
    FunctionExpression(path: any) {
      const node: t.FunctionExpression = path.node;
      // Named function expressions
      const name = node.id ? node.id.name : null;
      functions.push({
        name,
        paramCount: node.params.length,
        line: node.loc?.start.line ?? 0,
        column: node.loc?.start.column ?? 0,
      });
    },
    ArrowFunctionExpression(path: any) {
      const node: t.ArrowFunctionExpression = path.node;
      functions.push({
        name: null,
        paramCount: node.params.length,
        line: node.loc?.start.line ?? 0,
        column: node.loc?.start.column ?? 0,
      });
    },
  });

  const out = generate(ast, { retainLines: false });
  return { code: out.code, changed: false, analysis: { functions } };
}
