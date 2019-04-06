import { NodePath, Visitor } from '@babel/traverse';
import { getBindingIdentifiers, Identifier } from '@babel/types';
import { mapValues } from 'lodash';

interface GetAllBindingPathsVisitorState {
  bindingPaths: NodePath<Identifier>[];
}

const bindingKeys = getBindingIdentifiers.keys;

function extractBindingIdentifiers(path: NodePath): NodePath<Identifier>[] {
  return Object.values(path.getBindingIdentifierPaths());
}

function getAllBindingsVisitorFunction(this: GetAllBindingPathsVisitorState, path: NodePath): void {
  extractBindingIdentifiers(path).forEach((bindingPath) => {
    if (this.bindingPaths.indexOf(bindingPath) === -1) {
      this.bindingPaths.push(bindingPath);
    }
  });
}

const getAllBindingPathsVisitor: Visitor<GetAllBindingPathsVisitorState>
  = mapValues(bindingKeys, () => getAllBindingsVisitorFunction);

export function getAllBindingPaths(path: NodePath): NodePath<Identifier>[] {
  // We need to extract the bindings for the current path before iterating because iteration skips
  // the current path.
  const bindingPaths = extractBindingIdentifiers(path);
  path.traverse(getAllBindingPathsVisitor, { bindingPaths });
  return bindingPaths;
}
