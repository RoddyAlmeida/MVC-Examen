const { DataTypes } = require("sequelize");

module.exports = (sequelize) => sequelize.define("QuestionContent", {
    type: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    configuration: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
}, {
    tableName: "question_contents",
});
