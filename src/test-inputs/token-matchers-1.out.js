function isToken(token) {
  return token.kind === 'token';
}
function takeOne(predicate) {
  return tokens => {
    return tokens.length > 0 && predicate(tokens[0]) ? [tokens[0], tokens.slice(1)] : [null, tokens];
  };
}
function requireOne(predicate) {
  return arg => (([result, tokens]) => {
    if (result === null) {
      throw new Error('Expected token was not found');
    }
    return [result, tokens];
  })(takeOne(predicate)(arg));
}
function requireToken(kind) {
  return requireOne(token => isToken(token) && (!kind || token.kind === kind));
}
const takeExpression = takeOne(token => !isToken(token));
function chain(...processors) {
  return tokens => processors.reduce(([results, remainingTokens], processor, index) => {
    const [result, newRemainingTokens] = processor(remainingTokens);
    return [[...results, result], newRemainingTokens];
  }, [[], tokens]);
}
const result = arg => (([[leftExpression, operatorToken, rightExpression], tokens]) => [{
  kind: 'Identifier',
  tokens: [operatorToken],
  value: operatorToken.value
}, [leftExpression, rightExpression], [...(leftExpression ? leftExpression.tokens : []), operatorToken, ...(rightExpression ? rightExpression.tokens : [])]])(chain(takeExpression, requireToken(), takeExpression)(arg));
