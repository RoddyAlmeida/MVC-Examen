function createUnitOfWork(sequelize) {
  return { run(work) { return sequelize.transaction(work); } };
}

module.exports = { createUnitOfWork };