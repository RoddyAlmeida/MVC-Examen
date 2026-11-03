const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, ExamAssignment, Course, CourseEnrollment } = models;
  return {
    update,
    destroy,
    async findActiveEnrollment(userId, courseId) {
      return toRecord(await CourseEnrollment.findOne({ where: { userId, courseId, status: "active" } }));
    },

    async findStudentByEmail(email) {
      return toRecord(await User.findOne({ where: { email: String(email || "").trim().toLowerCase(), role: "estudiante" } }));
    },

    async findStudentById(userId) {
      return toRecord(await User.findByPk(userId));
    },

    async findCourseById(courseId) {
      return toRecord(await Course.findByPk(courseId));
    },

    async findOrCreateEnrollment(student, courseId, status) {
      return toRecord(await CourseEnrollment.findCreateFind({ where: { userId: student.id, courseId: Number(courseId) }, defaults: { status } }));
    },

    async findExamById(examId) {
      return toRecord(await Exam.findByPk(examId));
    },

    async findOrCreateInvitation(student, exam) {
      return toRecord(await ExamAssignment.findCreateFind({ where: { userId: student.id, examId: exam.id }, defaults: { status: "invited" } }));
    },

    async findOrCreateActiveAssignment(userId, exam) {
      return toRecord(await ExamAssignment.findCreateFind({ where: { userId, examId: exam.id }, defaults: { status: "active" } }));
    },
  };
}

module.exports = { createRepository };
