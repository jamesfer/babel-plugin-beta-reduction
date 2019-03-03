function isToken(token) {
  return token.kind === 'token';
}

/**
 * @inline
 */
function compose(fn, mapper) {
  return arg => mapper(fn(arg));
}

/**
 * @inline
 */
function takeOne(predicate) {
  return (tokens) => {
    return tokens.length > 0 && predicate(tokens[0])
      ? [tokens[0], tokens.slice(1)]
      : [null, tokens];
  }
}

/**
 * @inline
 */
function requireOne(predicate) {
  return compose(
    takeOne(predicate),
    ([result, tokens]) => {
      if (result === null) {
        throw new Error('Expected token was not found');
      }
      return [result, tokens];
    }
  );
}

/**
 * @inline
 */
function requireToken(kind) {
  return requireOne(token => isToken(token) && (!kind || token.kind === kind));
}

const takeExpression = takeOne(token => !isToken(token));

/**
 * @inline
 */
function chain(...processors) {
  return tokens => processors.reduce(
    ([results, remainingTokens], processor, index) => {
      const [result, newRemainingTokens] = processor(remainingTokens);
      return [[...results, result], newRemainingTokens];
    },
    [[], tokens]
  );
}

const result = compose(
  chain(takeExpression, requireToken(), takeExpression),
  ([[leftExpression, operatorToken, rightExpression], tokens]) => [
    {
      kind: 'Identifier',
      tokens: [operatorToken],
      value: operatorToken.value,
    },
    [leftExpression, rightExpression],
    [
      ...leftExpression ? leftExpression.tokens : [],
      operatorToken,
      ...rightExpression ? rightExpression.tokens : [],
    ],
  ],
);
