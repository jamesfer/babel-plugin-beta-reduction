import { transformAsync } from '@babel/core';
import { resolve } from 'path';
import { readFile } from 'mz/fs';
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
  let result = await transform(code);
  return result ? result.code : '';
}

async function expectTransform(inputCode: string, expectedCode: string) {
  expect(await transformToCode(inputCode)).toBe(expectedCode.trim());
}

async function expectTransformFile(inputPath: string, outputPath: string) {
  const input = (await readFile(resolve(__dirname, inputPath))).toString();
  const output = (await readFile(resolve(__dirname, outputPath))).toString();
  expect(await transformToCode(input)).toBe(output.trim());
}

describe('plugin', () => {
  it('should inline a simple function', () => expectTransform(`
/**
 * @inline
 */
function one() {
  return 1;
}
console.log(one());
`, `
console.log(1);
  `));

  it('should inline a function with arguments', () => expectTransform(`
/**
 * @inline
 */
function add(a, b) {
  return a + b;
}
console.log(add(1, 3));
`, `
console.log(1 + 3);
  `));

  it('should inline a constant declaration', () => expectTransform(`
/**
 * @inline
 */
function add(a, b) {
  const c = 10;
  return a + b + c;
}
console.log(add(1, 3));
`, `
console.log(1 + 3 + 10);
  `));

  it('should inline multiple constant declarations', () => (
    expectTransform(`
/**
 * @inline
 */
function add(a, b) {
  const c = 10;
  const d = 20;
  return a + b + c + d;
}
console.log(add(1, 3));
`, `
console.log(1 + 3 + 10 + 20);
    `)
  ));

  it('should inline a multi-variable constant declaration', () => (
    expectTransform(`
/**
 * @inline
 */
function add(a, b) {
  const c = 10, d = 20;
  return a + b + c + d;
}
console.log(add(1, 3));
`, `
console.log(1 + 3 + 10 + 20);
    `)
  ));

  it('should inline a function that returns a lambda', () => expectTransform(`
function inc(a) { return a + 1; }
function sq(a) { return a ** 2; }
/**
 * @inline
 */
function compose(a, b) {
  return c => a(b(c));
}
console.log(compose(inc, sq));
`, `
function inc(a) {
  return a + 1;
}

function sq(a) {
  return a ** 2;
}

console.log(c => inc(sq(c)));
  `));

  it('should perform eta expansion', () => expectTransform(`
function inc(a) { return a + 1; }
function sq(a) { return a ** 2; }
/**
 * @inline
 */
function compose(a, b) {
  return c => a(b(c));
}
console.log(compose(inc, sq)(5));
`, `
function inc(a) {
  return a + 1;
}

function sq(a) {
  return a ** 2;
}

console.log(inc(sq(5)));
  `));

  it('should inline functions after eta expansion', () => expectTransform(`
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
console.log(compose(inc, sq)(5));
`, `
console.log(5 ** 2 + 1);
  `));

  it('should inline multiple dependent functions', () => expectTransform(`
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
console.log(incSq(1));
`, `
console.log((1 + 1) ** 2);
  `));

  it('should inline rest params', async () => {
    await expectTransform(`
/**
 * @inline
 */
function min(...args) {
  return Math.min(args);
}
console.log(min(1, 2, 3, 4));
    `, `
console.log(Math.min([1, 2, 3, 4]));
    `);

    await expectTransform(`
/**
 * @inline
 */
function log(level, label, ...messages) {
  return \`\${level} \${label} \${messages.join()}\`;
}
console.log(log('Error', 'Compiler', 'Type error', 'Line', 123));
    `, `
console.log(\`\${'Error'} \${'Compiler'} \${['Type error', 'Line', 123].join()}\`);
    `);
  });

  it('should not inline async functions', () => expectTransform(`
/**
 * @inline
 */
async function inc(a) {
  return await (a + 1);
}

console.log(inc(1));
`, `
async function inc(a) {
  return await (a + 1);
}

console.log(inc(1));
  `));

  it('should not inline complex arguments', () => expectTransform(`
/**
 * @inline
 */
function inc(a = 0) {
  return a + 1;
}

console.log(inc());
`, `
function inc(a = 0) {
  return a + 1;
}

console.log(inc());
  `));

  it('should not functions that mutate their arguments', () => expectTransform(`
/**
 * @inline
 */
function inc(a) {
  a = a + 1;
  return a;
}

console.log(inc(1));
`, `
function inc(a) {
  a = a + 1;
  return a;
}

console.log(inc(1));
  `));

  it('complex test 1', () => expectTransform(`
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

const a = e => add(5)(e) + multiply(10)(e);
  `, `
const a = e => e + 5 + e * 10;
  `));

  it('complex test 2', () => expectTransform(`
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

const resultFn = map(e => e, e => e.value * 10);
  `, `
const resultFn = e => e.value * 10;
  `));

  it.each([1, 2, 3, 4, 5])('should inline many functions', async (i) => {
    await expectTransformFile(
      `./test-inputs/token-matchers-${i}.in.js`,
      `./test-inputs/token-matchers-${i}.out.js`,
    );
  });

  it.each([1, 2, 3, 4, 5, 6])('should inline the reader monad', async (i) => {
    await expectTransformFile(
      `./test-inputs/reader-monad-${i}.in.js`,
      `./test-inputs/reader-monad-${i}.out.js`,
    );
  });
});
