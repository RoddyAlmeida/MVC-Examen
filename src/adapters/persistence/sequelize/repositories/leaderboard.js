const { Op } = require("sequelize");
const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Result, ExamAssignment, CourseEnrollment, ExamAttempt } = models;
  return {
    update,
    destroy,
    async listEligibleResults(exam) {
      return toRecord(await Result.findAll({
        where: { examId: exam.id },
        attributes: ["userId", "score", "total", "answers"],
        include: [{
          model: User, as: "user", attributes: ["id", "name"], where: { role: "estudiante" }, required: true,
          include: [
            { model: CourseEnrollment, as: "enrollments", attributes: [], where: { courseId: exam.courseId, status: "active" }, required: true },
            { model: ExamAssignment, as: "assignments", attributes: [], where: { examId: exam.id, status: "active" }, required: true },
            { model: ExamAttempt, as: "examAttempts", attributes: ["startedAt", "finishedAt"], where: { examId: exam.id, finishedAt: { [Op.ne]: null } }, separate: true },
          ],
        }],
      }));
    },
  };
}

module.exports = { createRepository };
