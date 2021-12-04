import { transformAsync, Visitor } from '@babel/core';
import { emptyStatement, stringLiteral } from '@babel/types';

async function transform(code: string, visitor: Visitor): Promise<void> {
  await transformAsync(code, {
    plugins: [{ visitor, name: 'test' }],
  });
}

describe('babel-axioms', () => {
  let i = -1;

  function fn(): jest.Mock<number> {
    return jest.fn(() => i += 1);
  }

  beforeEach(() => {
    i = -1;
  });

  it('should call entry visitors in descending order', async () => {
    const arrayExpression = fn();
    const numericLiteral = fn();
    await transform('[1]', {
      ArrayExpression() { arrayExpression(); },
      NumericLiteral() { numericLiteral(); },
    });
    expect(arrayExpression).toHaveBeenCalledTimes(1);
    expect(arrayExpression).toReturnWith(0);
    expect(numericLiteral).toHaveBeenCalledTimes(1);
    expect(numericLiteral).toReturnWith(1);
  });

  it('should call exit visitors in ascending order', async () => {
    const arrayExpression = fn();
    const numericLiteral = fn();
    await transform('[1]', {
      ArrayExpression: { exit() { arrayExpression(); } },
      NumericLiteral: { exit() { numericLiteral(); } },
    });
    expect(numericLiteral).toHaveBeenCalledTimes(1);
    expect(numericLiteral).toReturnWith(0);
    expect(arrayExpression).toHaveBeenCalledTimes(1);
    expect(arrayExpression).toReturnWith(1);
  });

  it('should call the exit visitor of a sibling before the entry visitor of the next', async () => {
    const numericLiteral = fn();
    const stringLiteral = fn();
    await transform('1, "2"', {
      NumericLiteral: { exit() { numericLiteral(); } },
      StringLiteral() { stringLiteral(); },
    });
    expect(numericLiteral).toHaveBeenCalledTimes(1);
    expect(numericLiteral).toReturnWith(0);
    expect(stringLiteral).toHaveBeenCalledTimes(1);
    expect(stringLiteral).toReturnWith(1);
  });

  it('should visit generated nodes that replace the current node', async () => {
    const stringLiteral = fn();
    await transform('1', {
      NumericLiteral(path) { path.replaceWithSourceString('"1"'); },
      StringLiteral() { stringLiteral(); },
    });
    expect(stringLiteral).toBeCalledTimes(1);
  });

  it('should visit nodes generated by exit visitors that replace the current node', async () => {
    const stringLiteral = fn();
    await transform('1', {
      NumericLiteral: { exit(path) { path.replaceWithSourceString('"1"'); } },
      StringLiteral() { stringLiteral(); },
    });
    expect(stringLiteral).toBeCalledTimes(1);
  });

  // tslint:disable-next-line:max-line-length
  it('should visit nodes generated by exit visitors that replace the current node before next siblings', async () => {
    const stringLiteral = fn();
    const booleanLiteral = fn();
    await transform('1, true', {
      NumericLiteral: { exit(path) { path.replaceWithSourceString('"1"'); } },
      StringLiteral() { stringLiteral(); },
      BooleanLiteral() { booleanLiteral(); },
    });
    expect(stringLiteral).toBeCalledTimes(1);
    expect(stringLiteral).toReturnWith(0);
    expect(booleanLiteral).toBeCalledTimes(1);
    expect(booleanLiteral).toReturnWith(1);
  });

  it('should visit child nodes generated by exit visitors', async () => {
    const emptyStatementVisitor = fn();
    await transform('{ 1; }', {
      BlockStatement: { exit(path) { path.get('body')[0].insertAfter(emptyStatement()); } },
      EmptyStatement() { emptyStatementVisitor(); },
    });
    expect(emptyStatementVisitor).toBeCalledTimes(1);
  });

  it('should visit generated child nodes', async () => {
    const emptyStatementVisitor = fn();
    await transform('{ 1; }', {
      ExpressionStatement(path) { path.insertAfter(emptyStatement()); },
      EmptyStatement() { emptyStatementVisitor(); },
    });
    expect(emptyStatementVisitor).toHaveBeenCalledTimes(1);
  });

  it('should visit generated child nodes before exiting the current node', async () => {
    const emptyStatementVisitor = fn();
    const exitArrayVisitor = fn();
    await transform('{ 1; }', {
      BlockStatement: { exit() { exitArrayVisitor(); } },
      ExpressionStatement(path) { path.insertAfter(emptyStatement()); },
      EmptyStatement() { emptyStatementVisitor(); },
    });
    expect(emptyStatementVisitor).toHaveBeenCalledTimes(1);
    expect(emptyStatementVisitor).toReturnWith(0);
    expect(exitArrayVisitor).toHaveBeenCalledTimes(1);
    expect(exitArrayVisitor).toReturnWith(1);
  });

  it('should not revisit a node if its children change', async () => {
    const blockVisitor = fn();
    await transform('{ 1; }', {
      BlockStatement() { blockVisitor(); },
      ExpressionStatement(path) { path.insertAfter(emptyStatement()); },
    });
    expect(blockVisitor).toHaveBeenCalledTimes(1);
    expect(blockVisitor).toReturnWith(0);
  });

  // Child nodes are not revisited, even if they are changed during the parent's exit
  it.skip('should revisit child nodes altered by parent exit visitors', async () => {
    const callExpressionVisitor = fn();
    const blockStatementVisitor = fn();
    await transform('{ log(1); }', {
      BlockStatement: {
        exit(path) {
          blockStatementVisitor();
          path.traverse({
            NumericLiteral(path) { path.replaceWith(stringLiteral('1')); },
          });
        },
      },
      CallExpression: { exit() { callExpressionVisitor(); } },
    });
    expect(blockStatementVisitor).toBeCalledTimes(1);
    expect(blockStatementVisitor).toReturnWith(1);
    expect(callExpressionVisitor).toBeCalledTimes(2);
    expect(callExpressionVisitor).toHaveNthReturnedWith(0, 0);
    expect(callExpressionVisitor).toHaveNthReturnedWith(1, 2);
  });

  it('should not be able to change the order of visiting', async () => {
    const identifierVisitor = fn();
    const callExpressionVisitor = fn();
    await transform('log(1);', {
      CallExpression(path) {
        // Does not actually visit the callee
        path.get('callee').visit();
        callExpressionVisitor();
      },
      Identifier() {
        identifierVisitor();
      },
    });
    expect(callExpressionVisitor).toBeCalledTimes(1);
    expect(callExpressionVisitor).toReturnWith(0);
    expect(identifierVisitor).toBeCalledTimes(1);
    expect(identifierVisitor).toReturnWith(1);
  });
});