import { Node } from '@babel/core';
import { NodePath, Scope, Visitor } from '@babel/traverse';
import {
  BlockStatement,
  blockStatement,
  CallExpression,
  Expression,
  Identifier,
  isArrowFunctionExpression,
  isBinaryExpression,
  isBlockStatement,
  isConditionalExpression,
  isIdentifier,
  isIfStatement,
  isLiteral,
  isLogicalExpression,
  isProgram,
  isTemplateLiteral,
  returnStatement,
  variableDeclaration, VariableDeclarator,
  variableDeclarator,
} from '@babel/types';

export function findHoistedVariableInsertionPoint(path: NodePath): NodePath | undefined {
  const parent = path.parent;

  if (
    isBlockStatement(parent)
    || isProgram(parent)
    || isIfStatement(parent)
    || isArrowFunctionExpression(parent)
  ) {
    return path;
  }

  // These statements provide short circuit evaluation and therefore we cannot add variables to them
  // as it would cause more work to be done by the program.
  if (
    isConditionalExpression(parent)
      || isLogicalExpression(parent)
  ) {
    return undefined;
  }

  return findHoistedVariableInsertionPoint(path.parentPath);
}

export function prepareHoistedVariableInsertionPoint(insertionPoint: NodePath): NodePath {
  const parent = insertionPoint.parent;

  if (isIfStatement(parent)) {
    // When the parent is an if statement, we need to ensure that it's body is a block statement
    if (insertionPoint.node === parent.consequent) {
      insertionPoint.replaceWith(blockStatement([parent.consequent]));
      return (insertionPoint as NodePath<BlockStatement>).get('body')[0];
    }

    if (insertionPoint.node === parent.alternate) {
      insertionPoint.replaceWith(blockStatement([parent.alternate]));
      return (insertionPoint as NodePath<BlockStatement>).get('body')[0];
    }
  } else if (isArrowFunctionExpression(parent)) {
    // When the parent is an arrow function expression, we need to ensure that is has a block
    // statement for a body
    if (insertionPoint.node === parent.body && !isBlockStatement(parent.body)) {
      insertionPoint.replaceWith(blockStatement([returnStatement(parent.body)]));
      return (insertionPoint as NodePath<BlockStatement>).get('body')[0];
      // This is going to cause a problem because the parent of child nodes is now out of sync
      // insertionPoint.parentPath.set('body', blockStatement([returnStatement(parent.body)]));
    }
  }

  return insertionPoint;
}

/**
 * Returns true if the expression is could be reduced to a constant value. These expressions are
 * suitable for inlining multiple occurences of as the minifier will reduce them to a single value.
 * It still may increase the bundle size as the literal value might be quite long, possibly all
 * values should just be hoisted as variables.
 * @param init
 */
function isConstantExpression(init: Node): boolean {
  if (isLiteral(init) && !isTemplateLiteral(init)) {
    return true;
  }

  if (isTemplateLiteral(init)) {
    return init.expressions.every(isConstantExpression);
  }

  if (isBinaryExpression(init)) {
    return isConstantExpression(init.left) && isConstantExpression(init.right);
  }

  return false;
}

export function hoistDeclaration(
  identifier: Identifier,
  value: Expression | null,
  scope: Scope,
  variableInsertionPoint: NodePath,
  declarationKind: 'var' | 'let' | 'const' = 'const',
) {
  // if (!value || currentScopePath.scope.isStatic(value)) {
  //   // If the declaration is static, we can inline it everywhere
  //   currentScopePath.parentPath.traverse(inlineBindingVisitor, { identifier, value });
  //   return;
  // }

  // Check if the variable can be moved
  // TODO check if the declaration uses any variables it shouldn't (this, arguments etc)
  // if (!currentScopePath.scope.isPure(value)) {
  //   return;
  // }

  // Rename the variable
  const newId = scope.generateUidIdentifier(identifier.name);
  scope.rename(identifier.name, newId.name);

  // Insert it into the parent scope
  variableInsertionPoint.insertBefore(variableDeclaration(declarationKind, [
    variableDeclarator(newId, value),
  ]));
}



export interface HoistLocalDeclarationsVisitorState {
  callPath: NodePath<CallExpression>;
  variableInsertionPoint: NodePath;
}

/**
 * Inlines all constant bindings inside a function.
 */
export const hoistLocalDeclarationsVisitor: Visitor<HoistLocalDeclarationsVisitorState> = {
  // TODO don't inline variables that are declared inside a nested scope
  VariableDeclaration(path) {
    const variableInsertionPoint = this.variableInsertionPoint;

    path.node.declarations.forEach(({ id, init }) => {
      if (!isIdentifier(id)) {
        // Cannot inline declarations that are not identifiers, yet
        return;
      }

      const outerScope = path.scope.getBlockParent().path.scope;
      hoistDeclaration(id, init, outerScope, variableInsertionPoint, path.node.kind);
    });

    // Remove declaration
    path.remove();
    // TODO handle the case where some variable declarators couldn't be inlined
  },
};
