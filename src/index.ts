import { ArrowFunctionExpression } from '@babel/types';
import { inlineObjectBindingVisitor } from './inline-object-binding-visitor';
import { combineVisitors } from './utils/combine-visitors';
import { inlineObjectLiteralReferenceVisitor } from './inline-object-literal-reference-visitor';
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
    visitor: combineVisitors<PluginState>(
      // TODO handle cases where the function is declared after it's use
      markInlineFunctionsVisitor,
      performEtaExpansionVisitor,
      inlineObjectLiteralReferenceVisitor,
      inlineObjectBindingVisitor,
    ),
  };
}
