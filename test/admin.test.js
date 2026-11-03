const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { User, Exam, Question, QuestionContent, ExamAssignment, Result, sequelize } = require("../models");
const controller = require("../controllers/adminController");
const { requireRole, requireAssignedExam, requireOwnedExam } = require("../middleware/access");
const { calculateMetrics } = require("../services/adminMetrics");
const { initializeDatabase } = require("../services/schemaMigration");
const { seedTemplate, templateInputs } = require("../scripts/seed");
const { QUESTION_TYPES, normalizeQuestionInput } = require("../services/questionService");

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        render(view, data) { this.view = view; this.data = data; },
        redirect(path) { this.location = path; },
    };
}

test("admin validates roles, normalized emails and passwords", () => {
    for (const role of Object.keys(controller.roles)) {
        assert.equal(controller.validateAccount({ name: "User", email: " USER@EXAMPLE.COM ", role, password: "test12345" }).email, "user@example.com");
    }
    for (const body of [
        { role: "root", email: "user@example.com", password: "test12345" },
        { role: "estudiante", email: "invalid", password: "test12345" },
        { role: "estudiante", email: "user@example.com", password: "short" },
    ]) assert.throws(() => controller.validateAccount({ name: "User", ...body }), controller.AdminError);
});

test("admin cannot delete or demote itself or the last administrator", async (context) => {
    context.mock.method(User, "count", async () => 1);
    const admin = { id: 1, role: "administrador" };
    await assert.rejects(controller.protectAdministrator(admin, { userId: 1 }, null), controller.AdminError);
    await assert.rejects(controller.protectAdministrator(admin, { userId: 2 }, "estudiante"), controller.AdminError);
    await controller.protectAdministrator(admin, { userId: 1 }, "administrador");
});

test("role checks refresh existing sessions and revoke old permissions", async (context) => {
    context.mock.method(User, "findByPk", async () => ({ id: 1, role: "estudiante", name: "User" }));
    const req = { session: { userId: 1, role: "administrador" } };
    const res = response();
    await requireRole("administrador")(req, res, () => assert.fail("Stale admin access was allowed"));
    assert.equal(res.statusCode, 403);
    assert.equal(req.session.role, "estudiante");
});

test("assignment guard rejects unassigned exams and checks student identity", async (context) => {
    context.mock.method(ExamAssignment, "findOne", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, examId: "3" });
        return null;
    });
    const res = response();
    await requireAssignedExam({ session: { userId: 7 }, params: { id: "3" } }, res, () => assert.fail("Unassigned access was allowed"));
    assert.equal(res.statusCode, 403);
});

test("exam ownership also rejects questions from another exam", async (context) => {
    context.mock.method(Exam, "findOne", async ({ where }) => {
        assert.deepEqual(where, { id: "3", creatorId: 7 });
        return { id: 3 };
    });
    context.mock.method(Question, "findOne", async () => null);
    const res = response();
    await requireOwnedExam()({ session: { userId: 7 }, params: { id: "3", qid: "8" } }, res, () => assert.fail("Foreign question was allowed"));
    assert.equal(res.statusCode, 403);
});

test("only students receive assignments and duplicates use the unique lookup", async (context) => {
    let role = "profesor";
    context.mock.method(User, "findByPk", async () => ({ id: 7, role }));
    context.mock.method(Exam, "findByPk", async () => ({ id: 3 }));
    const lookup = context.mock.method(ExamAssignment, "findCreateFind", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, examId: 3 });
        return [{ id: 1 }, false];
    });
    const req = { body: { userId: "7", examId: "3" }, session: {} };
    await assert.rejects(controller.assignExam(req, response()), controller.AdminError);
    assert.equal(lookup.mock.callCount(), 0);
    role = "estudiante";
    const res = response();
    await controller.assignExam(req, res);
    assert.equal(lookup.mock.callCount(), 1);
    assert.equal(res.location, "/admin/users/7");
});

test("removing an assignment preserves all results", async (context) => {
    let removed = false;
    context.mock.method(ExamAssignment, "findByPk", async () => ({ userId: 7, async destroy() { removed = true; } }));
    const removeResults = context.mock.method(Result, "destroy", async () => assert.fail("Results were removed"));
    await controller.unassignExam({ params: { id: 1 }, session: {} }, response());
    assert.equal(removed, true);
    assert.equal(removeResults.mock.callCount(), 0);
});

test("role changes clear incompatible assignments and authorship without deleting exams", async (context) => {
    const user = { id: 7, role: "profesor", async update(account) { Object.assign(this, account); } };
    context.mock.method(User, "findByPk", async () => user);
    const assignments = context.mock.method(ExamAssignment, "destroy", async () => 0);
    const exams = context.mock.method(Exam, "update", async (values, options) => {
        assert.deepEqual(values, { creatorId: null });
        assert.deepEqual(options.where, { creatorId: 7 });
    });
    const req = { params: { id: 7 }, session: { userId: 1 }, body: { name: "User", email: "user@example.com", role: "estudiante" } };
    await controller.updateUser(req, response());
    assert.equal(exams.mock.callCount(), 1);
    assert.equal(assignments.mock.callCount(), 0);
    req.body.role = "profesor";
    await controller.updateUser(req, response());
    assert.equal(assignments.mock.callCount(), 1);
    assert.equal(exams.mock.callCount(), 1);
});

