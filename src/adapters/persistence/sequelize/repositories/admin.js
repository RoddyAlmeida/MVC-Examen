const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, Question, QuestionContent, Result, ExamAssignment, Course, CourseEnrollment } = models;
  return {
    update,
    destroy,
    async listUsers() {
      return toRecord(await User.findAll({ attributes: { exclude: ["password"] }, order: [["name", "ASC"]] }));
    },

    async listExams() {
      return toRecord(await Exam.findAll({
        include: [{ model: User, as: "creator", attributes: ["id", "name", "email"] },
        { model: Course, as: "course" },
        { model: Question, as: "questions", attributes: ["id"] }], order: [["createdAt", "DESC"]]
      }));
    },

    async listAssignments() {
      return toRecord(await ExamAssignment.findAll({
        include: [{ model: Exam, as: "exam" },
        { model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]]
      }));
    },

    async listResults() {
      return toRecord(await Result.findAll({
        include: [{ model: Exam, as: "exam" },
        { model: User, as: "user", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]]
      }));
    },

    async listCourses() {
      return toRecord(await Course.findAll({
        include: [{ model: User, as: "professor", attributes: ["id", "name", "email"] },
        { model: Exam, as: "exams", attributes: ["id"] }], order: [["name", "ASC"]]
      }));
    },

    async listProfessors() {
      return toRecord(await User.findAll({ where: { role: "profesor" }, attributes: ["id", "name", "email"], order: [["name", "ASC"]] }));
    },

    async listStudents() {
      return toRecord(await User.findAll({ where: { role: "estudiante" }, attributes: ["id", "name", "email"], order: [["name", "ASC"]] }));
    },

    async listEnrollments() {
      return toRecord(await CourseEnrollment.findAll({ include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]] }));
    },

    async createCourse(values) {
      return toRecord(await Course.create(values));
    },

    async findCourseById(req) {
      return toRecord(await Course.findByPk(req.params.id));
    },

    async transferCourseExams(values, course, transaction) {
      return toRecord(await Exam.update(values, { where: { courseId: course.id }, transaction }));
    },

    async countCourseExams(course) {
      return toRecord(await Exam.count({ where: { courseId: course.id } }));
    },

    async createUser(values) {
      return toRecord(await User.create(values));
    },

    async findUserById(id) {
      return toRecord(await User.findByPk(id));
    },

    async countAdministrators() {
      return toRecord(await User.count({ where: { role: "administrador" } }));
    },

    async removeStudentAssignments(user) {
      return toRecord(await ExamAssignment.destroy({ where: { userId: user.id } }));
    },

    async removeStudentEnrollments(user) {
      return toRecord(await CourseEnrollment.destroy({ where: { userId: user.id } }));
    },

    async detachProfessorCourses(values, user) {
      return toRecord(await Course.update(values, { where: { professorId: user.id } }));
    },

    async detachProfessorExams(values, user) {
      return toRecord(await Exam.update(values, { where: { creatorId: user.id } }));
    },

    async removeStudentResults(user) {
      return toRecord(await Result.destroy({ where: { userId: user.id } }));
    },

    async findAssignmentById(req) {
      return toRecord(await ExamAssignment.findByPk(req.params.id));
    },

    async findCourseForExam(body) {
      return toRecord(await Course.findByPk(body.courseId || 0));
    },

    async createExam(values) {
      return toRecord(await Exam.create(values));
    },

    async findExamById(req) {
      return toRecord(await Exam.findByPk(req.params.id));
    },

    async listExamQuestionIds(exam) {
      return toRecord(await Question.findAll({ where: { examId: exam.id }, attributes: ["id"] }));
    },

    async removeQuestionContent(question) {
      return toRecord(await QuestionContent.destroy({ where: { questionId: question.id } }));
    },

    async removeExamResults(exam) {
      return toRecord(await Result.destroy({ where: { examId: exam.id } }));
    },

    async removeExamAssignments(exam) {
      return toRecord(await ExamAssignment.destroy({ where: { examId: exam.id } }));
    },

    async removeExamQuestions(exam) {
      return toRecord(await Question.destroy({ where: { examId: exam.id } }));
    },
  };
}

module.exports = { createRepository };
