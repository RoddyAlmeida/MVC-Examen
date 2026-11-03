const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function databaseWithFailure(failure) {
    const connections = [];
    class Sequelize {
        constructor() {
            this.connectionManager = {
                connections: {},
                async getConnection() {
                    if (!this.connections[1]) {
                        const connection = {
                            closed: false,
                            get(sql, callback) {
                                assert.equal(sql, "SELECT 1");
                                callback(connections[0] === this ? failure : null);
                            },
                            close(callback) {
                                this.closed = true;
                                queueMicrotask(callback);
                            },
                        };
                        connections.push(connection);
                        this.connections[1] = connection;
                    }
                    return this.connections[1];
                },
            };
        }
    }
    class Statement { all() { } }
    const filePath = require.resolve("../config/database");
    const context = {
        module: { exports: {} },
        __dirname: path.dirname(filePath),
        process: { env: {} },
        require(name) {
            if (name === "path") return path;
            if (name === "dotenv") return { config() { } };
            if (name === "sequelize") return { Sequelize };
            if (name === "@libsql/sqlite3") return { Statement, Database: class { } };
            throw new Error(`Unexpected module: ${name}`);
        },
    };
    vm.runInNewContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
    return { manager: context.module.exports.connectionManager, connections };
}

for (const failure of [
    Object.assign(new Error("Stream is closed"), { name: "ClosedError" }),
    Object.assign(new Error("Expired stream"), { status: 404 }),
    new Error("Stream is closed", { cause: Object.assign(new Error("Expired stream"), { status: 404 }) }),
]) {
    test(`database replaces an expired connection: ${failure.message}`, async () => {
        const { manager, connections } = databaseWithFailure(failure);
        const connection = await manager.getConnection();
        assert.equal(connections.length, 2);
        assert.equal(connections[0].closed, true);
        assert.equal(connection, connections[1]);
        assert.equal(await manager.getConnection(), connection);
        assert.equal(connections.length, 2);
    });
}

test("database does not reconnect for authentication or SQL errors", async () => {
    for (const failure of [Object.assign(new Error("Unauthorized"), { status: 401 }), new Error("Invalid SQL")]) {
        const { manager, connections } = databaseWithFailure(failure);
        await assert.rejects(manager.getConnection(), (error) => error === failure);
        assert.equal(connections.length, 1);
        assert.equal(connections[0].closed, false);
    }
});

test("concurrent requests share the replacement connection", async () => {
    const { manager, connections } = databaseWithFailure(Object.assign(new Error("Closed"), { name: "ClosedError" }));
    const [first, second] = await Promise.all([manager.getConnection(), manager.getConnection()]);
    assert.equal(first, second);
    assert.equal(connections.length, 2);
});