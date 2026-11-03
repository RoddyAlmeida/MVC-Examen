const { toRecord } = require("./records");

function createRepository({ User }) {
  return {
    async findByEmail(email) { return toRecord(await User.findOne({ where: { email } })); },
    async create(account) { return toRecord(await User.create(account)); },
  };
}

module.exports = { createRepository };