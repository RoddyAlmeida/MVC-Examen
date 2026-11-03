const { DataTypes } = require("sequelize");
const { sequelize, Course } = require("../models");

async function initializeDatabase() {
    const query = sequelize.getQueryInterface();
    const tables = await query.showAllTables();
    await Course.sync();
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
    }
    await sequelize.sync();
}

module.exports = { initializeDatabase };