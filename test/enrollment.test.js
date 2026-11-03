const test = require("node:test");
const assert = require("node:assert/strict");
const { Sequelize } = require("sequelize");

test("students can see members only with active enrollment and explicit teacher permission", async context => {
    const { CourseEnrollment } = require("../src/adapters/persistence/sequelize/models/index");
    const { requireVisibleCourseMembers } = require("../src/adapters/http/middleware/access");
    let enrollment = null;
    context.mock.method(CourseEnrollment, "findOne", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, courseId: "3", status: "active" });
        return enrollment;
    });
    const req = { session: { userId: 7 }, params: { id: "3" } };
    const res = { status(code) { assert.equal(code, 403); return this; }, render() {} };
    await requireVisibleCourseMembers(req, res, () => assert.fail("Non-member saw the roster"));
    enrollment = { course: { id: 3, membersVisible: false } };
    await requireVisibleCourseMembers(req, res, () => assert.fail("Hidden roster was disclosed"));
    enrollment.course.membersVisible = true;
    let allowed = false;
    await requireVisibleCourseMembers(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
    assert.equal(req.course.id, 3);
});

test("enrollments distinguish invitations from active access and cannot duplicate membership", async () => {
    const database = new Sequelize({ dialect: "sqlite", storage: ":memory:", dialectModule: require("sqlite3"), logging: false });
    try {
        const Enrollment = require("../src/adapters/persistence/sequelize/models/CourseEnrollment")(database);
        const Assignment = require("../src/adapters/persistence/sequelize/models/ExamAssignment")(database);
        await database.sync();
        const enrollment = await Enrollment.create({ userId: 7, courseId: 3 });
        assert.equal(enrollment.status, "invited");
        await assert.rejects(Enrollment.create({ userId: 7, courseId: 3 }), { name: "SequelizeUniqueConstraintError" });
        await enrollment.update({ status: "active" });
        assert.equal((await enrollment.reload()).status, "active");
        const assignment = await Assignment.create({ userId: 7, examId: 9, status: "invited" });
        assert.equal(assignment.status, "invited");
        await assert.rejects(assignment.update({ status: "invalid" }), { name: "SequelizeValidationError" });
    } finally {
        await database.close();
    }
});

test("exam questions and submissions require a current password verification grant", () => {
    const { requireExamAccess } = require("../src/adapters/http/middleware/access");
    const req = { method: "GET", exam: { id: 9, securityRevision: 2 }, session: {} };
    let location;
    const res = { redirect(path) { location = path; }, status(code) { assert.equal(code, 403); return this; }, render() {} };
    requireExamAccess(req, res, () => assert.fail("Password was bypassed"));
    assert.equal(location, "/student/exams/9/start");
    req.method = "POST";
    req.session.examAccess = { 9: { revision: 1, expiresAt: Date.now() + 60000 } };
    requireExamAccess(req, res, () => assert.fail("Old security configuration allowed"));
    req.session.examAccess[9].revision = 2;
    let allowed = false;
    requireExamAccess(req, res, () => { allowed = true; });
    assert.equal(allowed, true);
});

test("accepting or joining an exam requires active course membership", async context => {
    const { CourseEnrollment, ExamAssignment } = require("../src/adapters/persistence/sequelize/models/index");
    const { activateAssignment } = require("../src/bootstrap/system").enrollment;
    let membership = null;
    context.mock.method(CourseEnrollment, "findOne", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, courseId: 3, status: "active" });
        return membership;
    });
    const assign = context.mock.method(ExamAssignment, "findCreateFind", async ({ where, defaults }) => {
        assert.deepEqual(where, { userId: 7, examId: 9 });
        assert.equal(defaults.status, "active");
        return [{ status: "active" }, false];
    });
    await assert.rejects(activateAssignment(7, { id: 9, courseId: 3 }), /inscrito en el curso/);
    assert.equal(assign.mock.callCount(), 0);
    membership = { status: "active" };
    await activateAssignment(7, { id: 9, courseId: 3 });
    assert.equal(assign.mock.callCount(), 1);
});

