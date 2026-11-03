const sequelize = require("../config/database");
const createExamModel = require("./Exam");
const createQuestionModel = require("./Question");
const createUserModel = require("./User");
const createResultModel = require("./Result");
const createQuestionContentModel = require("./QuestionContent");
const createExamAssignmentModel = require("./ExamAssignment");
const createCourseModel = require("./Course");

const Exam = createExamModel(sequelize);
const Question = createQuestionModel(sequelize);
const User = createUserModel(sequelize);
const Result = createResultModel(sequelize);
const QuestionContent = createQuestionContentModel(sequelize);
const ExamAssignment = createExamAssignmentModel(sequelize);
const Course = createCourseModel(sequelize);

User.hasMany(Course, { foreignKey: "professorId", as: "courses", onDelete: "SET NULL" });
Course.belongsTo(User, { foreignKey: "professorId", as: "professor" });
Course.hasMany(Exam, { foreignKey: "courseId", as: "exams", onDelete: "RESTRICT" });
Exam.belongsTo(Course, { foreignKey: "courseId", as: "course" });

User.hasMany(Exam, { foreignKey: "creatorId", as: "createdExams", onDelete: "SET NULL" });
Exam.belongsTo(User, { foreignKey: "creatorId", as: "creator" });
User.hasMany(ExamAssignment, { foreignKey: "userId", as: "assignments", onDelete: "CASCADE" });
ExamAssignment.belongsTo(User, { foreignKey: "userId", as: "student" });
Exam.hasMany(ExamAssignment, { foreignKey: "examId", as: "assignments", onDelete: "CASCADE" });
ExamAssignment.belongsTo(Exam, { foreignKey: "examId", as: "exam" });

Exam.hasMany(Question, {
  foreignKey: "examId",
  as: "questions",
});

Question.belongsTo(Exam, {
  foreignKey: "examId",
  as: "exam",
});

Question.hasOne(QuestionContent, {
  foreignKey: { name: "questionId", allowNull: false },
  as: "content",
  onDelete: "CASCADE",
});

QuestionContent.belongsTo(Question, {
  foreignKey: "questionId",
  as: "question",
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
  QuestionContent,
  User,
  Result,
  ExamAssignment,
  Course,
};
