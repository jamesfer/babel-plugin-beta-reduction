import { BabelFileResult, transformAsync } from '@babel/core';
import { resolve } from 'path';
import { readFile } from 'mz/fs';
// tslint:disable-next-line import-name
import plugin from './index';

function transform(code: string): Promise<BabelFileResult | null> {
  return transformAsync(code, {
    ast: true,
    comments: false,
    plugins: [
      plugin,
      // require('@babel/plugin-transform-parameters'),
    ],
  });
}

async function transformToCode(code: string): Promise<string> {
  const result = await transform(code);
  return result && result.code ? result.code.replace(/^\s*$(?:\r\n?|\n)/gm, '') : '';
}

async function expectTransform(inputCode: string, expectedCode: string): Promise<void> {
  expect(await transformToCode(inputCode)).toBe(expectedCode.trim());
}

async function expectTransformFile(inputPath: string, outputPath: string): Promise<void> {
  const input = (await readFile(resolve(__dirname, inputPath))).toString();
  const output = (await readFile(resolve(__dirname, outputPath))).toString();
  expect(await transformToCode(input)).toBe(output.trim());
}

// TODO convert all comments to one line style
describe('plugin', () => {
  it('should inline a simple function', () => expectTransform(
    `
/**
 * @inline
 */
function one() {
  return 1;
}
console.log(one());`,
    'console.log(1);',
  ));

  it('should inline a function with arguments', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  return a + b;
}
console.log(add(1, 3));`,
    'console.log(1 + 3);',
  ));

  it('should inline a constant declaration', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  const c = 10;
  return a + b + c;
}
console.log(add(1, 3));`,
    'console.log(1 + 3 + 10);',
  ));

  it('should inline multiple constant declarations', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  const c = 10;
  const d = 20;
  return a + b + c + d;
}
console.log(add(1, 3));`,
    'console.log(1 + 3 + 10 + 20);',
  ));

  it('should inline a multi-variable constant declaration', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  const c = 10, d = 20;
  return a + b + c + d;
}
console.log(add(1, 3));`,
    'console.log(1 + 3 + 10 + 20);',
  ));

  it.skip('should inline a complex declaration', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  const c = 6 ** 4;
  return a + b + c;
}
console.log(add(1, 3));`,
    'console.log(1 + 3 + c ** 4);',
  ));

  it('should not hoist a variable that is declared inside a conditional expression', () => (
    expectTransform(
      `
const a = something ? (() => {
  const b = 5;
  return b / 3;
})() : 6;`,
      `
const a = something ? (() => {
  const b = 5;
  return b / 3;
})() : 6;`,
    )
  ));

  it('should hoist a variable that was declared in a if statement', () => expectTransform(
    `
if (a) {
  const b = (() => {
    const c = Math.sin(4);
    return c * c ** 2;
  })();
}`,
    `
if (a) {
  const _c = Math.sin(4);
  const b = _c * _c ** 2;
}`,
  ));

  it('should hoist a variable that was declared in a if statement with no body', () => (
    expectTransform(
      `
if (a)
  console.log((() => {
    const c = Math.sin(4);
    return c * c ** 2;
  })());`,
      `
if (a) {
  const _c = Math.sin(4);
  console.log(_c * _c ** 2);
}`,
    )
  ));

  it('should hoist a variable that was called inside an arrow function expression', () => (
    expectTransform(
      `
() => (
  (() => {
    const c = Math.sin(4);
    return (c + c) ** 2;
  })()
)`,
      `
() => {
  const _c = Math.sin(4);
  return (_c + _c) ** 2;
};`,
    )
  ));

  it('should inline a variable inside an inlined function, used in an arrow function', () => (
    expectTransform(
      `
/**
 * @inline
 */
function wrap(value) {
  const message = 'Wrapping a value: ' + value;
  return { value, message, message2: message };
}

const result = thing => wrap([thing, 'This is a string']);
`,
      `
const result = thing => {
  const _value = [thing, 'This is a string'],
        _message = 'Wrapping a value: ' + _value;
  return {
    value: _value,
    message: _message,
    message2: _message
  };
};`,
    )
  ));

  it('should hoist a variable inside an inlined function, used in an arrow function', () => (
    expectTransform(
      `
/**
 * @inline
 */
function wrap(quote, message) {
  return quote + message + quote
}

const string = message => wrap('"', message);
`,
      `
const string = message => {
  const _quote = '"';
  return _quote + message + _quote;
};`,
    )
  ));

  it('should hoist a variable inside an inlined function, used deeply in an arrow function', () => (
    expectTransform(
      `
/**
 * @inline
 */
