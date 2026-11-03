const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("CourseEnrollment", {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  courseId: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "invited", validate: { isIn: [["invited", "active", "rejected"]] } },
}, {
  tableName: "course_enrollments",
  indexes: [{ unique: true, fields: ["userId", "courseId"] }],
});