import { combineVisitors } from './combine-visitors';

describe('combineVisitors', () => {
  it('should include keys from multiple visitors', () => {
    const visitor1 = { Identifier: () => {} };
    const visitor2 = { MemberExpression: () => {} };
    const visitor3 = { LogicalExpression: () => {}, BinaryExpression: () => {} };

    expect(combineVisitors(visitor1, visitor2, visitor3)).toEqual({
      Identifier: { enter: visitor1.Identifier },
      MemberExpression: { enter: visitor2.MemberExpression },
      LogicalExpression: { enter: visitor3.LogicalExpression },
      BinaryExpression: { enter: visitor3.BinaryExpression },
    });
  });

  it('should correctly combine enter and exit visitor functions', () => {
    const visitor1 = { Identifier: () => {} };
    const visitor2 = { Identifier: { exit: () => {} } };

    expect(combineVisitors(visitor1, visitor2)).toEqual({
      Identifier: {
        enter: visitor1.Identifier,
        exit: visitor2.Identifier.exit,
      },
    });
  });

  it('should merge overlapping visitors', () => {
    const visitor1 = { Identifier: () => {} };
    const visitor2 = { Identifier: () => {} };

    expect(combineVisitors(visitor1, visitor2)).toEqual({
      Identifier: { enter: expect.any(Function) },
    });
  });

  it('should call overlapping visitor functions', () => {
    // We make the mock return this so that we can assert on its value
    const visitor1 = { Identifier: jest.fn().mockReturnThis() };
    const visitor2 = { Identifier: jest.fn().mockReturnThis() };

    const combinedVisitor = combineVisitors(visitor1, visitor2);
    const path = {};
    const state = {};
    (combinedVisitor.Identifier as any).enter.call(state, path);

    [visitor1, visitor2].forEach(({ Identifier: fn }) => {
      expect(fn).toBeCalledTimes(1);
      expect(fn).toBeCalledWith(path);
      expect(fn).toReturnWith(state);
    });
  });
});
