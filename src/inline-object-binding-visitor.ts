import { Node, NodePath, Visitor } from '@babel/traverse';
import { ObjectExpression } from '@babel/types';
import { isNull } from 'lodash';
import { getPropertyName } from './ast-utils/get-property-name';
import { getPropertyValueFromObject } from './ast-utils/get-property-value-from-object';
import { inlineMemberBindingVisitor } from './inline-member-binding-visitor';

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
// TODO if a key value is not pure, it should be extracted into a variable
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
