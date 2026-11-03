function leaderboardRows(results) {
  const rows = [];
  for (const result of results) {
    if (!result.user) continue;
    try {
      const answers = JSON.parse(result.answers || "{}");
      if (!answers || (answers._pendingManual && (!Array.isArray(answers._pendingManual) || answers._pendingManual.length))) continue;
    } catch (_error) {
      continue;
    }
    const attempt = result.user.examAttempts?.[0];
    const elapsed = attempt?.startedAt && attempt?.finishedAt
      ? new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime() : NaN;
    rows.push({
      userId: result.userId,
      name: result.user.name || `Estudiante ${result.userId}`,
      score: result.score,
      total: result.total,
      elapsedSeconds: Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 1000) : null,
    });
  }
  rows.sort((first, second) => second.score - first.score
    || (first.elapsedSeconds ?? Infinity) - (second.elapsedSeconds ?? Infinity)
    || first.userId - second.userId);
  return rows.map((row, index) => ({ position: index + 1, ...row }));
}

module.exports = { leaderboardRows };