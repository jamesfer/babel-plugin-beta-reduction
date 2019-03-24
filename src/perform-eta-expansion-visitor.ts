import generate from '@babel/generator';
import { expression } from '@babel/template';
import { Node, NodePath, Scope, Visitor } from '@babel/traverse';
import {
  arrayExpression,
  ArrowFunctionExpression, blockStatement,
  BlockStatement,
  CallExpression,
  cloneDeep,
  Expression, expressionStatement,
  FunctionExpression,
  Identifier,
  isArrowFunctionExpression,
  isBlockStatement,
  isCallExpression,
  isExpression,
  isFunctionExpression,
  isIdentifier,
  isIfStatement,
  isJSXNamespacedName,
  isRestElement,
  isReturnStatement, isStatement,
  JSXNamespacedName,
  LVal, ReturnStatement,
  returnStatement,
  SpreadElement,
  Statement,
  VariableDeclaration,
  variableDeclaration,
  variableDeclarator,
  VariableDeclarator,
} from '@babel/types';
import {
  hoistDeclaration, findHoistedVariableInsertionPoint,
  hoistLocalDeclarationsVisitor, prepareHoistedVariableInsertionPoint,
} from './hoist-local-declarations-visitor';
import { InlineFunctionsMap, PluginState } from './index';
import { canInlineIdentifier, inlineBindingVisitor } from './inline-binding-visitor';
import { inlineFunctionIdentifierVisitor } from './inline-function-identifier-visitor';
import { areParametersInlineable } from './mark-inline-function-visitor';
import generator from '@babel/generator';

function getReturnExpression(node: Node): Node | null {
  if (node.type === 'BlockStatement' && node.body.length === 1) {
    return getReturnExpression(node.body[0]);
  }

  if (node.type === 'ReturnStatement') {
    return node.argument;
  }

  return null;
}

function getFunctionBodyExpression(callee: ArrowFunctionExpression | FunctionExpression) {
  return callee.type === 'ArrowFunctionExpression'
  && callee.body.type !== 'BlockStatement'
    ? callee.body : getReturnExpression(callee.body);
}

