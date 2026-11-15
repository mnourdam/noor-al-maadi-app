import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function calls(path: string, callee: string): number {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) count++;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

describe('Home collection query ownership', () => {
  it('keeps the collection hook solely inside canonical Home summary, not a discarded parallel Home result', () => {
    expect(calls('src/routes/index.tsx', 'useRealCollectionStats')).toBe(0);
    expect(calls('src/routes/index.tsx', 'useHomeSummary')).toBe(1);
    expect(calls('src/lib/stats/homeSummary.ts', 'useRealCollectionStats')).toBe(1);
  });
});
