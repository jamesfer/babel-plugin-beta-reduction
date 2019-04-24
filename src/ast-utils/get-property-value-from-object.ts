import { Node, NodePath } from '@babel/traverse';
import { ObjectExpression, ObjectMethod, ObjectProperty, SpreadElement } from '@babel/types';
import { getPropertyName } from './get-property-name';

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

export function getPropertyValueFromObject(
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