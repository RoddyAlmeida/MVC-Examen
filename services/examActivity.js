const { ExamAttempt } = require("../models");

const ACTIVE_WINDOW_MS = 45000;

async function startAttempt(userId, examId, token) {
    const now = new Date();
    const [attempt, created] = await ExamAttempt.findCreateFind({
        where: { userId, examId }, defaults: { token, startedAt: now, lastSeenAt: now, connected: true },
    });
    if (!created) {
        await attempt.update({
            token, lastSeenAt: now, connected: true, finishedAt: null,
            ...(attempt.finishedAt ? { startedAt: now } : {}),
        });
    }
    return attempt;
}

function activityView(attempt, now = Date.now()) {
    const startedAt = new Date(attempt.startedAt);
    const lastSeenAt = new Date(attempt.lastSeenAt);
    return {
        student: { id: attempt.student.id, name: attempt.student.name || attempt.student.email },
        startedAt: startedAt.toISOString(),
        lastSeenAt: lastSeenAt.toISOString(),
        elapsedSeconds: Math.max(0, Math.floor((now - startedAt.getTime()) / 1000)),
        state: attempt.connected && now - lastSeenAt.getTime() <= ACTIVE_WINDOW_MS ? "responding" : "away",
    };
}

module.exports = { startAttempt, activityView, ACTIVE_WINDOW_MS };