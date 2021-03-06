import { ArrowFunctionExpression } from '@babel/types';
import { inlineObjectLiteralReference } from './inline-object-literal-reference';
import { markInlineFunctionsVisitor } from './mark-inline-function-visitor';
import { performEtaExpansionVisitor } from './perform-eta-expansion-visitor';
import { PluginObj } from '@babel/core';

export interface InlineFunctionsMap {
  [k: string]: ArrowFunctionExpression;
}

export interface PluginState {
  inlineFunctions: InlineFunctionsMap;
}

export default function plugin(): PluginObj<PluginState> {
  return {
    name: 'inline-functions',
    pre() {
      this.inlineFunctions = {};
    },
    visitor: {
      ...markInlineFunctionsVisitor,
      ...performEtaExpansionVisitor,
      ...inlineObjectLiteralReference,
    },
  };
}
