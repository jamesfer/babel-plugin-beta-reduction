import { Identifier, LabeledStatement, VariableDeclarator } from '@babel/types';
import { Node, NodePath, Visitor } from '@babel/traverse';

export interface InlineBindingVisitorState {
  value: Node | string | null | undefined,
  visitedNodes?: Node[],
  identifier?: Identifier,
  name?: string,
}

/**
 * Returns true if this path can be inlined.
 */
function canInlineIdentifier(path: NodePath) {
  return (path.parentPath.node as LabeledStatement).label !== path.node
    && (path.parentPath.node as VariableDeclarator).id !== path.node;
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
  }
};
