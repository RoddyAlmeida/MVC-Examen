const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { User, Exam, Question, QuestionContent, ExamAssignment, Result, sequelize, Course, CourseEnrollment } = require("../src/adapters/persistence/sequelize/models/index");
const { EnrollmentError } = require("../src/bootstrap/system").enrollment;
const controller = require("../src/adapters/http/controllers/adminController");
const { requireRole, requireAssignedExam, requireOwnedExam, requireCourse } = require("../src/adapters/http/middleware/access");
const professorController = require("../src/adapters/http/controllers/professorController");
const { calculateMetrics } = require("../src/domain/adminMetrics");
const { initializeDatabase, removeCourseProfessorUniqueness } = require("../src/adapters/persistence/sequelize/schemaMigration");
const { seedTemplate, demoCourses } = require("../src/adapters/cli/seed");
const { QUESTION_TYPES, normalizeQuestionInput } = require("../src/domain/questions");

function response() {
    return {
        locals: {},
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
        assert.deepEqual(where, { userId: 7, examId: "3", status: "active" });
        return null;
    });
    const res = response();
    await requireAssignedExam({ session: { userId: 7 }, params: { id: "3" } }, res, () => assert.fail("Unassigned access was allowed"));
    assert.equal(res.statusCode, 403);
});

