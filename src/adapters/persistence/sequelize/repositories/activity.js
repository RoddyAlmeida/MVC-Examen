const { toRecord, update, destroy } = require("./records");

function createRepository(models) {
  const { ExamAttempt } = models;
  return {
    update,
    destroy,
    async findOrCreateAttempt(now, token, userId, examId) {
      return toRecord(await ExamAttempt.findCreateFind({
        where: { userId, examId }, defaults: { token, startedAt: now, lastSeenAt: now, connected: true },
      }));
    },

    async findUnfinishedAttempt(exam, userId) {
      return toRecord(await ExamAttempt.findOne({ where: { userId, examId: exam.id, finishedAt: null } }));
    },
  };
}

module.exports = { createRepository };