function wrap(value) {
  const message = 'Wrapping a value: ' + value;
  return { value, message };
}

const result = thing => Object.keys(wrap([thing, 'This is a string']));
`,
      `
const result = thing => {
  const _value = [thing, 'This is a string'];
  return Object.keys({
    value: _value,
    message: 'Wrapping a value: ' + _value
  });
};`,
    )
  ));

  it('should inline two usages of the same inlined function', () => expectTransform(
    `
/**
 * @inline
 */
function constant(value) {
  return () => value;
}

const result = thing => constant(constant(thing));`,
    'const result = thing => () => () => thing;',
  ));

  it('should inline a function sandwich', () => expectTransform(
    `
/** @inline */
function simple(a) {
  return 'a' + a;
}
/** @inline */
function complex(b) {
  return b + b;
}
const result = c => simple(complex(simple(c)));`,
    `
const result = c => {
  const _b = 'a' + c;
  return 'a' + (_b + _b);
};`,
  ));

  it('should inline a nested function call with a duplicate variable', () => expectTransform(
    `
/** @inline */
function simple(a) {
  return 'a' + a;
}
const result = (a) => simple(simple(a));`,
    `
const result = a => 'a' + ('a' + a);`,
  ));

  it('should inline a function with a parameter that exists in the parent scope', () => (
    expectTransform(
      `
/** @inline */
function inner(v) {
  return Math.sin(v) * Math.cos(v);
}

function outer(v) {
  return inner(v) * 2;
}`,
      `
function outer(v) {
  const _v2 = v;
  return Math.sin(_v2) * Math.cos(_v2) * 2;
}`,
    )
  ));

  it('should inline a function with a variable that exists in the parent scope', () => (
    expectTransform(
      `
/** @inline */
function inner() {
  const v = 1;
  return Math.sin(v) * Math.cos(v);
}

function outer(v) {
  return inner() * v;
}`,
      `
function outer(v) {
  const _v2 = 1;
  return Math.sin(_v2) * Math.cos(_v2) * v;
}`,
    )
  ));

  it('should inline two sibling functions', () => expectTransform(
    `
/** @inline */
function double(a) {
  return a + a;
}

const result = () => Math.max(double(1), double(2));`,
    `
const result = () => {
  const _a = 1;
  const _a2 = 2;
  return Math.max(_a + _a, _a2 + _a2);
};`,
  ));

  it('should inline a function that is not immediately called', () => expectTransform(
    `
/**
 * @inline
 */
function map(list, mapper) {
  return list.map(mapper);
}

/**
 * @inline
 */
function multiply(number) {
  return number * 2;
}

const result = map([1, 2, 3], multiply);`,
    `
const result = [1, 2, 3].map(number => {
  return number * 2;
});`,
  ));

  it('should not insert a declaration if there are no variables to hoist', () => expectTransform(
    'const result = (() => 5)(10);',
    'const result = 5;',
  ));

  it.skip('should correctly hoist parameters with default arguments', () => expectTransform(
    `
/**
 * @inline
 */
function wrap(value, message = 'Wrapping a value: ' + value) {
  return { value, message };
}

const result = thing => wrap([thing, 'This is a string']);
`,
    `
const result = thing => {
  const _value = [thing, 'This is a string'];
  const _message = 'Wrapping a value: ' + _value;
  return {
    value: _value,
    message: _message
  };
};`,
  ));

  it('should inline a function that returns a lambda', () => expectTransform(
    `
function inc(a) { return a + 1; }
function sq(a) { return a ** 2; }
/**
 * @inline
 */
function compose(a, b) {
  return c => a(b(c));
}
console.log(compose(inc, sq));`,
    `
function inc(a) {
  return a + 1;
}
function sq(a) {
  return a ** 2;
}
console.log(c => inc(sq(c)));`,
  ));

  it('should perform eta expansion', () => expectTransform(
    `
function inc(a) { return a + 1; }
function sq(a) { return a ** 2; }
/**
 * @inline
 */
function compose(a, b) {
  return c => a(b(c));
}
console.log(compose(inc, sq)(5));`,
    `
function inc(a) {
  return a + 1;
}
function sq(a) {
  return a ** 2;
}
console.log(inc(sq(5)));`,
  ));

  it('should inline functions after eta expansion', () => expectTransform(
    `
/**
 * @inline
 */
function inc(a) {
  return a + 1;
}
/**
 * @inline
 */
function sq(a) {
  return a ** 2;
}
/**
 * @inline
 */
function compose(a, b) {
  return c => a(b(c));
}
console.log(compose(inc, sq)(5));`,
    'console.log(5 ** 2 + 1);',
  ));

  it('should inline multiple dependent functions', () => expectTransform(
    `
