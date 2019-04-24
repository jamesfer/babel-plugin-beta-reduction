import { NodePath, Visitor } from '@babel/traverse';
import { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression } from '@babel/types';
import { removeDeclarator } from './ast-utils/remove-declarator';
import { canInlineIdentifier, inlineBindingVisitor } from './inline-binding-visitor';

const inlineVariableDeclaratorVisitor: Visitor = {
  VariableDeclarator(path) {
    // TODO support destructuring declarations
    const id = path.get('id');
    if (id.isIdentifier()) {
      const init = path.node.init;
      const binding = path.scope.getBinding(id.node.name);
      if (
        binding
          && binding.constant
          && binding.references === 1
          && binding.referencePaths.every(referencePath => (
            referencePath.isIdentifier() && canInlineIdentifier(referencePath)
          ))
          && (!init || path.scope.isPure(init))
      ) {
        path.scope.path.traverse(inlineBindingVisitor, {
          value: init || path.scope.buildUndefinedNode(),
          identifier: id.node,
        });
        removeDeclarator(path);
      }
    }
  },
};

function inlineSingleUseBindingVisitorFunction(
  path: NodePath<ArrowFunctionExpression | FunctionExpression | FunctionDeclaration>,
): void {
  const body = path.get('body');
  if (body.isBlockStatement()) {
    body.traverse(inlineVariableDeclaratorVisitor);
  }
}

export const inlineSingleUseBindingsVisitor: Visitor = {
  ArrowFunctionExpression: { exit: inlineSingleUseBindingVisitorFunction },
  FunctionDeclaration: { exit: inlineSingleUseBindingVisitorFunction },
  FunctionExpression: { exit: inlineSingleUseBindingVisitorFunction },
};
