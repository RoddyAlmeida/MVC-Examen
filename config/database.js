const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
if (process.resourcesPath) {
  require("dotenv").config({ path: path.join(process.resourcesPath, ".env") });
}
const { Sequelize } = require("sequelize");
const libsql = require("@libsql/sqlite3");

// Sequelize annotates SQLite index rows during sync; libSQL returns frozen rows.
const originalStatementAll = libsql.Statement.prototype.all;
libsql.Statement.prototype.all = function (...args) {
  const callbackIndex = args.length - 1;
  if (typeof args[callbackIndex] === "function") {
    const callback = args[callbackIndex];
    args[callbackIndex] = function (error, rows) {
      callback.call(this, error, Array.isArray(rows) ? rows.map((row) => ({ ...row })) : rows);
    };
  }
  return originalStatementAll.apply(this, args);
};

// Envoltorio para @libsql/sqlite3 para usar Turso con el dialecto de SQLite de Sequelize.
// Esto evita problemas con la creación de directorios locales en Windows.
const customLibsql = {
  ...libsql,
  Database: class extends libsql.Database {
    constructor(storage, mode, callback) {
      const url = `${process.env.TURSO_DATABASE_URL}?authToken=${process.env.TURSO_AUTH_TOKEN}`;
      if (typeof mode === "function") {
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

const manager = sequelize.connectionManager;
const acquireConnection = manager.getConnection.bind(manager);
let reconnecting;

function isClosedStream(error) {
  if (!error) return false;
  return error.name === "ClosedError" || error.status === 404 || isClosedStream(error.cause);
}

manager.getConnection = async function (options) {
  if (reconnecting) await reconnecting;
  const connection = await acquireConnection(options);
  try {
    await new Promise((resolve, reject) => {
      connection.get("SELECT 1", (error) => error ? reject(error) : resolve());
    });
    return connection;
  } catch (error) {
    if (!isClosedStream(error)) throw error;
    if (!reconnecting) {
      reconnecting = (async () => {
        for (const key of Object.keys(manager.connections)) {
          if (manager.connections[key] === connection) delete manager.connections[key];
        }
        await new Promise((resolve) => connection.close(resolve));
        return acquireConnection(options);
      })().finally(() => { reconnecting = null; });
    }
    return reconnecting;
  }
};

module.exports = sequelize;