/**
 * @inline
 */
function inc(a) {
  return a + 1;
}
/**
 * @inline
 */
function incSq(a) {
  return inc(a) ** 2;
}
console.log(incSq(1));`,
    'console.log((1 + 1) ** 2);',
  ));

  it('should not inline a function into a member expression', () => expectTransform(
    `
/** @inline */
function j() {
  return { j: 1 };
}

function t() {
  return j();
}`,
    `
function t() {
  return {
    j: 1
  };
}`,
  ));

  it('should inline rest params', async () => {
    await expectTransform(
      `
/**
 * @inline
 */
function min(...args) {
  return Math.min(args);
}
console.log(min(1, 2, 3, 4));`,
      `
const _args = [1, 2, 3, 4];
console.log(Math.min(_args));`,
    );

    await expectTransform(
      `
/**
 * @inline
 */
function log(level, label, ...messages) {
  return \`\${level} \${label} \${messages.join()}\`;
}
console.log(log('Error', 'Compiler', 'Type error', 'Line', 123));
      `,
      `
const _messages = ['Type error', 'Line', 123];
console.log(\`\${'Error'} \${'Compiler'} \${_messages.join()}\`);`,
    );
  });

  it('should not inline async functions', () => expectTransform(
    `
/**
 * @inline
 */
async function inc(a) {
  return await (a + 1);
}

console.log(inc(1));`,
    `
async function inc(a) {
  return await (a + 1);
}
console.log(inc(1));`,
  ));

  it('should not inline complex arguments', () => expectTransform(
    `
/**
 * @inline
 */
function inc(a = 0) {
  return a + 1;
}

console.log(inc());`,
    `
function inc(a = 0) {
  return a + 1;
}
console.log(inc());`,
  ));

  it('should not inline functions that mutate their arguments', () => expectTransform(
    `
/**
 * @inline
 */
function inc(a) {
  a = a + 1;
  return a;
}

console.log(inc(1));`,
    `
function inc(a) {
  a = a + 1;
  return a;
}
console.log(inc(1));`,
  ));

  it('complex test 1', () => expectTransform(
    `
/**
 * @inline
 */
function withEnv(f) {
  return e => f(e);
}

/**
 * @inline
 */
function add(num) {
  return withEnv(e => e + num);
}

/**
 * @inline
 */
function multiply(num) {
  return withEnv(e => e * num);
}

const a = e => add(5)(e) + multiply(10)(e);`,
    'const a = e => e + 5 + e * 10;',
  ));

  it('complex test 2', () => expectTransform(
    `
/**
 * of :: a -> e -> a
 * @inline
 */
function of(a) {
  return e => a;
}

/**
 * bind :: (e -> a) -> (a -> e -> b) -> e -> b
 * @inline
 */
function bind(reader, f) {
  return e => f(reader(e))(e);
}

/**
 * map :: (e -> a) -> (a -> b) -> e -> b
 * @inline
 */
function map(reader, f) {
  return bind(reader, a => of(f(a)));
}

const resultFn = map(e => e, e => e.value * 10);`,
    'const resultFn = e => e.value * 10;',
  ));

  it('should inline constant object literal member expressions', () => expectTransform(
    `
const a = {
  name: "Steve",
  age: 35,
}.name;`,
    'const a = "Steve";',
  ));

  it('should rename any shadowed variables in the callee', () => expectTransform(
    `
/** @inline */
function a(f) {
  return t => [t, f];
}

const r = t => _t => a({ t });`,
    `
const r = t => _t => _t2 => [_t2, {
  t
}];`,
  ));

  it.skip('should inline a lambda that is called from a parameter', () => expectTransform(
    `
/** @inline */
function a(t, f) {
  return t ? f() : null;
}

const result = t => u => a(t, () => 1 + 1);`,
    'const result = t => t ? 1 + 1 : null;',
  ));

  it('should inline an object declaration if it is only used in member expressions', () => (
    expectTransform(
      `
function a() {
  const obj = { t: 1, u: 2 };
  console.log(obj.t, obj.u);
}`,
      `
function a() {
  console.log(1, 2);
}`,
    )
  ));

  it('should inline an object declaration inside an function expression', () => (
    expectTransform(
      `
const a = function () {
  const obj = { t: 1, u: 2 };
  console.log(obj.t, obj.u);
}`,
      `
const a = function () {
  console.log(1, 2);
};`,
    )
  ));

  it('should inline an object declaration inside an arrow function expression', () => (
    expectTransform(
      `
const a = () => {
  const obj = { t: 1, u: 2 };
  console.log(obj.t, obj.u);
}`,
      `
const a = () => {
  console.log(1, 2);
};`,
    )
  ));

  it('should inline an object declaration with a dynamic key', () => expectTransform(
    `
function a() {
  const obj = { ['t' + '1']: 1 };
  console.log(obj.t1);
}`,
    `
function a() {
  console.log(1);
}`,
  ));

  it('should inline an object with a spread element', () => expectTransform(
    `
function a() {
  const obj = { ...{ t: 1 } };
  console.log(obj.t);
}`,
    `
function a() {
  console.log(1);
}`,
  ));

  it('should inline an object with duplicate keys', () => expectTransform(
    `
function a() {
  const obj = { t: 1, ['t']: 2 };
  console.log(obj.t);
}`,
    `
function a() {
  console.log(2);
}`,
  ));

  it('should not inline an object that has a reference that is not a member expression', () => (
    expectTransform(
      `
function a() {
  const obj = { t: 1 };
  console.log(obj, obj.t);
}`,
      `
function a() {
  const obj = {
    t: 1
  };
  console.log(obj, obj.t);
}`)
  ));

  it('should not inline an object that has dynamic spread keys referenced', () => (
    expectTransform(
      `
function a(b) {
  const obj = { t: 1, ...b };
  console.log(obj.t);
}`,
      `
function a(b) {
  const obj = {
    t: 1,
    ...b
  };
  console.log(obj.t);
}`,
    )
  ));

  it('should inline an object that has dynamic spread keys overwritten with static ones', () => (
    expectTransform(
      `
function a(b) {
  const obj = { ...b, t: 1 };
  console.log(obj.t);
}`,
      `
function a(b) {
  console.log(1);
}`,
    )
  ));

  it('should not inline an object that has dynamic computed keys referenced', () => (
    expectTransform(
      `
function a(b) {
  const obj = { t: 1, [b]: 2 };
  console.log(obj.t);
}`,
      `
function a(b) {
  const obj = {
    t: 1,
    [b]: 2
  };
  console.log(obj.t);
}`,
    )
  ));

  it('should not inline an object reference that is not the subject of a MemberExpression', () => (
    expectTransform(
      `
function a(b) {
  const obj = { t: 1 };
  console.log(b.obj);
}`,
      `
function a(b) {
  console.log(b.obj);
}`,
    )
  ));

  it('should inline an object reference that appeared during eta expansion', () => expectTransform(
    `
/** @inline */
function a(b) {
  return { result: b + 1, message: 'Incremented' };
}

function d(b) {
  const obj = a(b);
  console.log(obj.result, obj.message);
}`,
    `
function d(b) {
  console.log(b + 1, 'Incremented');
}`,
  ));

  it('it should inline an object literal that was hoisted during eta expansion', () => (
    expectTransform(
      `
/** @inline */
function getValue(monad) {
  return monad.maybe === 0 ? null : monad.value;
}

function a() {
  return getValue({ value: 123, maybe: 1 });
}`,
      `
function a() {
  return 1 === 0 ? null : 123;
}`,
    )
  ));

  // TODO investigate why the intermediate functions are not inlined
  it('should inline an object reference that appeared late during eta expansion', () => (
    expectTransform(
      `
/** @inline */
function just(value) {
  return { value, maybe: 1 };
}

/** @inline */
function bindMaybe(monad, fn) {
  return monad.maybe === 0 ? null : fn(monad.value);
}

/** @inline */
function bindResult(monad, operation) {
  return tokens => bindMaybe(monad(tokens), result => operation(result[1])(result[0]));
}

/** @inline */
function askTokens() {
  return tokens => just([tokens, tokens]);
}

function takeOne(predicate) {
  return bindResult(askTokens(), tokens => (
    tokens.length > 0 && predicate(tokens[0])
      ? () => just([tokens.slice(1), tokens[0]])
      : () => null
  ));
}`,
      `
function takeOne(predicate) {
  return tokens => {
    return 1 === 0 ? null : (tokens.length > 0 && predicate(tokens[0]) ? () => ({
      value: [tokens.slice(1), tokens[0]],
      maybe: 1
    }) : () => null)(tokens);
  };
}`,
    )
  ));

  it.each([1/*, 2, 3, 4, 5*/])('should inline many functions', i => (
    expectTransformFile(
      `./test-inputs/token-matchers-${i}.in.js`,
      `./test-inputs/token-matchers-${i}.out.js`,
    )
  ));

  it.each([1, 2, 3, 4/*, 5, 6*/])('should inline the reader monad',  i => (
    expectTransformFile(
      `./test-inputs/reader-monad-${i}.in.js`,
      `./test-inputs/reader-monad-${i}.out.js`,
    )
  ));
});
