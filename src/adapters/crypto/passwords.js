const bcrypt = require("bcryptjs");

module.exports = {
  compare(plain, hashed) { return bcrypt.compare(plain, hashed); },
  hash(plain) { return bcrypt.hash(plain, 10); },
  byteLength(value) { return Buffer.byteLength(value); },
};