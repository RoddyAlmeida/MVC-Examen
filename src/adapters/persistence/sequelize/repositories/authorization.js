const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, Question, ExamAssignment, Course, CourseEnrollment } = models;
  return {
    update,
    destroy,
    async findCurrentUser(req) {
      return toRecord(await User.findByPk(req.session.userId, { attributes: ["id", "role", "name", "email"] }));
    },

    async findActiveAssignment(req) {
      return toRecord(await ExamAssignment.findOne({ where: { userId: req.session.userId, examId: req.params.id, status: "active" } }));
    },

    async findAssignedExam(req) {
      return toRecord(await Exam.findByPk(req.params.id));
    },

    async findActiveExamEnrollment(req, exam) {
      return toRecord(await CourseEnrollment.findOne({ where: { userId: req.session.userId, courseId: exam.courseId, status: "active" } }));
    },

    async findOwnedCourse(req) {
      return toRecord(await Course.findOne({ where: { id: req.params.id, professorId: req.session.userId } }));
    },

    async findVisibleCourseEnrollment(req) {
      return toRecord(await CourseEnrollment.findOne({
        where: { userId: req.session.userId, courseId: req.params.id, status: "active" },
        include: [{ model: Course, as: "course", required: true }],
      }));
    },

    async findOwnedExam(req, parameter) {
      return toRecord(await Exam.findOne({
        where: { id: req.params[parameter], creatorId: req.session.userId },
        include: [{ model: Course, as: "course", where: { professorId: req.session.userId }, required: true }],
      }));
    },

    async findOwnedQuestion(req, exam) {
      return toRecord(await Question.findOne({ where: { id: req.params.qid, examId: exam.id } }));
    },

    async listOwnedCourses(req) {
      return toRecord(await Course.findAll({ where: { professorId: req.session.userId }, order: [["name", "ASC"]] }));
    },

    async findTeachingEnrollment(req) {
      return toRecord(await CourseEnrollment.findOne({
        where: { userId: req.params.id, status: "active" },
        include: [{ model: Course, as: "course", where: { professorId: req.session.userId }, required: true }],
      }));
    },
  };
}

module.exports = { createRepository };
