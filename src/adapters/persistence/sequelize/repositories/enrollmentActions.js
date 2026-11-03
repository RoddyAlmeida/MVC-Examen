const { Op } = require("sequelize");
const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, ExamAssignment, Course, CourseEnrollment } = models;
  return {
    update,
    destroy,
    async listStudentCourses(req) {
      return toRecord(await CourseEnrollment.findAll({
        where: { userId: req.session.userId, status: { [Op.ne]: "rejected" } },
        include: [{ model: Course, as: "course", include: [{ model: User, as: "professor", attributes: ["name", "email"] }] }],
        order: [["createdAt", "DESC"]],
      }));
    },

    async findPendingCourseInvitation(req) {
      return toRecord(await CourseEnrollment.findOne({ where: { id: req.params.id, userId: req.session.userId, status: "invited" } }));
    },

    async findPendingExamInvitation(req) {
      return toRecord(await ExamAssignment.findOne({
        where: { id: req.params.id, userId: req.session.userId, status: "invited" }, include: [{ model: Exam, as: "exam" }],
      }));
    },

    async findExamByCode(code) {
      return toRecord(await Exam.findOne({ where: { joinCode: code } }));
    },

    async listCourseMembers(req) {
      return toRecord(await CourseEnrollment.findAll({
        where: { courseId: req.course.id, status: { [Op.ne]: "rejected" } },
        include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]],
      }));
    },

    async findProfessorContact(req) {
      return toRecord(await User.findByPk(req.course.professorId, { attributes: ["id", "name", "email"] }));
    },

    async listVisibleMembers(req) {
      return toRecord(await CourseEnrollment.findAll({
        where: { courseId: req.course.id, status: "active" },
        include: [{ model: User, as: "student", where: { role: "estudiante" }, attributes: ["id", "name"] }],
        order: [[{ model: User, as: "student" }, "name", "ASC"]],
      }));
    },

    async findProfessorName(req) {
      return toRecord(await User.findByPk(req.course.professorId, { attributes: ["id", "name"] }));
    },

    async findCourseEnrollment(req) {
      return toRecord(await CourseEnrollment.findOne({ where: { id: req.params.enrollmentId, courseId: req.course.id } }));
    },

    async listCourseExamIds(req) {
      return toRecord(await Exam.findAll({ where: { courseId: req.course.id }, attributes: ["id"] }));
    },

    async removeCourseExamAssignments(enrollment, exams, transaction) {
      return toRecord(await ExamAssignment.destroy({ where: { userId: enrollment.userId, examId: { [Op.in]: exams.map(exam => exam.id) } }, transaction }));
    },

    async removeExamAssignment(req) {
      return toRecord(await ExamAssignment.destroy({ where: { examId: req.params.id, userId: req.body.userId } }));
    },
  };
}

module.exports = { createRepository };
