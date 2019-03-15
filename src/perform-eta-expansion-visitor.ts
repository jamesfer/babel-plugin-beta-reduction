import { Node, NodePath, Visitor } from '@babel/traverse';
import {
  arrayExpression,
  ArrowFunctionExpression,
  CallExpression,
  cloneDeep,
  FunctionExpression,
  isArrowFunctionExpression,
  isFunctionExpression,
  isIdentifier, isRestElement, Expression, SpreadElement, Identifier,
} from '@babel/types';
import { InlineFunctionsMap, PluginState } from './index';
import { inlineBindingVisitor } from './inline-binding-visitor';
import { inlineLocalDeclarationsVisitor } from './inline-local-declarations-visitor';
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

function inlineSingleParameter(
  path: NodePath,
  param: Identifier,
  value: Node | string | null | undefined,
) {
  const uid = path.scope.generateUid(param.name);
  path.scope.rename(param.name, uid);
  path.parentPath.traverse(inlineBindingVisitor, { value, name: uid });
}

function performParameterInlining(
  callee: NodePath<FunctionExpression | ArrowFunctionExpression>,
  parameters: Node[],
) {
  callee.node.params.forEach((param, index) => {
    // Need to cast to NodePath because path.get sometimes returns an array
    const body = callee.get('body') as NodePath;

    if (isIdentifier(param)) {
      inlineSingleParameter(body, param, parameters[index]);
    } else if (isRestElement(param) && isIdentifier(param.argument)) {
      // Need an explicit cast here because arguments could also contain some JSX expression
      const restValues = parameters.slice(index) as (Expression | SpreadElement)[];
      inlineSingleParameter(body, param.argument, arrayExpression(restValues));
    }
  });
}

function performEtaExpansion(
  path: NodePath<CallExpression>,
) {
  const callee = path.get('callee');
  if (!isEtaExpandable(callee)) {
    return false;
  }

  // Inline each of the arguments in the callee's body
  performParameterInlining(callee, path.node.arguments);

  // Inline local bindings
  path.traverse(inlineLocalDeclarationsVisitor);

  // Replace the current call with just the return statement
  const returnExpression = getFunctionBodyExpression(callee.node);
  if (!returnExpression) {
    throw new Error(
      'Attempted to inline a function that contained statements that could\'t be inlined.',
    );
  }
  path.replaceWith(returnExpression);

  return true;
}

export const performEtaExpansionVisitor: Visitor<PluginState> = {
  CallExpression(path) {
    const inlineFunctions = this.inlineFunctions;
    const inlined = performFunctionInlining(path, inlineFunctions);
    const expanded = performEtaExpansion(path);

    // These variables should not be inlined because we do not want to shortcut the functions
    if (inlined || expanded) {
      // (path.scope as any).crawl();
      path.traverse(performEtaExpansionVisitor, { inlineFunctions });
    }
  },
};
