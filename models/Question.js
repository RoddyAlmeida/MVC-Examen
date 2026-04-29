const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Question = sequelize.define(
    "Question",
    {
      prompt: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      optionA: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      optionB: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      optionC: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      correctOption: {
        type: DataTypes.ENUM("A", "B", "C"),
        allowNull: false,
      },
    },
    {
      tableName: "questions",
    }
  );

  return Question;
};
