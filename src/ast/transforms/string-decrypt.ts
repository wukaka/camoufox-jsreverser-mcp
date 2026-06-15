import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import { createContext, runInContext } from 'node:vm';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

interface DecoderInfo {
  arrName: string;
  /** subtracted from the input index before lookup: arr[idx - offset] */
  offset: number;
  /** numeric base used when the input is a string literal; 0 = treat as already-numeric */
  base: 10 | 16 | 0;
}

/**
 * String-decryption transform.
 *
 * Phase 1: collect static string arrays at any scope (var/let/const).
 * Phase 2: detect rotation IIFEs operating on a known string array and execute
 *          them in a Node vm sandbox to permute the cached array.
 * Phase 3: identify decoder functions whose return is arr[expr-of-param] with
 *          common variants: direct index, +/-N offset, unary +, parseInt.
 * Phase 4: replace decoder call sites and direct numeric member-access references
 *          with the resolved string literal.
 */
export function stringDecrypt(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous' });
  let changed = false;

  // Phase 1 -----------------------------------------------------------------
  const stringArrays = new Map<string, string[]>();

  traverse(ast, {
    VariableDeclarator(path: any) {
      const node = path.node as t.VariableDeclarator;
      if (!t.isIdentifier(node.id)) return;
      if (!node.init || !t.isArrayExpression(node.init)) return;
      const elements = node.init.elements;
      if (elements.length === 0) return;
      const strings: string[] = [];
      for (const el of elements) {
        if (!el || !t.isStringLiteral(el)) return;
        strings.push(el.value);
      }
      stringArrays.set(node.id.name, strings);
    },
  });

  if (stringArrays.size === 0) {
    const out = generate(ast, { retainLines: false });
    return { code: out.code, changed: false };
  }

  // Phase 2 -----------------------------------------------------------------
  traverse(ast, {
    ExpressionStatement(path: any) {
      const expr = path.node.expression as t.Expression;
      if (!t.isCallExpression(expr)) return;
      const callee = expr.callee;
      if (!t.isFunctionExpression(callee) && !t.isArrowFunctionExpression(callee)) return;
      const args = expr.arguments;
      if (args.length < 1) return;
      const arg0 = args[0];
      if (!arg0 || !t.isIdentifier(arg0)) return;
      const arrName = arg0.name;
      const arr = stringArrays.get(arrName);
      if (!arr) return;

      const iifeCode = generate(expr).code;
      try {
        const sandbox: { __mcpInput: string[]; __mcpResult: unknown } = {
          __mcpInput: arr.slice(),
          __mcpResult: null,
        };
        const wrapCode =
          'var ' + arrName + ' = __mcpInput;\n' +
          '(' + iifeCode + ');\n' +
          '__mcpResult = ' + arrName + ';\n';
        const ctx = createContext(sandbox);
        runInContext(wrapCode, ctx, { timeout: 1000 });
        const result = sandbox.__mcpResult;
        if (!Array.isArray(result)) return;
        if (result.length !== arr.length) return;
        if (!result.every((x: unknown) => typeof x === 'string')) return;
        const newArr = result as string[];
        const contentsChanged = newArr.some((v, i) => v !== arr[i]);
        if (!contentsChanged) return;
        stringArrays.set(arrName, newArr);
        path.remove();
        changed = true;
      } catch {
        // Sandbox execution failed: leave the IIFE alone.
      }
    },
  });

  // Phase 3 -----------------------------------------------------------------
  const decoders = new Map<string, DecoderInfo>();

  traverse(ast, {
    FunctionDeclaration(path: any) {
      const node = path.node as t.FunctionDeclaration;
      if (!node.id) return;
      const info = matchDecoder(node, stringArrays);
      if (info) decoders.set(node.id.name, info);
    },
    VariableDeclarator(path: any) {
      const node = path.node as t.VariableDeclarator;
      if (!t.isIdentifier(node.id)) return;
      if (!node.init) return;
      if (!t.isFunctionExpression(node.init) && !t.isArrowFunctionExpression(node.init)) return;
      const info = matchDecoder(node.init, stringArrays);
      if (info) decoders.set(node.id.name, info);
    },
  });

  // Phase 4 -----------------------------------------------------------------
  traverse(ast, {
    CallExpression(path: any) {
      const node = path.node as t.CallExpression;
      if (!t.isIdentifier(node.callee)) return;
      const info = decoders.get(node.callee.name);
      if (!info) return;
      const args = node.arguments;
      if (args.length < 1) return;
      const arg = args[0];
      if (!arg) return;
      const idx = resolveCallIndex(arg, info);
      if (idx === null) return;
      const arr = stringArrays.get(info.arrName);
      if (!arr) return;
      if (idx < 0 || idx >= arr.length) return;
      const value = arr[idx];
      if (value === undefined) return;
      path.replaceWith(t.stringLiteral(value));
      changed = true;
    },
    MemberExpression(path: any) {
      const node = path.node as t.MemberExpression;
      if (!node.computed) return;
      if (!t.isIdentifier(node.object)) return;
      const arr = stringArrays.get(node.object.name);
      if (!arr) return;
      let idx: number | null = null;
      const prop = node.property;
      if (t.isNumericLiteral(prop)) {
        idx = prop.value;
      } else if (t.isStringLiteral(prop)) {
        const n = Number(prop.value);
        if (Number.isFinite(n) && Number.isInteger(n)) idx = n;
      }
      if (idx === null) return;
      if (idx < 0 || idx >= arr.length) return;
      const value = arr[idx];
      if (value === undefined) return;
      path.replaceWith(t.stringLiteral(value));
      changed = true;
    },
  });

  const out = generate(ast, { retainLines: false });
  return { code: out.code, changed };
}

