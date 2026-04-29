const path = require("path");
const { Sequelize } = require("sequelize");

// Sequelize 6 espera la API nativa del paquete `sqlite3` (no mejor-sqlite3).
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(__dirname, "..", "data", "exam.sqlite"),
  logging: false,
});

module.exports = sequelize;
