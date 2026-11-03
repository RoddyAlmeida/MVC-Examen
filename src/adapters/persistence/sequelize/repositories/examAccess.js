const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { User, Exam, Question, Result, ExamAssignment, Course, CourseEnrollment, ExamSecurityEvent, ExamAttempt, sequelize } = models;
  function notificationScope(userId) {
    return [{ model: Exam, as: "exam", required: true, include: [{ model: Course, as: "course", where: { professorId: userId }, required: true }] }];
  }
  return {
    update,
    destroy,
    updateSecurity(exam, values) {
      return update(exam, { ...values, securityRevision: sequelize.literal('"securityRevision" + 1') });
    },
    async listActiveMembers(req) {
      return toRecord(await CourseEnrollment.findAll({ where: { courseId: req.course.id, status: "active" }, include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }] }));
    },

    async listExamAssignments(req) {
      return toRecord(await ExamAssignment.findAll({ where: { examId: req.exam.id }, include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }] }));
    },

    async findExistingResult(req, exam) {
      return toRecord(await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } }));
    },

    async countQuestions(exam) {
      return toRecord(await Question.count({ where: { examId: exam.id } }));
    },

    async updatePresence(values, req, grant) {
      return toRecord(await ExamAttempt.update(values, {
        where: { userId: req.session.userId, examId: req.exam.id, token: grant.token, finishedAt: null },
      }));
    },

    async listActiveAttempts(req) {
      return toRecord(await ExamAttempt.findAll({
        where: { examId: req.exam.id, finishedAt: null },
        attributes: ["startedAt", "lastSeenAt", "connected"],
        include: [{
          model: User, as: "student", where: { role: "estudiante" }, attributes: ["id", "name", "email"],
          include: [{ model: CourseEnrollment, as: "enrollments", attributes: [], where: { courseId: req.course.id, status: "active" }, required: true },
          { model: ExamAssignment, as: "assignments", attributes: [], where: { examId: req.exam.id, status: "active" }, required: true }]
        }],
        order: [["startedAt", "ASC"]],
      }));
    },

    async recordSecurityEvent(req) {
      return toRecord(await ExamSecurityEvent.findCreateFind({
        where: { userId: req.session.userId, examId: req.exam.id, eventId: req.body.eventId }, defaults: { type: req.body.type },
      }));
    },

    async listNotifications(req) {
      return toRecord(await ExamSecurityEvent.findAll({ include: [...notificationScope(req.session.userId), { model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]], limit: 100 }));
    },

    async countUnreadNotifications(req) {
      return toRecord(await ExamSecurityEvent.count({ where: { readAt: null }, include: notificationScope(req.session.userId) }));
    },

    async findOwnedNotification(req) {
      return toRecord(await ExamSecurityEvent.findOne({ where: { id: req.params.id }, include: notificationScope(req.session.userId) }));
    },
  };
}

module.exports = { createRepository };
