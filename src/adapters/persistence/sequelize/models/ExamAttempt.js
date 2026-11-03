const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ExamAttempt", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  examId: { type: DataTypes.INTEGER, allowNull: false },
  token: { type: DataTypes.STRING, allowNull: false },
  startedAt: { type: DataTypes.DATE, allowNull: false },
  lastSeenAt: { type: DataTypes.DATE, allowNull: false },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  connected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: "exam_attempts",
  indexes: [{ unique: true, fields: ["userId", "examId"] }],
});