const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Exam = sequelize.define(
    "Exam",
    {
      passwordHash: { type: DataTypes.STRING, allowNull: true },
      securityMode: { type: DataTypes.STRING, allowNull: false, defaultValue: "none", validate: { isIn: [["none", "locked", "monitored"]] } },
      securityRevision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      joinCode: { type: DataTypes.STRING, allowNull: true },
      courseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      creatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      instructions: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: "exams",
      indexes: [{ name: "exams_join_code_unique", unique: true, fields: ["joinCode"] }],
    }
  );

  return Exam;
};
