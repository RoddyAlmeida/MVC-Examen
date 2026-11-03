const { DataTypes } = require("sequelize");
const { sequelize } = require("../models");

async function initializeDatabase() {
    const query = sequelize.getQueryInterface();
    const tables = await query.showAllTables();
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
    }
    await sequelize.sync();
}

module.exports = { initializeDatabase };