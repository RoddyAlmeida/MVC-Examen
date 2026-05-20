const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Result = sequelize.define("Result", {
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    total: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    answers: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: "results",
  });
  return Result;
};
