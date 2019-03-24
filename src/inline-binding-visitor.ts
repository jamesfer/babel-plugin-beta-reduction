import {
  Identifier,
  isAssignmentPattern,
  isLabeledStatement,
  isVariableDeclarator,
  LabeledStatement,
  VariableDeclarator,
  isRestElement,
  isFunctionDeclaration,
  LVal,
  isIdentifier,
  isMemberExpression,
  isClassMethod,
  isClassProperty, isBreakStatement, isCatchClause,
} from '@babel/types';
import { Node, NodePath, Visitor } from '@babel/traverse';

export interface InlineBindingVisitorState {
  value: Node | string | null | undefined;
  visitedNodes?: Node[];
  identifier?: Identifier;
  name?: string;
}

function matchesIdentifier(lVal: Node | null, identifier: Identifier) {
  return lVal && isIdentifier(lVal) && lVal.name === identifier.name;
}

/**
 * Returns true if this path can be inlined.
 */
export function canInlineIdentifier(path: NodePath<Identifier>) {
  const parentNode = path.parentPath.node;
  return !(isLabeledStatement(parentNode) && matchesIdentifier(parentNode.label, path.node))
    && !(isVariableDeclarator(parentNode) && matchesIdentifier(parentNode.id, path.node))
    && !(isFunctionDeclaration(parentNode) && matchesIdentifier(parentNode.id, path.node))
    && !(isAssignmentPattern(parentNode) && matchesIdentifier(parentNode.left, path.node))
    && !(isRestElement(parentNode) && matchesIdentifier(parentNode.argument, path.node))
    && !(isMemberExpression(parentNode) && matchesIdentifier(parentNode.property, path.node))
    && !(isClassMethod(parentNode) && matchesIdentifier(parentNode.key, path.node))
    && !(isClassProperty(parentNode) && matchesIdentifier(parentNode.key, path.node))
    && !(isBreakStatement(parentNode) && matchesIdentifier(parentNode.label, path.node))
    && !(isCatchClause(parentNode) && matchesIdentifier(parentNode.param,  path.node));
  // TODO maybe turn this into a whitelist
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
