import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

/**
 * Scans for top-level `var x = ['s1','s2',...]` patterns, then replaces
 * `x[N]` references with the corresponding string literal.
 * Conservative: only handles simple numeric index access on a known static array.
 */
export function stringDecrypt(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous' });
  let changed = false;

  // Collect top-level static string arrays: varName -> string[]
  const stringArrays = new Map<string, string[]>();

  traverse(ast, {
    VariableDeclaration(path: any) {
      // Only process top-level (program body) declarations
      if (!t.isProgram(path.parent)) return;
      for (const decl of path.node.declarations) {
        if (!t.isIdentifier(decl.id)) continue;
        if (!t.isArrayExpression(decl.init)) continue;
        const elements = (decl.init as t.ArrayExpression).elements;
        if (!elements || elements.length === 0) continue;
        // Check all elements are string literals
        const strings: string[] = [];
        let allStrings = true;
        for (const el of elements) {
          if (el && t.isStringLiteral(el)) {
            strings.push((el as t.StringLiteral).value);
          } else {
            allStrings = false;
            break;
          }
        }
        if (allStrings && strings.length > 0) {
          stringArrays.set((decl.id as t.Identifier).name, strings);
        }
      }
    },
  });

  if (stringArrays.size === 0) {
    const out = generate(ast, { retainLines: false });
    return { code: out.code, changed: false };
  }

  // Replace x[N] references with string literals
  traverse(ast, {
    MemberExpression(path: any) {
      const { object, property, computed } = path.node;
      if (!computed) return;
      if (!t.isIdentifier(object)) return;
      if (!t.isNumericLiteral(property)) return;
      const arr = stringArrays.get((object as t.Identifier).name);
      if (!arr) return;
      const idx = (property as t.NumericLiteral).value;
      if (idx < 0 || idx >= arr.length) return;
      path.replaceWith(t.stringLiteral(arr[idx]!));
      changed = true;
    },
  });

  const out = generate(ast, { retainLines: false });
  return { code: out.code, changed };
}
