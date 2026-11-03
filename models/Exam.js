const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Exam = sequelize.define(
    "Exam",
    {
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
    }
  );

  return Exam;
};
