const sequelize = require("../config/database");
const createExamModel = require("./Exam");
const createQuestionModel = require("./Question");

const Exam = createExamModel(sequelize);
const Question = createQuestionModel(sequelize);

Exam.hasMany(Question, {
  foreignKey: "examId",
  as: "questions",
});

Question.belongsTo(Exam, {
  foreignKey: "examId",
  as: "exam",
});

module.exports = {
  sequelize,
  Exam,
  Question,
};
