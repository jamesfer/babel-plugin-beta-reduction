import { NodePath, Visitor } from '@babel/traverse';
import { getPropertyName } from './ast-utils/get-property-name';
import { getPropertyValueFromObject } from './ast-utils/get-property-value-from-object';

export const inlineObjectLiteralReferenceVisitor: Visitor = {
  MemberExpression: {
    exit(path) {
      const object = path.get('object') as NodePath;
      if (object.isObjectExpression()) {
        const propertyName = getPropertyName(path.get('property') as NodePath);
        if (propertyName !== null) {
          const propertyNode = getPropertyValueFromObject(propertyName, object);
          if (propertyNode) {
            path.replaceWith(propertyNode);
          }
        }
      }
    },
  },
};