test("pending invitations and missing membership cannot access an exam directly", async context => {
    const { Exam, ExamAssignment, CourseEnrollment } = require("../src/adapters/persistence/sequelize/models/index");
    const { requireAssignedExam } = require("../src/adapters/http/middleware/access");
    let assignment = null;
    context.mock.method(ExamAssignment, "findOne", async ({ where }) => {
        assert.equal(where.status, "active");
        return assignment;
    });
    context.mock.method(Exam, "findByPk", async () => ({ id: 9, courseId: 3 }));
    context.mock.method(CourseEnrollment, "findOne", async () => null);
    const res = { status(code) { assert.equal(code, 403); return this; }, render() {} };
    const req = { params: { id: "9" }, session: { userId: 7 } };
    await requireAssignedExam(req, res, () => assert.fail("Invitation bypassed acceptance"));
    assignment = { status: "active" };
    await requireAssignedExam(req, res, () => assert.fail("Missing membership bypassed"));
});

test("HTTP invitations, forced enrollment, codes, passwords and notifications stay scoped", async context => {
    const bcrypt = require("bcryptjs");
    const { randomUUID } = require("node:crypto");
    const { sequelize, User, Course, Exam, Question, CourseEnrollment, ExamAssignment, ExamSecurityEvent, ExamAttempt, Result } = require("../src/adapters/persistence/sequelize/models/index");
    context.mock.method(sequelize.connectionManager.lib, "Database", function (storage, mode, callback) {
        return new (require("sqlite3").Database)(storage, mode, callback);
    });
    context.after(() => sequelize.close());
    await require("../src/adapters/persistence/sequelize/schemaMigration").initializeDatabase();
    const password = await bcrypt.hash("test12345", 4);
    async function user(name, role) { return User.create({ name, email: `${name}@local.test`, role, password }); }
    const admin = await user("admin", "administrador");
    const professor = await user("professor", "profesor");
    const other = await user("other", "profesor");
    const student = await user("student", "estudiante");
    const second = await user("second", "estudiante");
    const course = await Course.create({ name: "Curso principal", professorId: professor.id });
    const foreignCourse = await Course.create({ name: "Curso ajeno", professorId: other.id });
    async function exam(title, owner = professor, selectedCourse = course) {
        const created = await Exam.create({ title, instructions: "Responder", creatorId: owner.id, courseId: selectedCourse.id });
        await Question.create({ examId: created.id, prompt: "Elegir A", optionA: "A", optionB: "B", optionC: "C", correctOption: "A" });
        return created;
    }
    const invitedExam = await exam("Examen invitado");
    const codeExam = await exam("Examen con codigo");
    const foreignExam = await exam("Examen ajeno", other, foreignCourse);
    const { app } = require("../src/bootstrap/server");
    const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    context.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function login(account) {
        const reply = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ email: account.email, password: "test12345" }), redirect: "manual" });
        const cookie = reply.headers.get("set-cookie").split(";")[0];
        const path = account.role === "administrador" ? "/admin/courses" : account.role === "profesor" ? "/professor/dashboard" : "/student/exams";
        const page = await fetch(`${base}${path}`, { headers: { cookie } });
        assert.equal(page.status, 200);
        const html = await page.text();
        const csrf = account.role === "administrador" ? html.match(/name="_csrf" value="([^"]+)"/)[1] : html.match(/name="csrf-token" content="([^"]+)"/)[1];
        return { cookie, csrf };
    }
    const adminSession = await login(admin);
    const professorSession = await login(professor);
    const otherSession = await login(other);
    const studentSession = await login(student);
    const secondSession = await login(second);
    async function post(path, body, session, csrf = true) {
        return fetch(`${base}${path}`, { method: "POST", body: new URLSearchParams({ ...body, ...(csrf ? { _csrf: session.csrf } : {}) }), headers: { cookie: session.cookie }, redirect: "manual" });
    }
    async function get(path, session) { return fetch(`${base}${path}`, { headers: { cookie: session.cookie }, redirect: "manual" }); }

    await context.test("course invitation acceptance is required and owned by the recipient", async () => {
        assert.equal((await post(`/professor/courses/${course.id}/invitations`, { email: student.email }, professorSession, false)).status, 403);
        await post(`/professor/courses/${course.id}/invitations`, { email: ` ${student.email.toUpperCase()} `, status: "active" }, professorSession);
        const enrollment = await CourseEnrollment.findOne({ where: { userId: student.id, courseId: course.id } });
        assert.equal(enrollment.status, "invited");
        await post(`/professor/exams/${invitedExam.id}/invitations`, { userId: student.id }, professorSession);
        assert.equal(await ExamAssignment.count(), 0);
        await post(`/student/courses/invitations/${enrollment.id}/respond`, { action: "accept" }, secondSession);
        assert.equal((await enrollment.reload()).status, "invited");
        await post(`/student/courses/invitations/${enrollment.id}/respond`, { action: "reject" }, studentSession);
        assert.equal((await enrollment.reload()).status, "rejected");
        await post(`/professor/courses/${course.id}/invitations`, { email: student.email }, professorSession);
        await post(`/student/courses/invitations/${enrollment.id}/respond`, { action: "accept" }, studentSession);
        assert.equal((await enrollment.reload()).status, "active");
    });

    await context.test("only admin can force enrollment without acceptance", async () => {
        assert.equal((await post("/admin/enrollments", { userId: second.id, courseId: course.id }, professorSession)).status, 403);
        await post("/admin/enrollments", { userId: second.id, courseId: course.id }, adminSession);
        assert.equal((await CourseEnrollment.findOne({ where: { userId: second.id, courseId: course.id } })).status, "active");
    });

    await context.test("course directory includes the teacher and active students only when permitted", async () => {
        assert.equal((await get(`/student/courses/${course.id}/members`, studentSession)).status, 403);
        assert.equal((await post(`/professor/courses/${course.id}/members/visibility`, { membersVisible: "on" }, otherSession)).status, 403);
        assert.equal((await post(`/professor/courses/${course.id}/members/visibility`, { membersVisible: "on" }, professorSession, false)).status, 403);
        const pending = await user("pending", "estudiante");
        await CourseEnrollment.create({ courseId: course.id, userId: pending.id, status: "invited" });
        await post(`/professor/courses/${course.id}/members/visibility`, { membersVisible: "on" }, professorSession);
        assert.equal((await course.reload()).membersVisible, true);
        const roster = await get(`/student/courses/${course.id}/members`, studentSession);
        assert.equal(roster.status, 200);
        const html = await roster.text();
        assert.match(html, /professor/);
        assert.match(html, /Profesor/);
        assert.match(html, /second/);
        assert.doesNotMatch(html, /pending/);
        assert.doesNotMatch(html, /second@local.test/);
        assert.equal((await get(`/student/courses/${foreignCourse.id}/members`, studentSession)).status, 403);
        const teacherRoster = await get(`/professor/courses/${course.id}/members`, professorSession);
        assert.match(await teacherRoster.text(), /Docente del curso/);
        await post(`/professor/courses/${course.id}/members/visibility`, {}, professorSession);
        assert.equal((await get(`/student/courses/${course.id}/members`, studentSession)).status, 403);
    });

    await context.test("exam invitations require acceptance and cannot be accepted by another student", async () => {
        await post(`/professor/exams/${invitedExam.id}/invitations`, { userId: student.id }, professorSession);
        const invitation = await ExamAssignment.findOne({ where: { examId: invitedExam.id, userId: student.id } });
        assert.equal(invitation.status, "invited");
        assert.equal((await get(`/student/exams/${invitedExam.id}/start`, studentSession)).status, 403);
        await post(`/student/exams/invitations/${invitation.id}/respond`, { action: "accept" }, secondSession);
        assert.equal((await invitation.reload()).status, "invited");
        await post(`/student/exams/invitations/${invitation.id}/respond`, { action: "accept" }, studentSession);
        assert.equal((await invitation.reload()).status, "active");
        assert.equal((await get(`/student/exams/${invitedExam.id}/start`, studentSession)).status, 200);
    });

    await context.test("codes can be renewed and require membership before granting access", async () => {
        assert.equal((await post(`/professor/exams/${foreignExam.id}/code`, { action: "generate" }, professorSession)).status, 403);
        await post(`/professor/exams/${foreignExam.id}/code`, { action: "generate" }, otherSession);
        await foreignExam.reload();
        await post("/student/exams/join", { code: foreignExam.joinCode }, studentSession);
        assert.equal(await ExamAssignment.count({ where: { examId: foreignExam.id } }), 0);
        await post(`/professor/exams/${codeExam.id}/code`, { action: "generate" }, professorSession);
        const oldCode = (await codeExam.reload()).joinCode;
        await post(`/professor/exams/${codeExam.id}/code`, { action: "generate" }, professorSession);
        await post("/student/exams/join", { code: oldCode }, studentSession);
        assert.equal(await ExamAssignment.count({ where: { examId: codeExam.id } }), 0);
        await post("/student/exams/join", { code: (await codeExam.reload()).joinCode.toLowerCase() }, studentSession);
        assert.equal((await ExamAssignment.findOne({ where: { userId: student.id, examId: codeExam.id } })).status, "active");
        await post(`/professor/exams/${codeExam.id}/code`, { action: "disable" }, professorSession);
        assert.equal((await codeExam.reload()).joinCode, null);
    });

    let securityToken;
    await context.test("password gates GET and POST and is stored only as a hash", async () => {
        await post(`/professor/exams/${codeExam.id}/security`, { securityMode: "monitored", password: "exam12345" }, professorSession);
        await codeExam.reload();
        assert.notEqual(codeExam.passwordHash, "exam12345");
        assert.equal(await bcrypt.compare("exam12345", codeExam.passwordHash), true);
        assert.equal((await get(`/student/exams/${codeExam.id}/take`, studentSession)).status, 302);
        assert.equal((await post(`/student/exams/${codeExam.id}/take`, {}, studentSession)).status, 403);
        const wrong = await post(`/student/exams/${codeExam.id}/begin`, { password: "incorrect" }, studentSession);
        assert.equal(wrong.status, 403);
        assert.match(await wrong.text(), /no es correcta/);
        assert.equal((await post(`/student/exams/${codeExam.id}/begin`, { password: "exam12345" }, studentSession)).status, 302);
        const page = await get(`/student/exams/${codeExam.id}/take`, studentSession);
        assert.equal(page.status, 200);
        const html = await page.text();
        securityToken = html.match(/data-security-token="([^"]+)"/)[1];
        assert.doesNotMatch(html, /exam12345/);
    });

    await context.test("live activity is authenticated, server-timed and scoped to the exam teacher", async () => {
        assert.equal((await get(`/professor/exams/${codeExam.id}/activity`, otherSession)).status, 403);
        assert.equal((await get(`/professor/exams/${codeExam.id}/activity`, studentSession)).status, 403);
        const body = { action: "heartbeat", token: securityToken, userId: second.id, startedAt: "2000-01-01", lastSeenAt: "2099-01-01" };
        assert.equal((await post(`/student/exams/${codeExam.id}/heartbeat`, body, studentSession, false)).status, 403);
        assert.equal((await post(`/student/exams/${codeExam.id}/heartbeat`, { ...body, token: "invalid" }, studentSession)).status, 400);
        const attempt = await ExamAttempt.findOne({ where: { userId: student.id, examId: codeExam.id } });
        await attempt.update({ startedAt: new Date(Date.now() - 125000) });
        const startedAt = attempt.startedAt.getTime();
        assert.equal((await post(`/student/exams/${codeExam.id}/heartbeat`, body, studentSession)).status, 204);
        const response = await get(`/professor/exams/${codeExam.id}/activity`, professorSession);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const data = await response.json();
        assert.equal(data.attempts.length, 1);
        assert.equal(data.attempts[0].student.id, student.id);
        assert.equal(data.attempts[0].state, "responding");
        assert.ok(data.attempts[0].elapsedSeconds >= 125 && data.attempts[0].elapsedSeconds < 130);
        assert.equal(data.attempts[0].token, undefined);
        assert.equal(data.attempts[0].student.email, undefined);
        await post(`/student/exams/${codeExam.id}/heartbeat`, { action: "leave", token: securityToken }, studentSession);
        assert.equal((await (await get(`/professor/exams/${codeExam.id}/activity`, professorSession)).json()).attempts[0].state, "away");
        await attempt.update({ connected: true, lastSeenAt: new Date(Date.now() - 46000) });
        assert.equal((await (await get(`/professor/exams/${codeExam.id}/activity`, professorSession)).json()).attempts[0].state, "away");
        const oldToken = securityToken;
        await post(`/student/exams/${codeExam.id}/begin`, { password: "exam12345" }, studentSession);
        securityToken = (await (await get(`/student/exams/${codeExam.id}/take`, studentSession)).text()).match(/data-security-token="([^"]+)"/)[1];
        assert.equal((await attempt.reload()).startedAt.getTime(), startedAt);
        assert.equal((await post(`/student/exams/${codeExam.id}/heartbeat`, { action: "heartbeat", token: oldToken }, studentSession)).status, 400);
    });

    await context.test("security events are deduplicated and visible only to the owning professor", async () => {
        const body = { type: "blur", eventId: randomUUID(), token: securityToken, userId: second.id };
        assert.equal((await post(`/student/exams/${codeExam.id}/security-events`, { ...body, token: "invalid" }, studentSession)).status, 400);
        assert.equal((await post(`/student/exams/${codeExam.id}/security-events`, body, studentSession)).status, 204);
        await post(`/student/exams/${codeExam.id}/security-events`, body, studentSession);
        assert.equal(await ExamSecurityEvent.count(), 1);
        const event = await ExamSecurityEvent.findOne();
        assert.equal(event.userId, student.id);
        const ownPage = await get("/professor/notifications", professorSession);
        assert.match(await ownPage.text(), /Examen con codigo/);
        const foreignPage = await get("/professor/notifications", otherSession);
        assert.doesNotMatch(await foreignPage.text(), /Examen con codigo/);
        assert.equal((await (await get("/professor/notifications/count", professorSession)).json()).unread, 1);
        await post(`/professor/notifications/${event.id}/read`, {}, otherSession);
        assert.equal((await event.reload()).readAt, null);
        await post(`/professor/notifications/${event.id}/read`, {}, professorSession);
        assert.notEqual((await event.reload()).readAt, null);
        assert.equal(await Result.count(), 0);
    });

    await context.test("changing security invalidates grants and rejected membership blocks an accepted invitation", async () => {
        await post(`/professor/exams/${codeExam.id}/security`, { securityMode: "locked" }, professorSession);
        assert.equal((await get(`/student/exams/${codeExam.id}/take`, studentSession)).status, 302);
        await post(`/professor/exams/${codeExam.id}/security`, { securityMode: "none", removePassword: "on" }, professorSession);
        assert.equal((await codeExam.reload()).passwordHash, null);
        await post(`/student/exams/${codeExam.id}/begin`, {}, studentSession);
        const question = await Question.findOne({ where: { examId: codeExam.id } });
        const submitted = await post(`/student/exams/${codeExam.id}/take`, { [`question_${question.id}`]: "0" }, studentSession);
        assert.equal(submitted.status, 200);
        const result = await Result.findOne({ where: { examId: codeExam.id, userId: student.id } });
        assert.equal(result.score, 1);
        assert.equal((await (await get(`/professor/exams/${codeExam.id}/activity`, professorSession)).json()).attempts.length, 0);
        assert.equal((await post(`/student/exams/${codeExam.id}/heartbeat`, { action: "heartbeat", token: securityToken }, studentSession)).status, 403);
        assert.equal((await post(`/student/exams/${codeExam.id}/security-events`, { type: "blur", token: securityToken, eventId: randomUUID() }, studentSession)).status, 403);
        await post(`/professor/exams/${invitedExam.id}/invitations`, { userId: second.id }, professorSession);
        const pending = await ExamAssignment.findOne({ where: { examId: invitedExam.id, userId: second.id } });
        await CourseEnrollment.update({ status: "rejected" }, { where: { courseId: course.id, userId: second.id } });
        await post(`/student/exams/invitations/${pending.id}/respond`, { action: "accept" }, secondSession);
        assert.equal((await pending.reload()).status, "invited");
        const enrollment = await CourseEnrollment.findOne({ where: { courseId: course.id, userId: student.id } });
        await post(`/professor/courses/${course.id}/members/${enrollment.id}/delete`, {}, professorSession);
        assert.equal((await get(`/student/exams/${codeExam.id}/start`, studentSession)).status, 403);
        assert.equal((await result.reload()).score, 1);
    });

    await context.test("timed exams preserve deadlines, autosave incomplete pages and ignore late answers", async () => {
        await CourseEnrollment.create({ courseId: course.id, userId: student.id, status: "active" });
        const timed = await exam("Examen cronometrado");
        for (let index = 0; index < 5; index += 1) {
            await Question.create({ examId: timed.id, prompt: "Elegir A", optionA: "A", optionB: "B", optionC: "C", correctOption: "A" });
        }
        await ExamAssignment.create({ examId: timed.id, userId: student.id, status: "active" });
        const edit = { title: timed.title, instructions: timed.instructions, timerEnabled: "on", timeLimitMinutes: "4" };
        assert.equal((await post(`/professor/exams/${timed.id}/edit`, edit, professorSession)).status, 400);
        assert.equal((await timed.reload()).timeLimitMinutes, null);
        assert.equal((await post(`/professor/exams/${timed.id}/edit`, { ...edit, timeLimitMinutes: "5" }, otherSession)).status, 403);
        assert.equal((await post(`/professor/exams/${timed.id}/edit`, { ...edit, timeLimitMinutes: "5" }, professorSession)).status, 302);
        const start = await get(`/student/exams/${timed.id}/start`, studentSession);
        assert.match(await start.text(), /5 min/);
        await post(`/student/exams/${timed.id}/begin`, {}, studentSession);
        const attempt = await ExamAttempt.findOne({ where: { examId: timed.id, userId: student.id } });
        const originalStart = attempt.startedAt.getTime();
        let page = await get(`/student/exams/${timed.id}/take`, studentSession);
        assert.match(await page.text(), /data-exam-timer/);
        await post(`/student/exams/${timed.id}/begin`, {}, studentSession);
        assert.equal((await attempt.reload()).startedAt.getTime(), originalStart);
        const questions = await Question.findAll({ where: { examId: timed.id }, order: [["id", "ASC"]] });
        const saved = await post(`/student/exams/${timed.id}/take`, { _saveAnswers: "on", [`question_${questions[0].id}`]: "0" }, studentSession);
        assert.equal(saved.status, 200);
        assert.ok((await saved.json()).remainingMs > 0);
        assert.equal(await Result.count({ where: { examId: timed.id } }), 0);
        page = await get(`/student/exams/${timed.id}/take`, studentSession);
        assert.match(await page.text(), /checked/);
        const cleared = await post(`/student/exams/${timed.id}/take`, { _saveAnswers: "on" }, studentSession);
        assert.equal(cleared.status, 200);
        page = await get(`/student/exams/${timed.id}/take`, studentSession);
        assert.doesNotMatch(await page.text(), /checked/);
        await post(`/student/exams/${timed.id}/take`, { _saveAnswers: "on", [`question_${questions[0].id}`]: "0" }, studentSession);
        await attempt.update({ startedAt: new Date(Date.now() - 301000) });
        const late = await post(`/student/exams/${timed.id}/take?page=2`, { [`question_${questions[5].id}`]: "0", timeLimitMinutes: "60", startedAt: new Date().toISOString() }, studentSession);
        assert.equal(late.status, 200);
        const result = await Result.findOne({ where: { examId: timed.id, userId: student.id } });
        assert.equal(result.score, 1);
        assert.equal(result.total, 6);
        assert.equal(JSON.parse(result.answers)[questions[5].id], undefined);
        assert.notEqual((await attempt.reload()).finishedAt, null);
        assert.equal((await get(`/student/exams/${timed.id}/take`, studentSession)).status, 302);

        const expired = await exam("Examen vencido al reingresar");
        await expired.update({ timeLimitMinutes: 5 });
        await ExamAssignment.create({ examId: expired.id, userId: student.id, status: "active" });
        await post(`/student/exams/${expired.id}/begin`, {}, studentSession);
        await ExamAttempt.update({ startedAt: new Date(Date.now() - 301000) }, { where: { examId: expired.id, userId: student.id } });
        assert.equal((await get(`/student/exams/${expired.id}/take`, studentSession)).status, 200);
        assert.equal((await Result.findOne({ where: { examId: expired.id, userId: student.id } })).score, 0);
    });

    await context.test("exam leaderboard is optional, ordered, private and checked on every request", async () => {
        const ranked = await exam("Examen con ranking");
        await CourseEnrollment.update({ status: "active" }, { where: { userId: second.id, courseId: course.id } });
        for (const account of [student, second]) await ExamAssignment.create({ examId: ranked.id, userId: account.id, status: "active" });
        const studentPath = `/student/exams/${ranked.id}/leaderboard`;
        const professorPath = `/professor/exams/${ranked.id}/leaderboard`;
        assert.equal((await get(studentPath, studentSession)).status, 403);
        assert.equal((await get(professorPath, professorSession)).status, 403);
        const settings = { title: ranked.title, instructions: ranked.instructions, leaderboardEnabled: "on" };
        assert.equal((await post(`/professor/exams/${ranked.id}/edit`, settings, otherSession)).status, 403);
        assert.equal((await post(`/professor/exams/${ranked.id}/edit`, settings, professorSession, false)).status, 403);
        assert.equal((await post(`/professor/exams/${ranked.id}/edit`, settings, professorSession)).status, 302);
        const empty = await get(studentPath, studentSession);
        assert.equal(empty.status, 200);
        assert.match(await empty.text(), /Sin entregas calificadas/);
        assert.match(await (await get("/student/exams", studentSession)).text(), new RegExp(`/student/exams/${ranked.id}/leaderboard`));
        assert.match(await (await get("/professor/dashboard", professorSession)).text(), new RegExp(`/professor/exams/${ranked.id}/leaderboard`));
        const question = await Question.findOne({ where: { examId: ranked.id } });
        for (const [account, session, seconds] of [[student, studentSession, 90], [second, secondSession, 60]]) {
            await post(`/student/exams/${ranked.id}/begin`, {}, session);
            await ExamAttempt.update({ startedAt: new Date(Date.now() - seconds * 1000) }, { where: { userId: account.id, examId: ranked.id } });
            const submitted = await post(`/student/exams/${ranked.id}/take`, { [`question_${question.id}`]: "0", elapsedSeconds: "1", score: "999" }, session);
            assert.equal(submitted.status, 200);
            assert.match(await submitted.text(), new RegExp(`/student/exams/${ranked.id}/leaderboard`));
        }
        const { getExamLeaderboard } = require("../src/bootstrap/system").leaderboard;
        let rows = await getExamLeaderboard(ranked);
        assert.deepEqual(rows.map(row => row.userId), [second.id, student.id]);
        assert.equal(rows[0].score, 1);
        assert.ok(rows[0].elapsedSeconds >= 60 && rows[0].elapsedSeconds < 65);
        const page = await get(studentPath, studentSession);
        assert.equal(page.status, 200);
        assert.equal(page.headers.get("cache-control"), "no-store");
        const html = await page.text();
        assert.match(html, /leaderboard-current/);
        assert.doesNotMatch(html, /student@local\.test|second@local\.test|_pendingManual|question_\d/);
        assert.equal((await get(professorPath, otherSession)).status, 403);
        assert.equal((await get(professorPath, studentSession)).status, 403);
        const outsider = await user("outsider", "estudiante");
        await CourseEnrollment.create({ courseId: course.id, userId: outsider.id, status: "active" });
        await ExamAssignment.create({ examId: ranked.id, userId: outsider.id, status: "invited" });
        await Result.create({ userId: outsider.id, examId: ranked.id, score: 1, total: 1, answers: "{}" });
        const outsiderSession = await login(outsider);
        assert.equal((await get(studentPath, outsiderSession)).status, 403);
        assert.equal((await getExamLeaderboard(ranked)).length, 2);
        const secondResult = await Result.findOne({ where: { examId: ranked.id, userId: second.id } });
        await secondResult.update({ answers: '{"_pendingManual":[1]}' });
        assert.deepEqual((await getExamLeaderboard(ranked)).map(row => row.userId), [student.id]);
        await secondResult.update({ answers: '{"_pendingManual":[]}', score: 0 });
        rows = await getExamLeaderboard(ranked);
        assert.deepEqual(rows.map(row => row.userId), [student.id, second.id]);
        await ExamAssignment.update({ status: "rejected" }, { where: { examId: ranked.id, userId: second.id } });
        assert.equal((await get(studentPath, secondSession)).status, 403);
        assert.equal((await getExamLeaderboard(ranked)).length, 1);
        await CourseEnrollment.update({ status: "rejected" }, { where: { courseId: course.id, userId: student.id } });
        assert.equal((await get(studentPath, studentSession)).status, 403);
        assert.equal((await getExamLeaderboard(ranked)).length, 0);
        await post(`/professor/exams/${ranked.id}/edit`, { title: ranked.title, instructions: ranked.instructions }, professorSession);
        assert.equal((await ranked.reload()).leaderboardEnabled, false);
        assert.equal((await get(professorPath, professorSession)).status, 403);
        assert.doesNotMatch(await (await get("/professor/dashboard", professorSession)).text(), new RegExp(`/professor/exams/${ranked.id}/leaderboard`));
    });
});