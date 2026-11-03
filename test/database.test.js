const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function databaseWithFailure(failure) {
    const connections = [];
    class Sequelize {
        constructor(options) {
            this.options = options;
            this.connectionManager = {
                sequelize: this,
                connections: {},
                async getConnection(options = {}) {
                    const key = this.sequelize.options.storage === ":memory:" ? 1 : options.uuid || "default";
                    if (!this.connections[key]) {
                        const connection = {
                            closed: false,
                            get(sql, callback) {
                                assert.equal(sql, "SELECT 1");
                                callback(typeof failure === "function" ? failure(connections.indexOf(this)) : connections[0] === this ? failure : null);
                            },
                            close(callback) {
                                this.closed = true;
                                if (callback) queueMicrotask(callback);
                            },
                        };
                        connections.push(connection);
                        this.connections[key] = connection;
                    }
                    return this.connections[key];
                },
                releaseConnection(connection, force) {
                    if (connection.filename === ":memory:" && force !== true) return;
                    if (connection.uuid) { connection.close(); delete this.connections[connection.uuid]; }
                },
            };
        }
    }
    class Statement { all() { } }
    const filePath = require.resolve("../src/adapters/persistence/sequelize/database");
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

test("ordinary queries cannot release the connection of an active remote transaction", async () => {
    const { manager } = databaseWithFailure(null);
    const transaction = await manager.getConnection({ uuid: "transaction-one" });
    transaction.uuid = "transaction-one";
    const ordinary = await manager.getConnection();
    manager.releaseConnection(ordinary);
    assert.notEqual(ordinary, transaction);
    assert.equal(transaction.closed, false);
});

test("independent remote transactions receive independent connections", async () => {
    const { manager } = databaseWithFailure(null);
    const first = await manager.getConnection({ uuid: "transaction-one" });
    const second = await manager.getConnection({ uuid: "transaction-two" });
    assert.notEqual(first, second);
    manager.releaseConnection(Object.assign(first, { uuid: "transaction-one" }));
    assert.equal(second.closed, false);
});

test("simultaneous reconnections do not merge independent transaction connections", async () => {
    const closed = Object.assign(new Error("Closed"), { name: "ClosedError" });
    const { manager, connections } = databaseWithFailure(index => index < 2 ? closed : null);
    const [first, second] = await Promise.all([
        manager.getConnection({ uuid: "transaction-one" }),
        manager.getConnection({ uuid: "transaction-two" }),
    ]);
    assert.notEqual(first, second);
    assert.equal(connections.length, 4);
    assert.equal(connections[0].closed, true);
    assert.equal(connections[1].closed, true);
});