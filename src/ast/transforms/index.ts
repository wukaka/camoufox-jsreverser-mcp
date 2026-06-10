import { constantFold } from './constant-fold.js';
import { stringDecrypt } from './string-decrypt.js';
import { controlFlowFlattenReverse } from './control-flow-flatten-reverse.js';
import { deadCode } from './dead-code.js';
import { functionExtract } from './function-extract.js';
import type { AstTransformResult } from '../../capabilities/types.js';

export const TRANSFORMS: Record<string, (source: string) => AstTransformResult> = {
  'constant-fold': constantFold,
  'string-decrypt': stringDecrypt,
  'control-flow-flatten-reverse': controlFlowFlattenReverse,
  'dead-code': deadCode,
  'function-extract': functionExtract,
};
