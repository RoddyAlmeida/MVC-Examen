const { DataTypes } = require("sequelize");
const { sequelize, Course, Exam, ExamAssignment, CourseEnrollment } = require("./models/index");

async function removeCourseProfessorUniqueness(database = sequelize) {
  const query = database.getQueryInterface();
  const indexes = await query.showIndex("courses");
  if (!indexes.some(index => index.unique && index.fields.length === 1 && index.fields[0].attribute === "professorId")) return;
  await database.transaction(async (transaction) => {
    await database.query("PRAGMA defer_foreign_keys = ON", { transaction });
    await query.changeColumn("courses", "professorId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: false,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
    }, { transaction });
  });
}

async function initializeDatabase() {
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  await Course.sync();
  const courseColumns = await query.describeTable("courses");
  if (!courseColumns.membersVisible) await query.addColumn("courses", "membersVisible", Course.rawAttributes.membersVisible);
  await removeCourseProfessorUniqueness();
  if (tables.includes("exams")) {
    const columns = await query.describeTable("exams");
    if (!columns.creatorId) {
      await query.addColumn("exams", "creatorId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      });
    }
    if (!columns.courseId) {
      await query.addColumn("exams", "courseId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "courses", key: "id" },
        onDelete: "RESTRICT",
      });
    }
    for (const field of ["passwordHash", "securityMode", "securityRevision", "joinCode", "timeLimitMinutes", "leaderboardEnabled"]) {
      if (!columns[field]) await query.addColumn("exams", field, Exam.rawAttributes[field]);
    }
  }
  if (tables.includes("exam_assignments")) {
    const columns = await query.describeTable("exam_assignments");
    if (!columns.status) await query.addColumn("exam_assignments", "status", ExamAssignment.rawAttributes.status);
  }
  await sequelize.sync();
  const assignments = await ExamAssignment.findAll({ where: { status: "active" }, include: [{ model: Exam, as: "exam", attributes: ["courseId"] }] });
  for (const assignment of assignments) {
    if (assignment.exam?.courseId) await CourseEnrollment.findCreateFind({
      where: { userId: assignment.userId, courseId: assignment.exam.courseId }, defaults: { status: "active" },
    });
  }
}

module.exports = { initializeDatabase, removeCourseProfessorUniqueness };