// Decoder pattern matching --------------------------------------------------

function matchDecoder(
  fn: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  stringArrays: Map<string, string[]>,
): DecoderInfo | null {
  const params = fn.params;
  if (params.length < 1) return null;
  const param0 = params[0];
  if (!param0 || !t.isIdentifier(param0)) return null;
  const paramName = param0.name;

  let returnExpr: t.Expression | null = null;
  let extraOffset = 0;

  if (t.isBlockStatement(fn.body)) {
    for (const stmt of fn.body.body) {
      if (t.isReturnStatement(stmt) && stmt.argument) {
        returnExpr = stmt.argument;
        break;
      }
      const o = parseSelfOffset(stmt, paramName);
      if (o !== null) extraOffset += o;
    }
  } else {
    returnExpr = fn.body as t.Expression;
  }
  if (!returnExpr || !t.isMemberExpression(returnExpr)) return null;
  if (!t.isIdentifier(returnExpr.object)) return null;
  if (!returnExpr.computed) return null;
  const arrName = returnExpr.object.name;
  if (!stringArrays.has(arrName)) return null;

  const idxExpr = returnExpr.property;
  if (t.isPrivateName(idxExpr)) return null;

  if (t.isIdentifier(idxExpr) && idxExpr.name === paramName) {
    return { arrName, offset: extraOffset, base: 0 };
  }
  if (
    t.isUnaryExpression(idxExpr) &&
    idxExpr.operator === '+' &&
    t.isIdentifier(idxExpr.argument) &&
    idxExpr.argument.name === paramName
  ) {
    return { arrName, offset: extraOffset, base: 0 };
  }
  if (
    t.isBinaryExpression(idxExpr) &&
    (idxExpr.operator === '-' || idxExpr.operator === '+') &&
    t.isIdentifier(idxExpr.left) &&
    idxExpr.left.name === paramName &&
    t.isNumericLiteral(idxExpr.right)
  ) {
    const v = idxExpr.right.value;
    const offset = idxExpr.operator === '-' ? v : -v;
    return { arrName, offset: offset + extraOffset, base: 0 };
  }
  if (
    t.isCallExpression(idxExpr) &&
    t.isIdentifier(idxExpr.callee) &&
    idxExpr.callee.name === 'parseInt'
  ) {
    const piArgs = idxExpr.arguments;
    const a0 = piArgs[0];
    if (!a0 || !t.isIdentifier(a0) || a0.name !== paramName) return null;
    let base: 10 | 16 = 10;
    if (piArgs.length >= 2) {
      const a1 = piArgs[1];
      if (a1 && t.isNumericLiteral(a1)) {
        if (a1.value === 16) base = 16;
        else if (a1.value === 10) base = 10;
        else return null;
      } else {
        return null;
      }
    }
    return { arrName, offset: extraOffset, base };
  }

  return null;
}

function parseSelfOffset(stmt: t.Statement, paramName: string): number | null {
  if (!t.isExpressionStatement(stmt)) return null;
  const expr = stmt.expression;
  if (!t.isAssignmentExpression(expr) || expr.operator !== '=') return null;
  if (!t.isIdentifier(expr.left) || expr.left.name !== paramName) return null;
  if (!t.isBinaryExpression(expr.right)) return null;
  const r = expr.right;
  if (r.operator !== '-' && r.operator !== '+') return null;
  if (!t.isIdentifier(r.left) || r.left.name !== paramName) return null;
  if (!t.isNumericLiteral(r.right)) return null;
  return r.operator === '-' ? r.right.value : -r.right.value;
}

function resolveCallIndex(arg: t.Node, info: DecoderInfo): number | null {
  if (t.isNumericLiteral(arg)) {
    return arg.value - info.offset;
  }
  if (t.isUnaryExpression(arg) && arg.operator === '-' && t.isNumericLiteral(arg.argument)) {
    return -arg.argument.value - info.offset;
  }
  if (t.isStringLiteral(arg)) {
    const b = info.base === 0 ? 10 : info.base;
    const n = parseInt(arg.value, b);
    if (Number.isNaN(n) || !Number.isFinite(n)) return null;
    return n - info.offset;
  }
  return null;
}
