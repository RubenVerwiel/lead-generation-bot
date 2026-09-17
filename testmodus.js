// Testmodus staat altijd standaard AAN en wordt bewust NIET onthouden tussen
// paginaherladingen of sessies — dat voorkomt dat je per ongeluk in
// productiemodus blijft hangen na een ververste pagina.
let testmodus = true;
const listeners = new Set();

export function isTestmodus() {
  return testmodus;
}

export function setTestmodus(value) {
  testmodus = value;
  listeners.forEach((fn) => fn(testmodus));
}

export function onTestmodusChange(fn) {
  listeners.add(fn);
}
