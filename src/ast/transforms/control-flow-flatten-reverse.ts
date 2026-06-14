import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import type { AstTransformResult } from '../../capabilities/types.js';

const traverse = (_traverse as any).default ?? _traverse;
const generate = (_generate as any).default ?? _generate;

interface StateNode {
  from: number;
  body: t.Statement[];
  to: number | null;
}

type StateRewrite =
  | { kind: 'none' }
  | { kind: 'dag'; statements: t.Statement[] }
  | { kind: 'cyclic'; summary: string };

/**
 * Control-flow-flattening reverse.
 *
 * Type 1 (dispatch-array): discriminant is <orderVar>[<counter>++]. The order
 *         variable is a "N|M|...".split('|') or array literal. Rebuilds the
 *         linear sequence by reading the order array left-to-right.
 * Type 2 (state-machine): discriminant is a plain identifier. Each case body
 *         ends with state = N; break; (transition) or return/throw/break-fallthrough
 *         (terminal). If acyclic, walks from the initial state and emits the bodies
 *         linearly. Cyclic graphs get a CFF-GRAPH hint comment instead.
 *
 * Falls back to the v1 leading-comment HINT when neither shape matches.
 */
export function controlFlowFlattenReverse(source: string): AstTransformResult {
  const ast = parse(source, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
  let changed = false;

  traverse(ast, {
    WhileStatement(path: any) {
      const node = path.node as t.WhileStatement;
      const { test, body } = node;
      if (!t.isBooleanLiteral(test) || test.value !== true) return;
      if (!t.isBlockStatement(body)) return;
      const sw = body.body.find((s) => t.isSwitchStatement(s)) as t.SwitchStatement | undefined;
      if (!sw) return;

      const dispatchResult = tryDispatchArrayRewrite(path, sw);
      if (dispatchResult) {
        path.replaceWithMultiple(dispatchResult);
        changed = true;
        return;
      }

      const stateResult = tryStateMachineRewrite(path, sw);
      if (stateResult.kind === 'dag') {
        path.replaceWithMultiple(stateResult.statements);
        changed = true;
        return;
      }
      if (stateResult.kind === 'cyclic') {
        prependBlockComment(node, ' CFF-GRAPH: ' + stateResult.summary + ' ');
        changed = true;
        return;
      }

      const hintText = 'HINT: flattened control flow';
      const existing = (node.leadingComments ?? []) as Array<{ value: string }>;
      if (existing.some((c) => c.value.trim() === hintText)) return;
      prependBlockComment(node, ' ' + hintText + ' ');
      changed = true;
    },
  });

  const out = generate(ast, { retainLines: false, comments: true });
  return { code: out.code, changed };
}

// Type 1: dispatch array ----------------------------------------------------

function tryDispatchArrayRewrite(path: any, sw: t.SwitchStatement): t.Statement[] | null {
  const disc = sw.discriminant;
  if (!t.isMemberExpression(disc) || !disc.computed) return null;
  if (!t.isIdentifier(disc.object)) return null;
  const orderName = disc.object.name;

  const propExpr = disc.property;
  let counterName: string | null = null;
  if (t.isUpdateExpression(propExpr) && t.isIdentifier(propExpr.argument)) {
    counterName = propExpr.argument.name;
  } else if (t.isIdentifier(propExpr)) {
    counterName = propExpr.name;
  }
  if (!counterName) return null;

  const orderBinding = path.scope.getBinding(orderName);
  if (!orderBinding || !orderBinding.path.isVariableDeclarator()) return null;
  const orderInit = (orderBinding.path.node as t.VariableDeclarator).init;
  const order = parseOrderArray(orderInit);
  if (!order) return null;

  const counterBinding = path.scope.getBinding(counterName);
  if (!counterBinding || !counterBinding.path.isVariableDeclarator()) return null;
  const counterInit = (counterBinding.path.node as t.VariableDeclarator).init;
  if (!counterInit || !t.isNumericLiteral(counterInit)) return null;
  const start = counterInit.value;
  if (start < 0 || start >= order.length) return null;

  const caseMap = new Map<string, t.Statement[]>();
  for (const c of sw.cases) {
    if (!c.test) continue;
    let label: string | null = null;
    if (t.isStringLiteral(c.test)) label = c.test.value;
    else if (t.isNumericLiteral(c.test)) label = String(c.test.value);
    if (label === null) return null;
    const cleaned: t.Statement[] = [];
    for (const s of c.consequent) {
      if (t.isContinueStatement(s) || t.isBreakStatement(s)) continue;
      cleaned.push(s);
    }
    caseMap.set(label, cleaned);
  }

  const result: t.Statement[] = [];
  for (let i = start; i < order.length; i++) {
    const label = order[i];
    if (label === undefined) return null;
    const stmts = caseMap.get(label);
    if (!stmts) return null;
    result.push(...stmts);
  }
  return result;
}

function parseOrderArray(init: t.Expression | null | undefined): string[] | null {
  if (!init) return null;
  if (
    t.isCallExpression(init) &&
    t.isMemberExpression(init.callee) &&
    t.isStringLiteral(init.callee.object) &&
    t.isIdentifier(init.callee.property) &&
    init.callee.property.name === 'split' &&
    init.arguments.length === 1
  ) {
    const sepArg = init.arguments[0];
    if (!sepArg || !t.isStringLiteral(sepArg)) return null;
    return init.callee.object.value.split(sepArg.value);
  }
  if (t.isArrayExpression(init)) {
    const out: string[] = [];
    for (const el of init.elements) {
      if (el && t.isStringLiteral(el)) out.push(el.value);
      else if (el && t.isNumericLiteral(el)) out.push(String(el.value));
      else return null;
    }
    return out;
  }
  return null;
}

// Type 2: state machine -----------------------------------------------------

function tryStateMachineRewrite(path: any, sw: t.SwitchStatement): StateRewrite {
  const disc = sw.discriminant;
  if (!t.isIdentifier(disc)) return { kind: 'none' };
  const stateName = disc.name;

  const binding = path.scope.getBinding(stateName);
  if (!binding || !binding.path.isVariableDeclarator()) return { kind: 'none' };
  const init = (binding.path.node as t.VariableDeclarator).init;
  if (!init || !t.isNumericLiteral(init)) return { kind: 'none' };
  const startState = init.value;

  const realCases = sw.cases.filter((c) => c.test);
  if (realCases.length < 2) return { kind: 'none' };

  const nodes = new Map<number, StateNode>();
  for (const c of realCases) {
    if (!t.isNumericLiteral(c.test)) return { kind: 'none' };
    const from = (c.test as t.NumericLiteral).value;

    const consequent = c.consequent.slice();
    while (consequent.length > 0) {
      const last = consequent[consequent.length - 1];
      if (last && (t.isBreakStatement(last) || t.isContinueStatement(last))) {
        consequent.pop();
      } else break;
    }

    let to: number | null = null;
    if (consequent.length > 0) {
      const last = consequent[consequent.length - 1];
      if (
        last &&
        t.isExpressionStatement(last) &&
        t.isAssignmentExpression(last.expression) &&
        last.expression.operator === '=' &&
        t.isIdentifier(last.expression.left) &&
        last.expression.left.name === stateName &&
        t.isNumericLiteral(last.expression.right)
      ) {
        to = last.expression.right.value;
        consequent.pop();
      }
    }

    nodes.set(from, { from, body: consequent, to });
  }

  const visited = new Set<number>();
  const orderTraversal: number[] = [];
  let cur: number | null = startState;
  while (cur !== null) {
    if (visited.has(cur)) {
      return { kind: 'cyclic', summary: formatGraph(nodes, startState) };
    }
    visited.add(cur);
    orderTraversal.push(cur);
    const n = nodes.get(cur);
    if (!n) return { kind: 'none' };
    cur = n.to;
  }

  const statements: t.Statement[] = [];
  for (const s of orderTraversal) {
    const n = nodes.get(s);
    if (!n) return { kind: 'none' };
    statements.push(...n.body);
  }
  return { kind: 'dag', statements };
}

function formatGraph(nodes: Map<number, StateNode>, start: number): string {
  const transitions: string[] = [];
  for (const n of nodes.values()) {
    transitions.push(n.from + '->' + (n.to === null ? 'end' : String(n.to)));
  }
  return 'start=' + start + '; ' + transitions.join(',');
}

function prependBlockComment(node: t.Node, value: string): void {
  if (!node.leadingComments) node.leadingComments = [];
  (node.leadingComments as Array<{ type: string; value: string }>).push({
    type: 'CommentBlock',
    value,
  });
}
