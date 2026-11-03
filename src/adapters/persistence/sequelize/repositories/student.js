const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { Exam, Question, QuestionContent, Result, ExamAssignment, Course, CourseEnrollment, ExamAttempt } = models;
  return {
    update,
    destroy,
    async listAccessibleExams(req) {
      return toRecord(await Exam.findAll({
        attributes: { exclude: ["passwordHash", "joinCode"] },
        include: [{ model: ExamAssignment, as: "assignments", where: { userId: req.session.userId, status: "active" }, required: true },
        { model: Course, as: "course", required: true, include: [{ model: CourseEnrollment, as: "enrollments", where: { userId: req.session.userId, status: "active" }, required: true }] }],
        order: [["createdAt", "DESC"]],
      }));
    },

    async listStudentResults(req) {
      return toRecord(await Result.findAll({
        where: { userId: req.session.userId },
        attributes: ["examId", "score", "total", "answers"],
      }));
    },

    async listExamInvitations(req) {
      return toRecord(await ExamAssignment.findAll({ where: { userId: req.session.userId, status: "invited" }, include: [{ model: Exam, as: "exam", attributes: ["id", "title", "courseId"], include: [{ model: Course, as: "course" }] }] }));
    },

    async findExamForStart(req) {
      return toRecord(await Exam.findOne({
        where: { id: req.params.id },
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
      }));
    },

    async findExistingResult(req, exam) {
      return toRecord(await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } }));
    },

    async findExamWithQuestions(req) {
      return toRecord(await Exam.findOne({
        where: { id: req.params.id },
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
        order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
      }));
    },

    async createResult(values, transaction) {
      return toRecord(await Result.create(values, { transaction }));
    },

    async finishAttempt(values, req, exam, transaction) {
      return toRecord(await ExamAttempt.update(values, {
        where: { userId: req.session.userId, examId: exam.id }, transaction,
      }));
    },
  };
}

module.exports = { createRepository };
