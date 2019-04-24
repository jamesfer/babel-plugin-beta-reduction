import { NodePath, Visitor } from '@babel/traverse';
import { ArrowFunctionExpression, FunctionDeclaration, FunctionExpression } from '@babel/types';
import { removeDeclarator } from './ast-utils/remove-declarator';
import { canInlineIdentifier, inlineBindingVisitor } from './inline-binding-visitor';

const inlineVariableDeclaratorVisitor: Visitor = {
  VariableDeclarator(path) {
    // TODO support destructuring declarations
    const id = path.get('id');
    if (id.isIdentifier()) {
      const init = path.get('init');
      if (init.isIdentifier()) {
        path.scope.path.traverse(inlineBindingVisitor, {
          identifier: id.node,
          value: init.node,
        });
        removeDeclarator(path);
      }
    }
  },
};

function inlinePointlessBindingVisitorFunction(
  path: NodePath<ArrowFunctionExpression | FunctionExpression | FunctionDeclaration>,
): void {
  const body = path.get('body');
  if (body.isBlockStatement()) {
    body.traverse(inlineVariableDeclaratorVisitor);
  }
}

export const inlinePointlessBindingsVisitor: Visitor = {
  ArrowFunctionExpression: { exit: inlinePointlessBindingVisitorFunction },
  FunctionDeclaration: { exit: inlinePointlessBindingVisitorFunction },
  FunctionExpression: { exit: inlinePointlessBindingVisitorFunction },
};
