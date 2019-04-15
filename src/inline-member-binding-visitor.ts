import { Node, NodePath, Visitor } from '@babel/traverse';
import { getPropertyName } from './ast-utils/get-property-name';

export type InlineMemberBindingVisitorState = {
  object: string,
  property: string,
  value: Node,
}[];

// TODO add a check to see if this overrides child scopes
// TODO add a test for non-identifier property values
export const inlineMemberBindingVisitor: Visitor<InlineMemberBindingVisitorState> = {
  MemberExpression(path) {
    const object = path.get('object') as NodePath;
    const property = path.get('property') as NodePath;
    if (object.isIdentifier()) {
      const propertyName = getPropertyName(property);
      const replacement = this.find(substitution => (
        object.node.name === substitution.object
          && propertyName === substitution.property
      ));
      if (replacement) {
        path.replaceWith(replacement.value);
      }
    }
  },
};
