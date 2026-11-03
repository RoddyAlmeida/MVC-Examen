const { randomBytes } = require("node:crypto");

module.exports = { hex(size) { return randomBytes(size).toString("hex"); } };