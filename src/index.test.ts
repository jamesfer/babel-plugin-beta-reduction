import { transformAsync } from '@babel/core';
import { resolve } from 'path';
import { readFile } from 'mz/fs';
// tslint:disable-next-line import-name
import plugin from './index';

function transform(code: string) {
  return transformAsync(code, {
    ast: true,
    comments: false,
    plugins: [
      plugin,
      // require('@babel/plugin-transform-parameters'),
    ],
  });
}

async function transformToCode(code: string) {
  const result = await transform(code);
  return result && result.code ? result.code.replace(/^\s*$(?:\r\n?|\n)/gm, '') : '';
}

async function expectTransform(inputCode: string, expectedCode: string) {
  expect(await transformToCode(inputCode)).toBe(expectedCode.trim());
}

async function expectTransformFile(inputPath: string, outputPath: string) {
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

  it('should hoist a complex declaration', () => expectTransform(
    `
/**
 * @inline
 */
function add(a, b) {
  const c = 6 ** 4;
  return a + b + c;
}
console.log(add(1, 3));`,
    `
const _a = 1,
      _b = 3,
      _c = 6 ** 4;
console.log(_a + _b + _c);`,
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
    return c ** 2;
  })()
)`,
      `
() => {
  const _c = Math.sin(4);
  return _c ** 2;
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
  return { value, message };
}

const result = thing => wrap([thing, 'This is a string']);
`,
      `
const result = thing => {
  const _value = [thing, 'This is a string'],
        _message = 'Wrapping a value: ' + _value;
  return {
    value: _value,
    message: _message
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

const quote = message => wrap('"', message);
`,
      `
const quote = message => {
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
    `
const result = thing => {
  const _value2 = thing;
  const _value = () => _value2;
  return () => _value;
};`,
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
const result = a => {
  return 'a' + ('a' + a);
};`,
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
  const _v = v;
  return Math.sin(_v) * Math.cos(_v) * 2;
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
  const _v = 1;
  return Math.sin(_v) * Math.cos(_v) * v;
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
const _list = [1, 2, 3],
      _mapper = number => {
  return number * 2;
};
const result = _list.map(_mapper);`,
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
      'console.log(Math.min([1, 2, 3, 4]));',
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
      "console.log(\`\${'Error'} \${'Compiler'} \${['Type error', 'Line', 123].join()}\`);",
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

  it('should not functions that mutate their arguments', () => expectTransform(
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

  it.each([1, 2, 3, 4, 5])('should inline many functions', i => (
    expectTransformFile(
      `./test-inputs/token-matchers-${i}.in.js`,
      `./test-inputs/token-matchers-${i}.out.js`,
    )
  ));

  it.each([1, 2, 3, 4, 5, 6])('should inline the reader monad',  i => (
    expectTransformFile(
      `./test-inputs/reader-monad-${i}.in.js`,
      `./test-inputs/reader-monad-${i}.out.js`,
    )
  ));
});
