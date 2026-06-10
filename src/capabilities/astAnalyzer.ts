import { parse } from '@babel/parser';
import type { AstAnalyzer, AstParseResult, AstTransformResult } from './types.js';
import { TRANSFORMS } from '../ast/transforms/index.js';
import { AstParseFailedError } from './errors.js';

export function makeAstAnalyzer(): AstAnalyzer {
  return {
    parse(source: string): AstParseResult {
      try {
        const ast = parse(source, { sourceType: 'unambiguous' });
        return { ast };
      } catch (e: any) {
        return {
          ast: null,
          error: {
            line: e?.loc?.line ?? 0,
            column: e?.loc?.column ?? 0,
            message: e?.message ?? String(e),
          },
        };
      }
    },

    runTransform(source: string, transformName: string): AstTransformResult {
      const fn = TRANSFORMS[transformName];
      if (!fn) throw new Error(`astAnalyzer.runTransform: unknown transform ${transformName}`);
      try {
        return fn(source);
      } catch (e) {
        throw new AstParseFailedError({
          transform: transformName,
          message: (e as Error).message,
        });
      }
    },

    listTransforms(): string[] {
      return Object.keys(TRANSFORMS);
    },
  };
}
