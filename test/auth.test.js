const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { User } = require("../models");
const { login, register } = require("../controllers/authController");
const { seedUsers } = require("../scripts/seed");

function response() {
    return {
        redirect(path) { this.location = path; },
        render(view, data) { this.view = view; this.data = data; },
    };
}

for (const role of ["profesor", "estudiante"]) {
    test(`login normalizes email and starts the ${role} session`, async (context) => {
        const password = await bcrypt.hash("test123", 4);
        context.mock.method(User, "findOne", async ({ where }) => {
            assert.equal(where.email, `${role}@pucese.edu.ec`);
            return { id: 1, role, name: role, password };
        });
        const req = { body: { email: ` ${role.toUpperCase()}@pucese.edu.ec `, password: "test123" }, session: {} };
        const res = response();
        await login(req, res);
        assert.deepEqual(req.session, { userId: 1, role, userName: role });
        assert.equal(res.location, role === "profesor" ? "/professor/dashboard" : "/student/exams");
    });
}

test("login rejects incorrect passwords without creating a session", async (context) => {
    const password = await bcrypt.hash("test123", 4);
    context.mock.method(User, "findOne", async () => ({ id: 1, role: "profesor", password }));
    const req = { body: { email: "profesor@pucese.edu.ec", password: "wrong" }, session: {} };
    const res = response();
    await login(req, res);
    assert.equal(res.view, "login");
    assert.match(res.data.error, /incorrectos/);
    assert.deepEqual(req.session, {});
});

test("login rejects whitespace-only email before querying the database", async (context) => {
    const lookup = context.mock.method(User, "findOne", async () => null);
    const res = response();
    await login({ body: { email: "   ", password: "test123" }, session: {} }, res);
    assert.equal(lookup.mock.callCount(), 0);
    assert.match(res.data.error, /obligatorios/);
});

test("registration stores normalized email and a hashed student password", async (context) => {
    context.mock.method(User, "findOne", async ({ where }) => {
        assert.equal(where.email, "student@example.com");
        return null;
    });
    context.mock.method(User, "create", async (account) => {
        assert.equal(account.email, "student@example.com");
        assert.equal(account.role, "estudiante");
        assert.equal(await bcrypt.compare("test123", account.password), true);
    });
    const res = response();
    await register({ body: { email: " Student@Example.com ", password: "test123" } }, res);
    assert.equal(res.location, "/login?registered=1");
});

test("seed creates both roles with hashed passwords and preserves existing accounts", async (context) => {
    const accounts = new Map();
    const existingProfessor = { email: "profesor@pucese.edu.ec", password: "existing-hash", role: "profesor" };
    accounts.set(existingProfessor.email, existingProfessor);
    context.mock.method(User, "findCreateFind", async ({ where, defaults }) => {
        assert.equal(where.email, defaults.email);
        const plainPassword = defaults.role === "profesor" ? "profesor123" : "estudiante123";
        assert.notEqual(defaults.password, plainPassword);
        assert.equal(await bcrypt.compare(plainPassword, defaults.password), true);
        if (accounts.has(where.email)) return [accounts.get(where.email), false];
        accounts.set(where.email, defaults);
        return [defaults, true];
    });
    await seedUsers();
    await seedUsers();
    assert.equal(accounts.size, 2);
    assert.equal(accounts.get(existingProfessor.email), existingProfessor);
    assert.equal(accounts.get("estudiante@pucese.edu.ec").role, "estudiante");
});