function isEtaExpandableFunctionBody(block: Node) {
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

function performFunctionInlining(
  path: NodePath<CallExpression>,
  inlineFunctions: InlineFunctionsMap,
) {
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
) {
  const functionExpression = inlineFunctions[path.node.name];
  if (functionExpression) {
    // Replace the current call with the actual function body
    path.replaceWith(cloneDeep(functionExpression));
  }
}

function inlineSingleParameter(
  functionPath: NodePath,
  param: Identifier,
  value: Node | string | null | undefined,
) {
  // Generate unique name for the parameter
  const uid = functionPath.scope.generateUid(param.name);
  functionPath.scope.rename(param.name, uid);
  functionPath.traverse(inlineBindingVisitor, { value, name: uid });
}

function performParameterHoisting(
  // callee: NodePath<FunctionExpression | ArrowFunctionExpression>,
  calleeParameters: LVal[],
  parameters: (Expression | SpreadElement | JSXNamespacedName)[],
  calleeScope: Scope,
  variableInsertionPoint: NodePath,
) {
  if (parameters.some(parameter => isJSXNamespacedName(parameter))) {
    throw new Error('Cannot hoist a JSXNamespaced name');
  }

  // TODO handle spread elements in parameters
  calleeParameters.forEach((param, index) => {
    if (isIdentifier(param)) {
      const parameter = parameters[index];
      if (isExpression(parameter)) {
        hoistDeclaration(param, parameter, calleeScope, variableInsertionPoint);
      }
    } else if (isRestElement(param) && isIdentifier(param.argument)) {
      // Need an explicit cast here because arguments could also contain some JSX expression
      const restValues = parameters.slice(index) as (Expression | SpreadElement)[];
      const value = arrayExpression(restValues);
      hoistDeclaration(param.argument, value, calleeScope, variableInsertionPoint);
    }
  });
}

export function createDeclarator(
  identifier: Identifier,
  value: Expression | null,
  scope: Scope,
): VariableDeclarator {
  // Rename the variable
  const newId = scope.generateUidIdentifier(identifier.name);
  scope.rename(identifier.name, newId.name);

  return variableDeclarator(newId, value);
}

function createVariableDeclaratorsFromParameters(
  calleeParameters: LVal[],
  parameters: (Expression | SpreadElement | JSXNamespacedName)[],
  calleeScope: Scope,
): VariableDeclarator[] {
  if (parameters.some(parameter => isJSXNamespacedName(parameter))) {
    throw new Error('Cannot hoist a JSXNamespaced name');
  }

  // TODO handle spread elements in parameters
  return calleeParameters.map((param, index) => {
    if (isIdentifier(param)) {
      const parameter = parameters[index];
      if (isExpression(parameter)) {
        return createDeclarator(param, parameter, calleeScope);
      }
    } else if (isRestElement(param) && isIdentifier(param.argument)) {
      // Need an explicit cast here because arguments could also contain some JSX expression
      const restValues = parameters.slice(index) as (Expression | SpreadElement)[];
      const value = arrayExpression(restValues);
      return createDeclarator(param.argument, value, calleeScope);
    }
    throw new Error('Could not work out how to hoist parameter');
  });
}

export interface CreateVariableDeclaratorsVisitorState {
  functionScope: Scope;
  declarators: VariableDeclarator[];
}

/**
 * Inlines all constant bindings inside a function.
 */
export const createVariableDeclaratorsVisitor: Visitor<CreateVariableDeclaratorsVisitorState> = {
  // TODO don't inline variables that are declared inside a nested scope
  VariableDeclaration(path) {
    const functionScope = this.functionScope;
    // This is used to output the this of generated declarators
    const declarators = this.declarators;

    path.node.declarations.forEach(({ id, init }) => {
      if (!isIdentifier(id)) {
        // Cannot inline declarations that are not identifiers, yet
        throw new Error('Could not inline variable declarator because it is not an identifier');
      }

      declarators.push(createDeclarator(id, init, functionScope));
    });

    // Remove declaration
    path.remove();
    // TODO handle the case where some variable declarators couldn't be inlined
  },
};

function convertExpressionToStatementIfNeeded(expression: NodePath): Node {
  if (
    !isExpression(expression.node)
    || !isArrowFunctionExpression(expression.parent) && !isIfStatement(expression.parent)
  ) {
    return expression.node;
  }

  return returnStatement(expression.node);
}

function convertToStatement(node: Node): Statement {
  if (isExpression(node)) {
    return expressionStatement(node);
  }

  if (isStatement(node)) {
    return node;
  }

  throw new Error(`Couldn't convert ${node.type} node to statement`);
}

function convertToReturnStatement(expression: Expression): ReturnStatement {
  return returnStatement(expression);
}

function insertStatementsBeforeExpression(insertionPoint: NodePath, statements: Statement[]): void {
  const parentPath = insertionPoint.parentPath;
  if (parentPath.isIfStatement()) {
    insertionPoint.replaceWith(blockStatement([
      ...statements,
      convertToStatement(insertionPoint.node),
    ]));
  }

  if (parentPath.isArrowFunctionExpression()) {
    insertionPoint.replaceWith(blockStatement([
      ...statements,
      returnStatement(insertionPoint.node as Expression),
    ]));
  }

  if (parentPath.isBlock() || parentPath.isProgram()) {
    insertionPoint.insertBefore(statements);
  }
}

function performEtaExpansion(path: NodePath<CallExpression>) {
  const callExpressionPath = path;
  const callee = callExpressionPath.get('callee') as NodePath<FunctionExpression | ArrowFunctionExpression>;
  if (!isEtaExpandable(callee)) {
    return false;
  }

  // Find a point to hoist variables to
  const variableInsertionPoint = findHoistedVariableInsertionPoint(callee);
  if (!variableInsertionPoint) {
    return false;
  }

  // Prepare the insertion point so that it can actually accept variables
  // const preparedInsertionPoint = prepareHoistedVariableInsertionPoint(variableInsertionPoint);

  // Check if the call expression has been changed
  // The cast here is required because Typescript thinks callExpressionPath can only be a
  // callExpression, and will become a never type if this assertion is not true
  // if (!(callExpressionPath as any).isCallExpression()) {
  //   if (!callExpressionPath.isBlockStatement()) {
  //     throw new Error(
  //       'The call expression was modified into something that is not a block statement',
  //     );
  //   }
  //
  //   const callStatementIndex = callExpressionPath.node.body.findIndex(statement => (
  //     isReturnStatement(statement)
  //       && statement.argument !== null
  //       && isCallExpression(statement.argument)
  //       && statement.argument.callee === callee.node
  //   ));
  //   if (callStatementIndex === -1) {
  //     throw new Error('Cannot find original call statement in block statement');
  //   }
  //
  //   callExpressionPath = callExpressionPath.get(`body.${callStatementIndex}.argument`) as NodePath<CallExpression>;
  //   callee = callExpressionPath.get('callee') as NodePath<ArrowFunctionExpression | FunctionExpression>;
  // }

  const calleeArguments = callee.node.params;
  const nodeArguments = callExpressionPath.node.arguments;

  // Inline each of the arguments in the callee's body
  // performParameterHoisting(calleeArguments, nodeArguments, callee.scope, preparedInsertionPoint);
  const parameterDeclarators = createVariableDeclaratorsFromParameters(calleeArguments, nodeArguments, callee.scope);

  // Hoist local bindings
  const state = { functionScope: callee.scope, declarators: [] };
  callee.traverse(createVariableDeclaratorsVisitor, state);
  const variableDeclarators = state.declarators;

  // Replace the current call with just the return statement
  const returnExpression = getFunctionBodyExpression(callee.node);
  if (!returnExpression) {
    throw new Error(
      'Attempted to inline a function that contained statements that could\'t be inlined.',
    );
  }
  callExpressionPath.replaceWith(returnExpression);

  // Insert all hoisted variables into the insertion point
  const declarators = [
    ...parameterDeclarators,
    ...variableDeclarators,
  ];
  insertStatementsBeforeExpression(
    variableInsertionPoint,
    declarators.length === 0 ? [] : [variableDeclaration('const', declarators)],
  );

  return true;
}

export const performEtaExpansionVisitor: Visitor<PluginState> = {
  Identifier(path) {
    if (canInlineIdentifier(path)) {
      performFunctionInliningOnIdentifier(path, this.inlineFunctions);
    }
  },
  CallExpression(path) {
    const inlined = performFunctionInlining(path, this.inlineFunctions);
    // Attempt to inline the callee. We need to explicitly run this visitor first so that we can
    // more easily inline the call expression.
    // path.get('callee').traverse(
    //   inlineFunctionIdentifierVisitor,
    //   { inlineFunctions: this.inlineFunctions },
    // );
    // (path as any).resync();

    const expanded = performEtaExpansion(path);

    // These variables should not be inlined because we do not want to shortcut the functions
    // if (inlined || expanded) {
      // TODO edit babel type definitions
      // (path as any).requeue();
      // (path.scope as any).crawl();
      // path.traverse(performEtaExpansionVisitor, { inlineFunctions });
    // }
  },
};
