const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("ExamAssignment", {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    examId: { type: DataTypes.INTEGER, allowNull: false },
}, {
    tableName: "exam_assignments",
    indexes: [{ unique: true, fields: ["userId", "examId"] }],
});