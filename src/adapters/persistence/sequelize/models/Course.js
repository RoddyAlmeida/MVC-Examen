const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("Course", {
  name: { type: DataTypes.STRING(200), allowNull: false },
  professorId: { type: DataTypes.INTEGER, allowNull: true },
  membersVisible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: "courses" });