import {
  Identifier, isAssignmentPattern,
  isLabeledStatement,
  isVariableDeclarator,
  LabeledStatement,
  VariableDeclarator,
  isRestElement, isFunctionDeclaration, LVal, isIdentifier,
} from '@babel/types';
import { Node, NodePath, Visitor } from '@babel/traverse';

export interface InlineBindingVisitorState {
  value: Node | string | null | undefined;
  visitedNodes?: Node[];
  identifier?: Identifier;
  name?: string;
}

function matchesIdentifier(lVal: LVal | null, identifier: Identifier) {
  return lVal && isIdentifier(lVal) && lVal.name === identifier.name;
}

/**
 * Returns true if this path can be inlined.
 */
function canInlineIdentifier(path: NodePath<Identifier>) {
  const parentNode = path.parentPath.node;
  return !(isLabeledStatement(parentNode) && matchesIdentifier(parentNode.label, path.node))
    && !(isVariableDeclarator(parentNode) && matchesIdentifier(parentNode.id, path.node))
    && !(isFunctionDeclaration(parentNode) && matchesIdentifier(parentNode.id, path.node))
    && !(isAssignmentPattern(parentNode) && matchesIdentifier(parentNode.left, path.node))
    && !(isRestElement(parentNode) && matchesIdentifier(parentNode.argument, path.node));
}

/**
 * Inlines usages of an identifier with a value.
 */
export const inlineBindingVisitor: Visitor<InlineBindingVisitorState> = {
  Identifier(path) {
    const name = this.identifier ? this.identifier.name : this.name;
    if (name && path.node.name === name && canInlineIdentifier(path)) {
      if (typeof this.value === 'string' || this.value == null) {
        path.replaceWithSourceString(this.value || 'undefined');
      } else {
        path.replaceWith(this.value);
      }
    }
  },
};
