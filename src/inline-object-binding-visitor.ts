import { Node, NodePath, Visitor } from '@babel/traverse';
import {
  ObjectExpression,
  ObjectMethod,
  ObjectProperty,
  SpreadElement,
} from '@babel/types';
import { isNull } from 'lodash';
import { getPropertyName } from './ast-utils/get-property-name';
import { inlineMemberBindingVisitor } from './inline-member-binding-visitor';

function updateObjectValueForPropertyOrMethod(
  currentValue: Node | null,
  propertyName: string,
  property: NodePath<ObjectProperty | ObjectMethod>,
): Node | null {
  const currentKey = getPropertyName(property.get('key') as NodePath);
  if (currentKey === null) {
    // If the key cannot be reliably determined, then we need to reset the current value
    return null;
  }

  if (currentKey === propertyName) {
    if (property.isObjectProperty()) {
      return property.node.value;
    }

    // TODO we cannot return the function value here because we do not have a way to handle
    //      usages of 'this' inside the function body
    return null;
  }

  return currentValue;
}

function updateObjectValueForSpreadElement(
  currentValue: Node | null,
  propertyName: string,
  property: NodePath<SpreadElement>,
): Node | null {
  if (property.isSpreadElement()) {
    // If the argument of the spread is an object, we can attempt to get the property from it
    const argument = property.get('argument') as NodePath;
    if (argument.isObjectExpression()) {
      return getPropertyValueFromObject(propertyName, argument);
    }

    // Otherwise, it is probably dynamic which means we cannot determine the value of the key
    return null;
  }

  return currentValue;
}

function getPropertyValueFromObject(
  propertyName: string,
  object: NodePath<ObjectExpression>,
): Node | null {
  const properties = object.get('properties');
  return properties.reduce<Node | null>(
    (currentValue, property) => {
      if (property.isObjectProperty() || property.isObjectMethod()) {
        return updateObjectValueForPropertyOrMethod(currentValue, propertyName, property);
      }

      // The property can only be an ObjectProperty, ObjectMethod or SpreadElement, therefore we can
      // safely cast its value here
      const spreadProperty = property as NodePath<SpreadElement>;
      return updateObjectValueForSpreadElement(currentValue, propertyName, spreadProperty);
    },
    null,
  );
}

function getReplacementValue(
  object: NodePath<ObjectExpression>,
  usagePath: NodePath,
): { property: string, value: Node } | null {
  const memberExpression = usagePath.parentPath;
  if (!memberExpression.isMemberExpression()) {
    return null;
  }

  const property = getPropertyName(memberExpression.get('property') as NodePath);
  if (!property) {
    return null;
  }

  const value = getPropertyValueFromObject(property, object);
  if (!value) {
    return null;
  }

  return { value, property };
}

// TODO if a single key is used multiple times, it should be extracted into a variable
export const inlineObjectBindingVisitor: Visitor = {
  VariableDeclarator(path) {
    const id = path.get('id') as NodePath;
    const init = path.get('init') as NodePath | undefined;
    if (init && id.isIdentifier() && init.isObjectExpression()) {
      const binding = path.scope.getOwnBinding(id.node.name);
      if (binding) {
        const replacements = binding.referencePaths.map(referencePath => (
          getReplacementValue(init, referencePath)
        ));
        if (!replacements.some(isNull)) {
          const validReplacements = replacements as { property: string, value: Node }[];
          path.getFunctionParent().traverse(
            inlineMemberBindingVisitor,
            validReplacements.map(replacement => ({ ...replacement, object: id.node.name })),
          );
          path.remove();
        }
      }
    }
  },
};
