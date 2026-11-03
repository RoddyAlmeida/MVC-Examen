const { assertPort, contracts } = require("../ports");
const { activityView, examDeadline, ACTIVE_WINDOW_MS } = require("../domain/activity");

function createExamActivity({ data }) {
  assertPort("activity", data, contracts.activity);

  async function startAttempt(userId, examId, token) {
    const now = new Date();
    const [attempt, created] = await data.findOrCreateAttempt(now, token, userId, examId);
    if (!created) {
      await data.update(attempt, {
        token, lastSeenAt: now, connected: true, finishedAt: null,
        ...(attempt.finishedAt ? { startedAt: now } : {}),
      });
    }
    return attempt;
  }

  async function examTiming(exam, userId, now = Date.now()) {
    if (!exam.timeLimitMinutes) return null;
    const attempt = await data.findUnfinishedAttempt(exam, userId);
    return examDeadline(exam, attempt, now);
  }

  return { startAttempt, activityView, examTiming, ACTIVE_WINDOW_MS };
}

module.exports = { createExamActivity };
