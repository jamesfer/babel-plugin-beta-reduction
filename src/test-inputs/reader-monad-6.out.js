function processData(data) {
  return e => data.map(value => value * e.coefficient + e.constant);
}
function sumData(data) {
  return e => data.reduce((sum, value) => sum + value);
}
function main() {
  const data = [1, 2, 3, 4, 5];
  const processedData = processData(data);
  const result = e => sumData(processedData(e))(e);
  return result({
    constant: 10,
    coefficient: 2
  });
}
main();
