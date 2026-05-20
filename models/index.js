const sequelize = require("../config/database");
const createExamModel = require("./Exam");
const createQuestionModel = require("./Question");
const createUserModel = require("./User");
const createResultModel = require("./Result");

const Exam = createExamModel(sequelize);
const Question = createQuestionModel(sequelize);
const User = createUserModel(sequelize);
const Result = createResultModel(sequelize);

Exam.hasMany(Question, {
  foreignKey: "examId",
  as: "questions",
});

Question.belongsTo(Exam, {
  foreignKey: "examId",
  as: "exam",
});

User.hasMany(Result, {
  foreignKey: "userId",
  as: "results",
});

Result.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Exam.hasMany(Result, {
  foreignKey: "examId",
  as: "examResults",
});

Result.belongsTo(Exam, {
  foreignKey: "examId",
  as: "exam",
});

module.exports = {
  sequelize,
  Exam,
  Question,
  User,
  Result,
};
