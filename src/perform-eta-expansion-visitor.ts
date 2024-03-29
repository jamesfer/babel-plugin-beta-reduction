import { Binding, Node, NodePath, Scope, Visitor } from '@babel/traverse';
import {
  arrayExpression,
  ArrowFunctionExpression,
  blockStatement,
  BlockStatement,
  CallExpression,
  cloneDeep,
  Expression,
  expressionStatement,
  FunctionExpression,
  getBindingIdentifiers,
  Identifier,
  isArrowFunctionExpression,
  isBlockStatement,
  isConditionalExpression,
  isExpression,
  isFunctionExpression,
  isIdentifier,
  isIfStatement,
  isJSXNamespacedName,
  isLogicalExpression,
  isProgram,
  isRestElement,
  isStatement,
  JSXNamespacedName,
  LVal,
  ReturnStatement,
  returnStatement,
  SpreadElement,
  Statement,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
  VariableDeclarator,
} from '@babel/types';
import { getAllBindingPaths } from './get-all-binding-paths';
import { InlineFunctionsMap, PluginState } from './index';
import { canInlineIdentifier, inlineBindingVisitor } from './inline-binding-visitor';
import { areParametersInlineable } from './mark-inline-function-visitor';

function getReturnExpression(node: Node): Node | null {
  if (node.type === 'BlockStatement' && node.body.length === 1) {
    return getReturnExpression(node.body[0]);
  }

  if (node.type === 'ReturnStatement') {
    return node.argument;
  }

  return null;
}

function getFunctionBodyExpression(
  callee: ArrowFunctionExpression | FunctionExpression,
): Node | null {
  return callee.type === 'ArrowFunctionExpression'
  && callee.body.type !== 'BlockStatement'
    ? callee.body : getReturnExpression(callee.body);
}

function isEtaExpandableFunctionBody(block: Node): boolean {
  if (block.type !== 'BlockStatement') {
    return true;
  }

  if (block.body.length === 1 && block.body[0].type === 'ReturnStatement') {
    return true;
  }

  return block.body.every(statement => (
    statement.type === 'ReturnStatement' || (
      statement.type === 'VariableDeclaration' && statement.kind === 'const'
    )
  ));
}

function isEtaExpandable(
  callee: NodePath,
): callee is NodePath<FunctionExpression | ArrowFunctionExpression> {
  return (isFunctionExpression(callee.node) || isArrowFunctionExpression(callee.node))
    && areParametersInlineable(callee.node.params)
    && isEtaExpandableFunctionBody(callee.node.body);
}

export function findHoistedVariableInsertionPoint(path: NodePath): NodePath | undefined {
  const parent = path.parent;

  if (
    isBlockStatement(parent)
    || isProgram(parent)
    || isIfStatement(parent)
    || isArrowFunctionExpression(parent)
  ) {
    return path;
  }

  // These statements provide short circuit evaluation and therefore we cannot add variables to them
  // as it would cause more work to be done by the program.
  // TODO check what part of the conditional expression the node is used in. If it is the first
  //      condition then it can still be safely hoisted.
  if (
    isConditionalExpression(parent)
      || isLogicalExpression(parent)
  ) {
    return undefined;
  }

  return findHoistedVariableInsertionPoint(path.parentPath);
}

function performFunctionInlining(
  path: NodePath<CallExpression>,
  inlineFunctions: InlineFunctionsMap,
): boolean {
  if (isIdentifier(path.node.callee)) {
    const functionExpression = inlineFunctions[path.node.callee.name];
    if (functionExpression) {
      // Replace the current call with the actual function body
      path.get('callee').replaceWith(cloneDeep(functionExpression));
      return true;
    }
  }
  return false;
}

function performFunctionInliningOnIdentifier(
  path: NodePath<Identifier>,
  inlineFunctions: InlineFunctionsMap,
): void {
  const functionExpression = inlineFunctions[path.node.name];
  if (functionExpression) {
    // Replace the current call with the actual function body
    path.replaceWith(cloneDeep(functionExpression));
  }
}

export function createDeclarator(
  identifier: Identifier,
  value: Expression | null,
  calleeScope: Scope,
  destinationScope: Scope,
): VariableDeclarator {
  // Rename the variable
  const newId = destinationScope.generateUidIdentifier(identifier.name);
  calleeScope.rename(identifier.name, newId.name);

  return variableDeclarator(newId, value);
}

/**
 * Checks if the binding is only referenced once and none of the referenced paths shadow an
 * identifier that is referenced in the value of the binding.
 */
