function isToken(token) {
  return token.kind === 'token';
}

function requireOne(predicate) {
  return arg => (([result, tokens]) => {
    if (result === null) {
      throw new Error('Expected token was not found');
    }

    return [result, tokens];
  })(arg.length > 0 && predicate(arg[0]) ? [arg[0], arg.slice(1)] : [null, arg]);
}

function requireToken(kind) {
  return requireOne(token => isToken(token) && (!kind || token.kind === kind));
}

const takeExpression = tokens => {
  return tokens.length > 0 && !isToken(tokens[0]) ? [tokens[0], tokens.slice(1)] : [null, tokens];
};

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
