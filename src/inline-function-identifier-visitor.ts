import { Visitor } from '@babel/traverse';
import { cloneDeep, isIdentifier } from '@babel/types';
import { PluginState } from './index';

export const inlineFunctionIdentifierVisitor: Visitor<PluginState> = {
  Identifier(path) {
    // TODO need to check that the scope is also the same. Currently a variable could be created
    //  with the same as an inline function and it would break
    if (isIdentifier(path.node) && !path.parentPath.isMemberExpression()) {
      const functionExpression = this.inlineFunctions[path.node.name];
      if (functionExpression) {
        console.log('YES', path.node);
        // Replace the current call with the actual function body
        path.replaceWith(cloneDeep(functionExpression));
        (path as any).resync();
      } else {
        console.log('NO ', path.node);
      }
    }
  },
};