function pendingReview(result) {
  try {
    const pending = JSON.parse(result.answers || "{}")._pendingManual;
    return Array.isArray(pending) ? pending.length : 0;
  } catch (_error) {
    return 0;
  }
}

function calculateMetrics({ users, exams, assignments, results }, now = new Date()) {
  assignments = assignments.filter(assignment => !assignment.status || assignment.status === "active");
  const completed = new Set(results.map((result) => `${result.userId}:${result.examId}`));
  const completedAssignments = assignments.filter((assignment) => completed.has(`${assignment.userId}:${assignment.examId}`)).length;
  const graded = results.filter((result) => pendingReview(result) === 0 && result.total > 0);
  const assignedStudents = new Set(assignments.map((assignment) => assignment.userId));
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return {
    users: users.length,
    students: users.filter((user) => user.role === "estudiante").length,
    professors: users.filter((user) => user.role === "profesor").length,
    administrators: users.filter((user) => user.role === "administrador").length,
    exams: exams.length,
    questions: exams.reduce((sum, exam) => sum + exam.questions.length, 0),
    unownedExams: exams.filter((exam) => !exam.creatorId).length,
    assignments: assignments.length,
    completedAssignments,
    pendingAssignments: assignments.length - completedAssignments,
    completionRate: assignments.length ? Math.round(completedAssignments * 100 / assignments.length) : 0,
    attempts: results.length,
    pendingAnswers: results.reduce((sum, result) => sum + pendingReview(result), 0),
    pendingResults: results.filter((result) => pendingReview(result) > 0).length,
    averageScore: graded.length ? Math.round(graded.reduce((sum, result) => sum + result.score * 100 / result.total, 0) / graded.length) : null,
    passRate: graded.length ? Math.round(graded.filter((result) => result.score / result.total >= 0.6).length * 100 / graded.length) : null,
    recentAttempts: results.filter((result) => new Date(result.createdAt).getTime() >= cutoff).length,
    unassignedStudents: users.filter((user) => user.role === "estudiante" && !assignedStudents.has(user.id)).length,
  };
}

module.exports = { calculateMetrics, pendingReview };