// function canInlineBinding(binding: Binding, value: Node): boolean {
//   // TODO this could be improved by allowing the variable to be inlined to any scope
//   //      as long as any overlapping bindings are renamed to prevent bugs
//   console.log(getBindingIdentifiers, getBindingIdentifiers(value));
//   return binding.references === 1
//     && binding.referencePaths.every(path => (
//       path.scope === binding.scope
//         // || Object.values(binding.path.getBindingIdentifierPaths()).every(identifier => (
//         || Object.values(getBindingIdentifiers(value)).every(identifier => (
//           binding.scope.getBindingIdentifier(identifier.name)
//             === path.scope.getBindingIdentifier(identifier.name)
//         ))
//     ));
// }

interface HoistInlineResult {
  hoist: VariableDeclarator[];
  inline: { identifier: Identifier, value: Node | null | undefined }[];
}

function createVariableDeclaratorsFromParameters(
  calleeParameters: LVal[],
  parameters: (Expression | SpreadElement | JSXNamespacedName)[],
  calleeScope: Scope,
  destinationScope: Scope,
): HoistInlineResult {
  if (parameters.some(parameter => isJSXNamespacedName(parameter))) {
    throw new Error('Cannot hoist a JSXNamespaced name');
  }

  // TODO handle spread elements in parameters
  return calleeParameters.reduce(
    (result, param, index) => {
      if (isIdentifier(param)) {
        const parameter = parameters[index];
        if (isExpression(parameter)) {
          const binding = calleeScope.getBinding(param.name);
          if (binding) {
            if (binding.references === 0) {
              // This binding is not referenced, just ignore it
              // TODO there could be side effects here that are being removed.
              return result;
            }
            if (binding && binding.references === 1) {
              // This binding only has one usage, we can just inline it
              return {
                hoist: result.hoist,
                inline: [
                  ...result.inline,
                  { identifier: param, value: parameter },
                ],
              };
            }
          }

          // This variable has to be hoisted
          return {
            inline: result.inline,
            hoist: [
              ...result.hoist,
              createDeclarator(param, parameter, calleeScope, destinationScope),
            ],
          };
        }
      } else if (isRestElement(param) && isIdentifier(param.argument)) {
        // TODO inline rest elements if they are only used once
        // Need an explicit cast here because arguments could also contain some JSX expression
        const restValues = parameters.slice(index) as (Expression | SpreadElement)[];
        const value = arrayExpression(restValues);
        return {
          inline: result.inline,
          hoist: [
            ...result.hoist,
            createDeclarator(param.argument, value, calleeScope, destinationScope),
          ],
        };
      }
      throw new Error('Could not work out how to hoist parameter');
    },
    { hoist: [], inline: [] } as HoistInlineResult,
  );
}

export interface CreateVariableDeclaratorsVisitorState {
  functionScope: Scope;
  destinationScope: Scope;
  declarators: VariableDeclarator[];
  inlines: { identifier: Identifier, value: Node | null | undefined }[];
}

/**
 * Inlines all constant bindings inside a function.
 */
export const createVariableDeclaratorsVisitor: Visitor<CreateVariableDeclaratorsVisitorState> = {
  // TODO don't inline variables that are declared inside a nested scope
  VariableDeclaration(path) {
    const functionScope = this.functionScope;
    const destinationScope = this.destinationScope;
    // This is used to output the this of generated declarators
    const declarators = this.declarators;
    const inlines = this.inlines;

    path.node.declarations.forEach(({ id, init }) => {
      if (!isIdentifier(id)) {
        // Cannot inline declarations that are not identifiers, yet
        throw new Error('Could not inline variable declarator because it is not an identifier');
      }

      const binding = functionScope.getBinding(id.name);
      if (binding) {
        if (binding.references === 0) {
          // This binding is not referenced, we can just ignore it
          // TODO doing this could remove required side-effects
          return;
        }

        if (binding.references === 1) {
          // This binding was only referenced once, we can inline it
          inlines.push({ identifier: id, value: init });
          return;
        }
      }

      declarators.push(createDeclarator(id, init, functionScope, destinationScope));
    });

    // Remove declaration
    path.remove();
    // TODO handle the case where some variable declarators couldn't be inlined
  },
};

function convertToStatement(node: Node): Statement {
  if (isExpression(node)) {
    return expressionStatement(node);
  }

  if (isStatement(node)) {
    return node;
  }

  throw new Error(`Couldn't convert ${node.type} node to statement`);
}

