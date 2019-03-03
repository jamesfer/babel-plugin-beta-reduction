import { Node } from '@babel/traverse';

export function printNode(node: Node) {
  let additional = '';
  switch (node.type) {
    case 'Identifier':
      additional = node.name;
      break;
    case 'CallExpression':
      additional = `${printNode(node.callee)} (${node.arguments.map(printNode).join(', ')})`;
      break;
    case 'NumericLiteral':
      additional = '' + node.value;
      break;
    case 'BinaryExpression':
      additional = `${printNode(node.left)} ${node.operator} ${printNode(node.right)}`;
      break;
  }
  return `${node.type}<${additional}>`;
}
