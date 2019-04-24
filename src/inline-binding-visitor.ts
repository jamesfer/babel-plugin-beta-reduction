import {
  Identifier,
  isAssignmentPattern,
  isLabeledStatement,
  isVariableDeclarator,
  isRestElement,
  isFunctionDeclaration,
  isIdentifier,
  isMemberExpression,
  isClassMethod,
  isClassProperty,
  isBreakStatement,
  isCatchClause,
  identifier,
  isObjectProperty,
  isObjectMethod,
} from '@babel/types';
import { Node, NodePath, Visitor } from '@babel/traverse';

export interface InlineBindingVisitorState {
  value: Node | null | undefined;
  visitedNodes?: Node[];
  identifier?: Identifier;
  name?: string;
}

function matchesIdentifier(lVal: Node | null, identifier: Identifier): boolean {
  return !!lVal && isIdentifier(lVal) && lVal.name === identifier.name;
}

/**
 * Returns true if this path can be inlined.
 */
export function canInlineIdentifier(path: NodePath<Identifier>): boolean {
  const parentNode = path.parentPath.node;
  return !(
    isLabeledStatement(parentNode) && matchesIdentifier(parentNode.label, path.node)
      || isVariableDeclarator(parentNode) && matchesIdentifier(parentNode.id, path.node)
      || isFunctionDeclaration(parentNode) && (
        matchesIdentifier(parentNode.id, path.node)
          || (path.inList && path.parentKey === 'params' && matchesIdentifier(
            parentNode.params[path.listKey as unknown as number],
            path.node,
          ))
      )
      || isAssignmentPattern(parentNode) && matchesIdentifier(parentNode.left, path.node)
      || isRestElement(parentNode) && matchesIdentifier(parentNode.argument, path.node)
      || (
        isMemberExpression(parentNode)
          && !parentNode.computed
          && matchesIdentifier(parentNode.property, path.node)
      )
      || isClassMethod(parentNode) && matchesIdentifier(parentNode.key, path.node)
      || isClassProperty(parentNode) && matchesIdentifier(parentNode.key, path.node)
      || isBreakStatement(parentNode) && matchesIdentifier(parentNode.label, path.node)
      || isCatchClause(parentNode) && matchesIdentifier(parentNode.param,  path.node)
      || (
        (isObjectProperty(parentNode) || isObjectMethod(parentNode))
          && path.key === 'key'
          && matchesIdentifier(parentNode.key, path.node)
      )
  );
  // TODO maybe turn this into a whitelist
}

/**
 * Inlines usages of an identifier with a value.
 */
export const inlineBindingVisitor: Visitor<InlineBindingVisitorState> = {
  Identifier(path) {
    const name = this.identifier ? this.identifier.name : this.name;
    if (!name) {
      throw new Error('Cannot determine name of identifier to replace');
    }

    const identifierNode = this.identifier || identifier(name);
    if (name && path.node.name === name && canInlineIdentifier(path)) {
      const replacementNode = this.value == null ? path.scope.buildUndefinedNode() : this.value;
      if (
        path.parentPath.isObjectProperty()
          && matchesIdentifier(path.parentPath.node.key, identifierNode)
      ) {
        path.parentPath.set('value', replacementNode);
      } else {
        path.replaceWith(replacementNode);
      }
    }
  },
};
