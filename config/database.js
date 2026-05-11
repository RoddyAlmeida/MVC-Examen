require("dotenv").config();
const { Sequelize } = require("sequelize");
const libsql = require("@libsql/sqlite3");

// Envoltorio para @libsql/sqlite3 para usar Turso con el dialecto de SQLite de Sequelize.
// Esto evita problemas con la creación de directorios locales en Windows.
const customLibsql = {
  ...libsql,
  Database: class extends libsql.Database {
    constructor(storage, mode, callback) {
      const url = `${process.env.TURSO_DATABASE_URL}?authToken=${process.env.TURSO_AUTH_TOKEN}`;
      if (typeof mode === 'function') {
        super(url, mode);
      } else {
        super(url, mode, callback);
      }
    }
  },
};

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: ":memory:", // Evita la creación de directorios en Windows
  dialectModule: customLibsql,
  logging: false,
});

module.exports = sequelize;
