import { Visitor } from '@babel/traverse';
import {
  isIdentifier,
  isObjectExpression,
  isObjectProperty,
  ObjectProperty,
} from '@babel/types';

export const inlineObjectLiteralReferenceVisitor: Visitor = {
  MemberExpression: {
    exit(path) {
      if (isObjectExpression(path.node.object) && isIdentifier(path.node.property)) {
        const propertyNode = path.node.object.properties.find(
          (property): property is ObjectProperty => (
            isObjectProperty(property)
            && isIdentifier(property.key)
            && property.key.name === path.node.property.name
          ),
        );

        if (propertyNode) {
          path.replaceWith(propertyNode.value);
        }
      }
    },
  },
};
