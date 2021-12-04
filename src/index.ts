import { ArrowFunctionExpression } from '@babel/types';
import { inlineObjectBindingVisitor } from './inline-object-binding-visitor';
import { inlinePointlessBindingsVisitor } from './inline-pointless-bindings';
import { inlineSingleUseBindingsVisitor } from './inline-single-use-bindings';
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

export default function plugin(): () => PluginObj<PluginState> {
  // TODO correctly cache function references across files
  const inlineFunctionCache = {};

  return () => ({
    name: 'inline-functions',
    pre() {
      this.inlineFunctions = inlineFunctionCache;
    },
    visitor: combineVisitors<PluginState>(
      // TODO handle cases where the function is declared after it's use
      markInlineFunctionsVisitor,
      performEtaExpansionVisitor,
      inlineObjectLiteralReferenceVisitor,
      inlineObjectBindingVisitor,
      inlineSingleUseBindingsVisitor,
      inlinePointlessBindingsVisitor,
    ),
  });
}
