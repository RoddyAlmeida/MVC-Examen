const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ExamAssignment", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  examId: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "active", validate: { isIn: [["invited", "active", "rejected"]] } },
}, {
  tableName: "exam_assignments",
  indexes: [{ unique: true, fields: ["userId", "examId"] }],
});