test("metrics count completed assignments separately and exclude pending manual grades", () => {
    const data = {
        users: [{ id: 1, role: "administrador" }, { id: 2, role: "profesor" }, { id: 3, role: "estudiante" }, { id: 4, role: "estudiante" }],
        exams: [{ creatorId: 2, questions: [{}, {}] }, { creatorId: null, questions: [] }],
        assignments: [{ userId: 3, examId: 1 }, { userId: 3, examId: 2 }],
        results: [
            { userId: 3, examId: 1, score: 3, total: 5, createdAt: "2026-11-01", answers: "{}" },
            { userId: 3, examId: 9, score: 4, total: 5, createdAt: "2026-11-01", answers: '{"_pendingManual":[7]}' },
        ],
    };
    const metrics = calculateMetrics(data, new Date("2026-11-02"));
    assert.equal(metrics.completedAssignments, 1);
    assert.equal(metrics.completionRate, 50);
    assert.equal(metrics.averageScore, 60);
    assert.equal(metrics.passRate, 100);
    assert.equal(metrics.pendingAnswers, 1);
    assert.equal(metrics.unassignedStudents, 1);
    assert.equal(metrics.unownedExams, 1);
    assert.equal(metrics.questions, 2);
    assert.equal(metrics.recentAttempts, 2);
    assert.equal(calculateMetrics({ users: [], exams: [], assignments: [], results: [] }).averageScore, null);
});

test("schema migration adds only missing authorship and never forces sync", async (context) => {
    let added = 0;
    let hasColumn = false;
    context.mock.method(sequelize, "getQueryInterface", () => ({
        async showAllTables() { return ["exams"]; },
        async describeTable() { return hasColumn ? { creatorId: {} } : {}; },
        async addColumn(table, column) { assert.equal(table, "exams"); assert.equal(column, "creatorId"); added += 1; hasColumn = true; },
    }));
    context.mock.method(sequelize, "sync", async (options) => assert.equal(options, undefined));
    await initializeDatabase();
    await initializeDatabase();
    assert.equal(added, 1);
});

test("template covers all types and repeated seeding does not duplicate questions", async (context) => {
    const definitions = templateInputs.map(normalizeQuestionInput);
    assert.deepEqual(new Set(definitions.map(item => item.type)), QUESTION_TYPES);
    assert.equal(definitions.filter(item => item.type === "true_false").length, 2);
    const questions = new Map();
    const contents = new Map();
    context.mock.method(Exam, "findCreateFind", async () => [{ id: 3 }, false]);
    context.mock.method(Question, "findCreateFind", async ({ where, defaults }) => {
        if (!questions.has(where.prompt)) questions.set(where.prompt, { id: questions.size + 1, ...where, ...defaults });
        return [questions.get(where.prompt), false];
    });
    context.mock.method(QuestionContent, "findCreateFind", async ({ where, defaults }) => {
        if (!contents.has(where.questionId)) contents.set(where.questionId, defaults);
        return [contents.get(where.questionId), false];
    });
    context.mock.method(ExamAssignment, "findCreateFind", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, examId: 3 });
        return [{ id: 1 }, false];
    });
    await seedTemplate({ profesor: { id: 2 }, estudiante: { id: 7 } });
    await seedTemplate({ profesor: { id: 2 }, estudiante: { id: 7 } });
    assert.equal(questions.size, 7);
    assert.equal(contents.size, 7);
});

test("admin routes require a role and CSRF token for mutations", async (context) => {
    const password = await bcrypt.hash("test12345", 4);
    const admin = { id: 1, name: "Admin", email: "admin@example.com", role: "administrador", password };
    context.mock.method(User, "findOne", async () => admin);
    context.mock.method(User, "findByPk", async () => admin);
    context.mock.method(controller, "listUsers", (req, res) => res.json({ csrf: res.locals.csrf }));
    const create = context.mock.method(User, "create", async () => ({ id: 7 }));
    const { app } = require("../app");
    const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    context.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const anonymous = await fetch(`${base}/admin/users`, { redirect: "manual" });
    assert.equal(anonymous.status, 302);
    const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ email: admin.email, password: "test12345" }), redirect: "manual" });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const page = await fetch(`${base}/admin/users`, { headers: { cookie } });
    const { csrf } = await page.json();
    const account = { name: "User", email: "user@example.com", role: "estudiante", password: "test12345" };
    const rejected = await fetch(`${base}/admin/users`, { method: "POST", headers: { cookie }, body: new URLSearchParams(account), redirect: "manual" });
    assert.equal(rejected.status, 403);
    assert.equal(create.mock.callCount(), 0);
    const created = await fetch(`${base}/admin/users`, { method: "POST", headers: { cookie }, body: new URLSearchParams({ ...account, _csrf: csrf }), redirect: "manual" });
    assert.equal(created.status, 302);
    assert.equal(create.mock.callCount(), 1);
    admin.role = "estudiante";
    const revoked = await fetch(`${base}/admin/users`, { headers: { cookie }, redirect: "manual" });
    assert.equal(revoked.status, 403);
});