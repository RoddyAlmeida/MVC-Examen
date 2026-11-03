const { Op } = require("sequelize");
const { Result, User, ExamAttempt, CourseEnrollment, ExamAssignment } = require("../models");

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

async function getExamLeaderboard(exam) {
    const results = await Result.findAll({
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
    });
    return leaderboardRows(results);
}

module.exports = { getExamLeaderboard, leaderboardRows };