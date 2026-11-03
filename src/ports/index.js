const contracts = require("./contracts");

function assertPort(name, adapter, methods) {
  for (const method of methods) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`El puerto ${name} requiere el metodo ${method}.`);
    }
  }
}

module.exports = { assertPort, contracts };