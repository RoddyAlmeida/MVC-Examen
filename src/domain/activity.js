const ACTIVE_WINDOW_MS = 45000;

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

function examDeadline(exam, attempt, now = Date.now()) {
  const expiresAt = attempt ? new Date(attempt.startedAt).getTime() + exam.timeLimitMinutes * 60000 : now;
  return { expiresAt, remainingMs: Math.max(0, expiresAt - now), expired: now >= expiresAt };
}

module.exports = { activityView, examDeadline, ACTIVE_WINDOW_MS };