test("exam ownership also rejects questions from another exam", async (context) => {
    context.mock.method(Exam, "findOne", async ({ where, include }) => {
        assert.deepEqual(where, { id: "3", creatorId: 7 });
        assert.equal(include[0].model, Course);
        assert.deepEqual(include[0].where, { professorId: 7 });
        assert.equal(include[0].required, true);
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
    context.mock.method(Exam, "findByPk", async () => ({ id: 3, courseId: 9 }));
    context.mock.method(CourseEnrollment, "findOne", async () => ({ status: "active" }));
    const lookup = context.mock.method(ExamAssignment, "findCreateFind", async ({ where, defaults }) => {
        assert.deepEqual(where, { userId: 7, examId: 3 });
        assert.equal(defaults.status, "invited");
        return [{ id: 1 }, false];
    });
    const req = { body: { userId: "7", examId: "3" }, session: {} };
    await assert.rejects(controller.assignExam(req, response()), EnrollmentError);
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
    context.mock.method(CourseEnrollment, "destroy", async () => 0);
    context.mock.method(Course, "update", async (values, options) => {
        assert.deepEqual(values, { professorId: null });
        assert.deepEqual(options.where, { professorId: 7 });
    });
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

test("schema migration adds missing course and authorship columns without forcing sync", async (context) => {
    const columns = {};
    const added = [];
    context.mock.method(Course, "sync", async (options) => assert.equal(options, undefined));
    context.mock.method(sequelize, "getQueryInterface", () => ({
        async showAllTables() { return ["exams"]; },
        async showIndex() { return []; },
        async describeTable(table) { return table === "courses" ? { membersVisible: {} } : columns; },
        async addColumn(table, column) { assert.equal(table, "exams"); added.push(column); columns[column] = {}; },
    }));
    context.mock.method(sequelize, "sync", async (options) => assert.equal(options, undefined));
    context.mock.method(ExamAssignment, "findAll", async () => []);
    await initializeDatabase();
    await initializeDatabase();
    assert.deepEqual(added, ["creatorId", "courseId", "passwordHash", "securityMode", "securityRevision", "joinCode", "timeLimitMinutes", "leaderboardEnabled"]);
});

test("each demo exam covers all types and repeated seeding does not duplicate questions", async (context) => {
    for (const course of demoCourses) {
        const definitions = course.questions.map(normalizeQuestionInput);
        assert.deepEqual(new Set(definitions.map(item => item.type)), QUESTION_TYPES);
        assert.equal(definitions.filter(item => item.type === "true_false").length, 2);
    }
    const questions = new Map();
    const contents = new Map();
    context.mock.method(Course, "findCreateFind", async ({ where }) => {
        assert.equal(where.professorId, 2);
        const index = demoCourses.findIndex(course => course.name === where.name);
        assert.ok(index >= 0);
        return [{ id: index + 9 }, false];
    });
    context.mock.method(Exam, "findCreateFind", async ({ where }) => {
        assert.equal(where.creatorId, 2);
        return [{ id: where.courseId - 6, courseId: where.courseId }, false];
    });
    context.mock.method(Question, "findCreateFind", async ({ where, defaults }) => {
        const key = `${where.examId}:${where.prompt}`;
        if (!questions.has(key)) questions.set(key, { id: questions.size + 1, ...where, ...defaults });
        return [questions.get(key), false];
    });
    context.mock.method(QuestionContent, "findCreateFind", async ({ where, defaults }) => {
        if (!contents.has(where.questionId)) contents.set(where.questionId, defaults);
        return [contents.get(where.questionId), false];
    });
    context.mock.method(ExamAssignment, "findCreateFind", async ({ where, defaults }) => {
        assert.equal(where.userId, where.examId + 4);
        assert.equal(defaults.status, "active");
        return [{ id: 1 }, false];
    });
    context.mock.method(CourseEnrollment, "findCreateFind", async () => [{ id: 1 }, false]);
    const users = { profesor: { id: 2 }, estudiantes: [{ id: 7 }, { id: 8 }, { id: 9 }] };
    await seedTemplate(users);
    await seedTemplate(users);
    assert.equal(questions.size, 21);
    assert.equal(contents.size, 21);
});

test("courses require a professor and allow several courses for the same professor", async (context) => {
    let role = "estudiante";
    context.mock.method(User, "findByPk", async () => ({ id: 7, role }));
    const create = context.mock.method(Course, "create", async (values) => {
        assert.deepEqual(values, { name: "Matematicas", professorId: 7 });
    });
    const req = { body: { name: " Matematicas ", professorId: "7" }, session: {} };
    await assert.rejects(controller.createCourse(req, response()), /solo puede asignarse/);
    role = "profesor";
    const res = response();
    await controller.createCourse(req, res);
    await controller.createCourse(req, res);
    assert.equal(create.mock.callCount(), 2);
    assert.equal(res.location, "/admin/courses");
    for (const body of [{ name: "", professorId: "7" }, { name: "x".repeat(201), professorId: "7" }, { name: "Curso" }]) {
        await assert.rejects(controller.createCourse({ body, session: {} }, response()), controller.AdminError);
    }
});

test("course migration permits multiple courses per professor and preserves referenced exams", async () => {
    const { Sequelize } = require("sequelize");
    const database = new Sequelize({ dialect: "sqlite", storage: ":memory:", dialectModule: require("sqlite3"), logging: false });
    try {
        const Courses = require("../src/adapters/persistence/sequelize/models/Course")(database);
        await database.query("PRAGMA foreign_keys = ON");
        await database.query("CREATE TABLE users (id INTEGER PRIMARY KEY)");
        await database.query("INSERT INTO users VALUES (7)");
        await database.query("CREATE TABLE courses (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(200) NOT NULL, professorId INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL, membersVisible BOOLEAN NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)");
        const first = await Courses.create({ name: "A", professorId: 7 });
        assert.equal(first.membersVisible, false);
        await first.update({ membersVisible: true });
        await database.query("CREATE TABLE exams (id INTEGER PRIMARY KEY, courseId INTEGER REFERENCES courses(id) ON DELETE RESTRICT)");
        await database.query("INSERT INTO exams VALUES (1, $courseId)", { bind: { courseId: first.id } });
        await removeCourseProfessorUniqueness(database);
        await removeCourseProfessorUniqueness(database);
        await Courses.create({ name: "B", professorId: 7 });
        assert.equal(await Courses.count({ where: { professorId: 7 } }), 2);
        assert.equal((await first.reload()).name, "A");
        assert.equal(first.membersVisible, true);
        const [exams] = await database.query("SELECT * FROM exams");
        assert.equal(exams[0].courseId, first.id);
        const [violations] = await database.query("PRAGMA foreign_key_check");
        assert.deepEqual(violations, []);
        await Courses.create({ name: "Sin docente A", professorId: null });
        await Courses.create({ name: "Sin docente B", professorId: null });
    } finally {
        await database.close();
    }
});

test("course reassignment transfers exam ownership atomically and preserves student assignments", async (context) => {
    const transaction = {};
    const course = {
        id: 3, async update(values, options) {
            assert.deepEqual(values, { name: "Curso", professorId: 8 });
            assert.equal(options.transaction, transaction);
        }
    };
    context.mock.method(Course, "findByPk", async () => course);
    context.mock.method(User, "findByPk", async () => ({ id: 8, role: "profesor" }));
    context.mock.method(Course, "findOne", async () => null);
    context.mock.method(sequelize, "transaction", async (callback) => callback(transaction));
    const exams = context.mock.method(Exam, "update", async (values, options) => {
        assert.deepEqual(values, { creatorId: 8 });
        assert.deepEqual(options.where, { courseId: 3 });
        assert.equal(options.transaction, transaction);
    });
    context.mock.method(ExamAssignment, "destroy", async () => assert.fail("Assignments changed"));
    context.mock.method(Result, "destroy", async () => assert.fail("Results changed"));
    await controller.updateCourse({ params: { id: "3" }, body: { name: "Curso", professorId: "8" }, session: {} }, response());
    assert.equal(exams.mock.callCount(), 1);
});

test("courses with exams cannot be deleted", async (context) => {
    let count = 1;
    let removed = false;
    context.mock.method(Course, "findByPk", async () => ({ id: 3, async destroy() { removed = true; } }));
    context.mock.method(Exam, "count", async ({ where }) => { assert.deepEqual(where, { courseId: 3 }); return count; });
    const req = { params: { id: "3" }, session: {} };
    await assert.rejects(controller.deleteCourse(req, response()), /tiene examenes/);
    assert.equal(removed, false);
    count = 0;
    await controller.deleteCourse(req, response());
    assert.equal(removed, true);
});

test("professors without a course cannot create or import exams", async (context) => {
    context.mock.method(Course, "findAll", async ({ where }) => {
        assert.deepEqual(where, { professorId: 7 });
        return [];
    });
    const res = response();
    await requireCourse({ session: { userId: 7 } }, res, () => assert.fail("Course-less access allowed"));
    assert.equal(res.statusCode, 403);
});

test("professor exam creation uses a selected own course and rejects foreign courses", async (context) => {
    context.mock.method(Course, "findAll", async () => [{ id: 3 }, { id: 4 }]);
    const create = context.mock.method(Exam, "create", async (values) => {
        assert.deepEqual(values, { title: "Examen", instructions: "Resolver", timeLimitMinutes: null, leaderboardEnabled: false, creatorId: 7, courseId: 3 });
    });
    const req = { method: "POST", session: { userId: 7 }, body: { title: " Examen ", instructions: " Resolver ", courseId: 99, creatorId: 99 } };
    const rejected = response();
    await requireCourse(req, rejected, () => assert.fail("Foreign course allowed"));
    assert.equal(rejected.statusCode, 403);
    delete req.body.courseId;
    await requireCourse(req, response(), () => assert.fail("Missing course allowed"));
    req.body.courseId = "3";
    await requireCourse(req, response(), () => {});
    const createdResponse = response();
    await professorController.createExam(req, createdResponse);
    assert.equal(createdResponse.location, "/professor/dashboard?courseId=3");
    assert.equal(create.mock.callCount(), 1);
});

test("professor dashboard filters its courses and rejects a foreign course", async (context) => {
    let courses = [{ id: 3, name: "Curso" }, { id: 4, name: "Segundo" }];
    context.mock.method(Course, "findAll", async () => courses);
    const exams = context.mock.method(Exam, "findAll", async ({ where }) => {
        assert.deepEqual(where, { courseId: 3, creatorId: 7 });
        return [];
    });
    const res = response();
    await professorController.dashboard({ session: { userId: 7 } }, res);
    assert.equal(res.data.course.id, 3);
    assert.equal(res.data.courses.length, 2);
    const rejected = response();
    await professorController.dashboard({ session: { userId: 7 }, query: { courseId: "99" } }, rejected);
    assert.equal(rejected.statusCode, 403);
    courses = [];
    await professorController.dashboard({ session: { userId: 7 } }, res);
    assert.equal(exams.mock.callCount(), 1);
    assert.deepEqual(res.data.exams, []);
});

test("admin exam creation requires a course and derives its professor", async (context) => {
    let course = null;
    context.mock.method(Course, "findByPk", async () => course);
    context.mock.method(User, "findByPk", async () => ({ id: 7, role: "profesor" }));
    const create = context.mock.method(Exam, "create", async (values) => {
        assert.deepEqual(values, { title: "Examen", instructions: "Resolver", courseId: 3, creatorId: 7 });
    });
    const req = { body: { title: "Examen", instructions: "Resolver", courseId: "3", creatorId: 99 }, session: {} };
    await assert.rejects(controller.createExam(req, response()), /curso con profesor/);
    course = { id: 3, professorId: null };
    await assert.rejects(controller.createExam(req, response()), /curso con profesor/);
    course.professorId = 7;
    await controller.createExam(req, response());
    assert.equal(create.mock.callCount(), 1);
});

test("admin routes require a role and CSRF token for mutations", async (context) => {
    const password = await bcrypt.hash("test12345", 4);
    const admin = { id: 1, name: "Admin", email: "admin@example.com", role: "administrador", password };
    context.mock.method(User, "findOne", async () => admin);
    context.mock.method(User, "findByPk", async () => admin);
    context.mock.method(controller, "listUsers", (req, res) => res.json({ csrf: res.locals.csrf }));
    const create = context.mock.method(User, "create", async () => ({ id: 7 }));
    const { app } = require("../src/bootstrap/server");
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

test("course HTTP workflow migrates legacy exams and preserves assignments on reassignment", async (context) => {
    context.mock.method(sequelize.connectionManager.lib, "Database", function (storage, mode, callback) {
        return new (require("sqlite3").Database)(storage, mode, callback);
    });
    context.after(() => sequelize.close());
    await User.sync();
    const password = await bcrypt.hash("test12345", 4);
    const admin = await User.create({ name: "Admin", email: "admin@local.test", role: "administrador", password });
    const professor = await User.create({ name: "Profesor", email: "professor@local.test", role: "profesor", password });
    const replacement = await User.create({ name: "Otro profesor", email: "other@local.test", role: "profesor", password });
    const student = await User.create({ name: "Estudiante", email: "student@local.test", role: "estudiante", password });
    await sequelize.query('CREATE TABLE exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title VARCHAR(255) NOT NULL, instructions TEXT NOT NULL, creatorId INTEGER, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)');
    await sequelize.query('INSERT INTO exams (title, instructions, creatorId, createdAt, updatedAt) VALUES ($title, $instructions, $creator, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', {
        bind: { title: "Anterior", instructions: "Conservar", creator: professor.id },
    });
    await sequelize.query('CREATE TABLE exam_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL REFERENCES users(id), examId INTEGER NOT NULL REFERENCES exams(id), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(userId, examId))');
    await sequelize.query('INSERT INTO exam_assignments (userId, examId, createdAt, updatedAt) VALUES ($student, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', { bind: { student: student.id } });
    await initializeDatabase();
    await initializeDatabase();
    const legacy = await Exam.findOne({ where: { title: "Anterior" } });
    assert.equal(legacy.courseId, null);
    assert.equal(legacy.creatorId, professor.id);
    const assignment = await ExamAssignment.findOne({ where: { examId: legacy.id, userId: student.id } });
    assert.equal(assignment.status, "active");
    const result = await Result.create({ examId: legacy.id, userId: student.id, score: 1, total: 1, answers: "{}" });
    const { app } = require("../src/bootstrap/server");
    const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    context.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function login(user) {
        const reply = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ email: user.email, password: "test12345" }), redirect: "manual" });
        assert.equal(reply.status, 302);
        return reply.headers.get("set-cookie").split(";")[0];
    }
    async function post(path, body, cookie) {
        if (path.startsWith("/professor")) {
            const page = await fetch(`${base}/professor/dashboard`, { headers: { cookie } });
            body = { ...body, _csrf: (await page.text()).match(/name="csrf-token" content="([^"]+)"/)[1] };
        }
        return fetch(`${base}${path}`, { method: "POST", body: new URLSearchParams(body), headers: { cookie }, redirect: "manual" });
    }
    const adminCookie = await login(admin);
    const professorCookie = await login(professor);
    const replacementCookie = await login(replacement);
    assert.equal((await fetch(`${base}/admin/courses`, { headers: { cookie: professorCookie } })).status, 403);
    assert.equal((await post("/professor/exams/create", { title: "Sin curso", instructions: "Resolver" }, professorCookie)).status, 403);
    assert.equal((await post("/professor/exams/import", {}, professorCookie)).status, 403);
    const coursesPage = await fetch(`${base}/admin/courses`, { headers: { cookie: adminCookie } });
    assert.equal(coursesPage.status, 200);
    const html = await coursesPage.text();
    const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.equal((await post("/admin/courses", { name: "Curso", professorId: professor.id }, adminCookie)).status, 403);
    assert.equal((await post("/admin/courses", { name: "Curso", professorId: professor.id, _csrf: csrf }, adminCookie)).status, 302);
    const course = await Course.findOne({ where: { professorId: professor.id } });
    await post("/admin/courses", { name: "Segundo", professorId: professor.id, _csrf: csrf }, adminCookie);
    await post("/admin/courses", { name: "Otro", professorId: replacement.id, _csrf: csrf }, adminCookie);
    assert.equal(await Course.count(), 3);
    const secondCourse = await Course.findOne({ where: { name: "Segundo" } });
    await post(`/admin/exams/${legacy.id}/update`, { title: legacy.title, instructions: legacy.instructions, courseId: course.id, _csrf: csrf }, adminCookie);
    assert.equal((await legacy.reload()).courseId, course.id);
    const invalid = await post("/professor/exams/create", { title: "", instructions: "Resolver", courseId: course.id }, professorCookie);
    assert.equal(invalid.status, 400);
    assert.match(await invalid.text(), /action="\/professor\/exams\/create"/);
    assert.equal((await post("/professor/exams/create", { title: "Nuevo", instructions: "Resolver", courseId: 999 }, professorCookie)).status, 403);
    assert.equal((await post("/professor/exams/create", { title: "Nuevo", instructions: "Resolver" }, professorCookie)).status, 403);
    assert.equal((await post("/professor/exams/create", { title: "Nuevo", instructions: "Resolver", courseId: course.id }, professorCookie)).status, 302);
    const created = await Exam.findOne({ where: { title: "Nuevo" } });
    assert.equal(created.courseId, course.id);
    assert.equal(created.creatorId, professor.id);
    assert.equal((await post("/professor/exams/create", { title: "Segundo examen", instructions: "Resolver", courseId: secondCourse.id }, professorCookie)).status, 302);
    const secondPage = await fetch(`${base}/professor/dashboard?courseId=${secondCourse.id}`, { headers: { cookie: professorCookie } });
    const secondHtml = await secondPage.text();
    assert.match(secondHtml, /Segundo examen/);
    assert.doesNotMatch(secondHtml, /<h2[^>]*>\s*Nuevo\s*<\/h2>/);
    const zip = new (require("yazl").ZipFile)();
    const chunks = [];
    const zipBuffer = new Promise(resolve => {
        zip.outputStream.on("data", chunk => chunks.push(chunk));
        zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    });
    zip.addBuffer(Buffer.from('<manifest><resources><resource identifier="item" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource></resources></manifest>'), "imsmanifest.xml");
    zip.addBuffer(Buffer.from('<qti-assessment-item identifier="item" title="Importado" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string"/><qti-item-body><p>Explica</p><qti-extended-text-interaction response-identifier="RESPONSE"/></qti-item-body></qti-assessment-item>'), "item.xml");
    zip.end();
    const form = new FormData();
    form.append("qtiPackage", new Blob([await zipBuffer]), "qti.zip");
    form.append("courseId", String(secondCourse.id));
    const importPage = await fetch(`${base}/professor/dashboard`, { headers: { cookie: professorCookie } });
    form.append("_csrf", (await importPage.text()).match(/name="csrf-token" content="([^"]+)"/)[1]);
    const imported = await fetch(`${base}/professor/exams/import`, { method: "POST", body: form, headers: { cookie: professorCookie }, redirect: "manual" });
    assert.equal(imported.status, 302);
    const importedId = Number(imported.headers.get("location").split("/")[3]);
    assert.equal((await Exam.findByPk(importedId)).courseId, secondCourse.id);
    assert.equal((await fetch(`${base}/professor/exams/${created.id}/edit`, { headers: { cookie: replacementCookie } })).status, 403);
    for (const path of ["/admin/dashboard", "/admin/exams", "/admin/users", "/professor/dashboard", `/professor/exams/${created.id}/edit`]) {
        assert.equal((await fetch(`${base}${path}`, { headers: { cookie: path.startsWith("/admin") ? adminCookie : professorCookie } })).status, 200, path);
    }
    await post(`/admin/courses/${course.id}/delete`, { _csrf: csrf }, adminCookie);
    assert.equal(await Course.count(), 3);
    await post(`/admin/courses/${course.id}/update`, { name: "Renombrado", professorId: replacement.id, _csrf: csrf }, adminCookie);
    assert.equal((await created.reload()).creatorId, replacement.id);
    const retained = await Exam.findOne({ where: { title: "Segundo examen" } });
    assert.equal(retained.creatorId, professor.id);
    assert.equal((await fetch(`${base}/professor/exams/${created.id}/edit`, { headers: { cookie: professorCookie } })).status, 403);
    assert.equal((await fetch(`${base}/professor/exams/${created.id}/edit`, { headers: { cookie: replacementCookie } })).status, 200);
    assert.equal((await assignment.reload()).examId, legacy.id);
    assert.equal((await result.reload()).score, 1);
    await post(`/admin/courses/${course.id}/update`, { name: "Renombrado", professorId: "", _csrf: csrf }, adminCookie);
    assert.equal((await created.reload()).creatorId, null);
    assert.equal((await fetch(`${base}/professor/exams/${created.id}/edit`, { headers: { cookie: replacementCookie } })).status, 403);
});