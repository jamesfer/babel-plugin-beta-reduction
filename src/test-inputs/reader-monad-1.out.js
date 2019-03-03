function of(a) {
  return e => a;
}

function ask() {
  return e => e;
}

function bind(reader, f) {
  return e => f(reader(e))(e);
}

function map(reader, f) {
  return bind(reader, a => of(f(a)));
}

function runReader(reader, e) {
  return reader(e);
}

function processData(data) {
  return map(ask(), e => data.map(value => value * e.coefficient + e.constant));
}

function sumData(data) {
  return of(data.reduce((sum, value) => sum + value));
}

function main() {
  const data = [1, 2, 3, 4, 5];
  const processedData = processData(data);
  const result = bind(processedData, sumData);
  return runReader(result, {
    constant: 10,
    coefficient: 2
  });
}

main();
