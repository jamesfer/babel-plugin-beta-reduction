import { NodePath } from '@babel/traverse';

export function getPropertyName(property: NodePath): null | string {
  // If the property is an identifier, return its name
  if (!(property.parent as any).computed && property.isIdentifier()) {
    return property.node.name;
  }

  // Attempt to evaluate the property to a constant value
  const { confident, value } = property.evaluate();
  if (confident) {
    if (typeof value === 'string' || typeof value === 'number') {
      return `${value}`;
    }
    if (value === null) {
      return 'null';
    }
    if (value === undefined) {
      return 'undefined';
    }
  }

  return null;
}
