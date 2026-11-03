const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, Question, QuestionContent, Result, Course, CourseEnrollment, ExamAttempt } = models;
  return {
    update,
    destroy,
    async listOwnedCourses(req) {
      return toRecord(await Course.findAll({ where: { professorId: req.session.userId }, order: [["name", "ASC"]] }));
    },

    async listCourseExams(course, req) {
      return toRecord(await Exam.findAll({ where: { courseId: course.id, creatorId: req.session.userId }, order: [["createdAt", "DESC"]] }));
    },

    async createImportedExam(values, transaction) {
      return toRecord(await Exam.create(values, { transaction }));
    },

    async createImportedQuestion(values, transaction) {
      return toRecord(await Question.create(values, { transaction }));
    },

    async createImportedContent(values, transaction) {
      return toRecord(await QuestionContent.create(values, { transaction }));
    },

    async createExam(values) {
      return toRecord(await Exam.create(values));
    },

    async findExamById(req) {
      return toRecord(await Exam.findByPk(req.params.id));
    },

    async listQuestions(examId) {
      return toRecord(await Question.findAll({
        where: { examId },
        include: [{ model: QuestionContent, as: "content" }],
        order: [["id", "ASC"]],
      }));
    },

    async findExamWithQuestions(req) {
      return toRecord(await Exam.findByPk(req.params.id, {
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
        order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
      }));
    },

    async countQuestions(exam) {
      return toRecord(await Question.count({ where: { examId: exam.id } }));
    },

    async createQuestion(values) {
      return toRecord(await Question.create(values));
    },

    async createContent(values) {
      return toRecord(await QuestionContent.create(values));
    },

    async findQuestionWithContent(req) {
      return toRecord(await Question.findByPk(req.params.qid, { include: [{ model: QuestionContent, as: "content" }] }));
    },

    async findQuestionExam(question) {
      return toRecord(await Exam.findByPk(question.examId));
    },

    async findQuestionById(req) {
      return toRecord(await Question.findByPk(req.params.qid));
    },

    async listTeachingStudents(req) {
      return toRecord(await User.findAll({
        where: { role: "estudiante" },
        include: [{
          model: CourseEnrollment, as: "enrollments", where: { status: "active" }, required: true,
          include: [{ model: Course, as: "course", where: { professorId: req.session.userId }, required: true }]
        }],
        order: [["createdAt", "DESC"]],
      }));
    },

    async findStudentById(req) {
      return toRecord(await User.findByPk(req.params.id));
    },

    async listStudentResults(student, req) {
      return toRecord(await Result.findAll({
        where: { userId: student.id },
        include: [{ model: Exam, as: "exam", where: { creatorId: req.session.userId }, required: true }],
        order: [["createdAt", "DESC"]],
      }));
    },

    async findStudentExamResult(student, req) {
      return toRecord(await Result.findOne({
        where: { userId: student.id, examId: req.params.eid },
        include: [{ model: Exam, as: "exam", include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }] }],
      }));
    },

    async removeStudentExamResult(student, req, transaction) {
      return toRecord(await Result.destroy({ where: { userId: student.id, examId: req.params.eid }, transaction }));
    },

    async removeStudentExamAttempt(student, req, transaction) {
      return toRecord(await ExamAttempt.destroy({ where: { userId: student.id, examId: req.params.eid }, transaction }));
    },
  };
}

module.exports = { createRepository };
