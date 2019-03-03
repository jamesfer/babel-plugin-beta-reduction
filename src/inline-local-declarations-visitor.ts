import { Visitor } from '@babel/traverse';
import { isIdentifier } from '@babel/types';
import { inlineBindingVisitor } from './inline-binding-visitor';

/**
 * Inlines all constant bindings inside a function.
 */
export const inlineLocalDeclarationsVisitor: Visitor = {
  VariableDeclaration(path) {
    if (path.node.declarations.some(declaration => !isIdentifier(declaration.id))) {
      // Cannot inline declarations that contain some declarations that are not identifiers
      return;
    }

    // Inline each of the bindings in this declaration
    path.node.declarations.forEach((declaration) => {
      if (isIdentifier(declaration.id)) {
        path.parentPath.traverse(inlineBindingVisitor, {
          identifier: declaration.id,
          value: declaration.init,
        });
      }
    });

    // Remove declaration
    path.remove();
  }
};
