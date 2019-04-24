import { NodePath, VisitNodeFunction, Visitor, Node } from '@babel/traverse';
import { compact, groupBy, mapValues, toPairs } from 'lodash';
import { flatMap } from 'tslint/lib/utils';

function callEvery<S>(functions: VisitNodeFunction<S, Node>[]): Function | null {
  if (functions.length === 0) {
    return null;
  }

  if (functions.length === 1) {
    return functions[0];
  }

  return function (this: any, path: NodePath, state: S) {
    functions.forEach((func) => {
      if (path.node) {
        func.call(this, path, state);
      }
    });
  };
}

function makeCombinedVisitorFunction<S>(
  visitors: VisitNodeFunction<S, Node>[],
  kind: 'enter' | 'exit',
): Function | null {
  return callEvery(compact(visitors.map(func => (
    typeof func === 'function' ? kind === 'enter' ? func : null : func[kind]
  ))));
}

export function combineVisitors<S>(...visitors: Visitor<S>[]): Visitor<S> {
  const keyVisitorPairs = flatMap(visitors, toPairs);
  const visitorFunctions = mapValues(
    groupBy(keyVisitorPairs, ([key]) => key),
    values => values.map(([_, visitor]) => visitor),
  );
  return mapValues(visitorFunctions, (visitors) => {
    const enter = makeCombinedVisitorFunction(visitors, 'enter');
    const exit = makeCombinedVisitorFunction(visitors, 'exit');
    return {
      ...enter ? { enter } : {},
      ...exit ? { exit } : {},
    };
  });
}