function insertStatementsBeforeExpression(
  insertionPoint: NodePath,
  statements: Statement[],
): [NodePath] | null {
  const parentPath = insertionPoint.parentPath;
  if (parentPath.isIfStatement()) {
    const key = insertionPoint.parentKey
      + (insertionPoint.inList ? `.${insertionPoint.listKey}` : '');
    insertionPoint.parentPath.set(key, cloneDeep(blockStatement([
      ...statements,
      convertToStatement(insertionPoint.node),
    ])));
    return [insertionPoint.parentPath.get(key) as NodePath];
  }

  if (parentPath.isArrowFunctionExpression()) {
    const key = insertionPoint.parentKey
      + (insertionPoint.inList ? `.${insertionPoint.listKey}` : '');
    insertionPoint.parentPath.set(key, cloneDeep(blockStatement([
      ...statements,
      returnStatement(insertionPoint.node as Expression),
    ])));
    return [insertionPoint.parentPath.get(key) as NodePath];
  }

  if (parentPath.isBlock() || parentPath.isProgram()) {
    return insertionPoint.insertBefore(statements);
  }

  return null;
}

function liftVariableDeclarations(
  previousScope: Scope,
  insertionPoint: NodePath,
  declarations: VariableDeclaration[],
): [NodePath] | null {
  const newPaths = insertStatementsBeforeExpression(insertionPoint, declarations);
  if (newPaths && previousScope !== insertionPoint.scope) {
    declarations.forEach((declaration) => {
      declaration.declarations.forEach((declarator) => {
        if (isIdentifier(declarator.id)) {
          previousScope.moveBindingTo(declarator.id.name, insertionPoint.scope);
        }
      });
    });
  }
  return newPaths;
}

function inlineIdentifier(
  path: NodePath,
  identifier: Identifier,
  value: Node | null | undefined,
): void {
  path.scope.rename(identifier.name);
  path.traverse(inlineBindingVisitor, { value, identifier });
}

function performEtaExpansion(path: NodePath<CallExpression>): boolean {
  const callee = path.get('callee');
  if (!isEtaExpandable(callee)) {
    return false;
  }

  // Find a point to hoist variables to
  const variableInsertionPoint = findHoistedVariableInsertionPoint(callee);
  if (!variableInsertionPoint) {
    return false;
  }

  // Rename all of the bound identifiers in the callee if they shadow a declaration in the
  // destination scope
  Object.values(getAllBindingPaths(callee)).forEach((identifierPath) => {
    if (variableInsertionPoint.scope.hasBinding(identifierPath.node.name)) {
      identifierPath.scope.rename(identifierPath.node.name);
    }
  });

  // Inline each of the arguments in the callee's body
  const {
    hoist: parameterDeclarators,
    inline: parameterInlines,
  } = createVariableDeclaratorsFromParameters(
    callee.node.params,
    path.node.arguments,
    callee.scope,
    variableInsertionPoint.scope,
  );

  // Hoist local bindings
  // TODO extract into a function that returns the declarators and inlines
  const state = {
    functionScope: callee.scope,
    destinationScope: variableInsertionPoint.scope,
    // Out parameters
    declarators: [],
    inlines: [],
  };
  callee.traverse(createVariableDeclaratorsVisitor, state);
  const variableDeclarators = state.declarators;
  const variableInlines = state.inlines;

  // Inline all of the required variables
  // TODO maybe don't traverse the entire callee, just the body
  // TODO perform all inlines in one traversal step
  [...parameterInlines, ...variableInlines].forEach(inline => (
    inlineIdentifier(callee, inline.identifier, inline.value)
  ));

  // Replace the current call with just the return statement
  const returnExpression = getFunctionBodyExpression(callee.node);
  if (!returnExpression) {
    throw new Error(
      'Attempted to inline a function that contained statements that could\'t be inlined.',
    );
  }

  // This is a problem. This could cause the variable insertion point to change into a block.
  path.replaceWith(returnExpression);

  // Insert all hoisted variables into the insertion point
  const declarators = [
    ...parameterDeclarators,
    ...variableDeclarators,
  ];
  const insertionParent = variableInsertionPoint.parentPath;

  // TODO if there are no statements to hoist, we don't actually need to be able to find a variable
  //      insertion point, yet if one is not located the function exits early.
  if (declarators.length > 0) {
    liftVariableDeclarations(
      callee.scope,
      variableInsertionPoint,
      [variableDeclaration('const', declarators)],
    );
  }

  // Stop iterating this path and requeue the insertionParent which has the correct parent-child
  // relationship set
  path.stop();
  (insertionParent as any).requeue();

  return true;
}

export const performEtaExpansionVisitor: Visitor<PluginState> = {
  Identifier(path) {
    if (canInlineIdentifier(path)) {
      performFunctionInliningOnIdentifier(path, this.inlineFunctions);
    }
  },
  CallExpression(path) {
    performFunctionInlining(path, this.inlineFunctions);
    performEtaExpansion(path);
  },
};
