import { NodePath, Scope, Visitor } from '@babel/traverse';
import {
  Comment,
  CommentBlock,
  arrowFunctionExpression, LVal, isIdentifier, isRestElement,

} from '@babel/types';
import { PluginState } from './index';
import log from './utils/log';

function hasInlineAnnotation(leadingComments: ReadonlyArray<Comment> | null) {
  return leadingComments && leadingComments.some(commentNode => (
    commentNode.type === 'CommentBlock'
    && commentNode.value[0] === '*'
    && /^\s*\*\s*@inline\s*$/m.test(commentNode.value)
  ));
}

function hasConstantBindings(scope: Scope) {
  return Object.keys(scope.bindings).every(name => scope.bindings[name].constant);
}

export function areParametersInlineable(params: Array<LVal>) {
  return params.every(param => isIdentifier(param) || (
    // The argument of a rest parameter is legally allowed to be a pattern
    isRestElement(param) && isIdentifier(param.argument)
  ));
}

export const markInlineFunctionsVisitor: Visitor<PluginState> = {
  FunctionDeclaration(path) {
    if (path.node.id && hasInlineAnnotation(path.node.leadingComments)) {
      if (path.node.async) {
        log.info(`Cannot inline function ${path.node.id.name} because it is asynchronous`);
        return;
      }

      if (!hasConstantBindings(path.scope)) {
        log.info(`Cannot inline function ${path.node.id.name} because it mutates its arguments`);
        return;
      }

      if (!areParametersInlineable(path.node.params)) {
        log.info(`Cannot inline function ${path.node.id.name} because it has complex arguments`);
        return;
      }

      // Create a function expression and flag the function name to be inlined
      const functionExpression = arrowFunctionExpression(path.node.params, path.node.body);
      this.inlineFunctions[path.node.id.name] = functionExpression;

      // Remove the original function declaration
      (path.get('leadingComments') as NodePath[]).forEach(commentPath => commentPath.remove());
      path.remove();
    }
  },
};
