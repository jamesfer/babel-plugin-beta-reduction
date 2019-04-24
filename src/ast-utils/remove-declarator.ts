import { NodePath } from '@babel/traverse';
import { VariableDeclarator } from '@babel/types';

/**
 * Safely removes a variable declarator and it's parent declaration if it is there are no other
 * declarators. The given path should not be relied upon after this function as it may be put into
 * an invalid state.
 */
export function removeDeclarator(path: NodePath<VariableDeclarator>): void {
  if (path.parentPath.isVariableDeclaration() && path.parentPath.node.declarations.length === 1) {
    path.parentPath.remove();
  } else {
    path.remove();
  }
}