const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ExamSecurityEvent", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  examId: { type: DataTypes.INTEGER, allowNull: false },
  eventId: { type: DataTypes.STRING(36), allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "exam_security_events",
  indexes: [{ unique: true, fields: ["userId", "examId", "eventId"] }],
});