const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ExamAttempt } = require("../src/adapters/persistence/sequelize/models/index");
const { startAttempt, activityView, examTiming } = require("../src/bootstrap/system").activity;

test("professor timer settings require at least five whole minutes and allow disabling", async context => {
    const { Exam } = require("../src/adapters/persistence/sequelize/models/index");
    const { createExam, editExam } = require("../src/adapters/http/controllers/professorController");
    const saved = [];
    context.mock.method(Exam, "create", async values => saved.push(values));
    context.mock.method(Exam, "findByPk", async () => ({ id: 9, async update(values) { saved.push(values); } }));
    const req = { body: { title: "Exam", instructions: "Answer", timerEnabled: "on" }, session: { userId: 7 }, course: { id: 2 }, params: { id: 9 } };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, render(_view, data) { this.data = data; }, redirect() {} };
    for (const timeLimitMinutes of ["4", "", "5.5", "invalid", "2147483648"]) {
        req.body.timeLimitMinutes = timeLimitMinutes;
        await createExam(req, res);
        await editExam(req, res);
        assert.equal(res.statusCode, 400);
        assert.match(res.data.errors[0].msg, /5 minutos/);
    }
    assert.equal(saved.length, 0);
    req.body.timeLimitMinutes = "5";
    await createExam(req, res);
    assert.equal(saved.at(-1).timeLimitMinutes, 5);
    assert.equal(saved.at(-1).leaderboardEnabled, false);
    req.body.leaderboardEnabled = "on";
    req.body.timeLimitMinutes = "30";
    await editExam(req, res);
    assert.equal(saved.at(-1).timeLimitMinutes, 30);
    assert.equal(saved.at(-1).leaderboardEnabled, true);
    delete req.body.leaderboardEnabled;
    delete req.body.timerEnabled;
    await editExam(req, res);
    assert.equal(saved.at(-1).timeLimitMinutes, null);
    assert.equal(saved.at(-1).leaderboardEnabled, false);
    await createExam(req, res);
    assert.equal(saved.at(-1).timeLimitMinutes, null);
    await assert.rejects(Exam.build({ title: "Exam", instructions: "Answer", timeLimitMinutes: 4 }).validate());
    await Exam.build({ title: "Exam", instructions: "Answer", timeLimitMinutes: null }).validate();
});

test("re-entering an unfinished exam preserves its original start time", async context => {
    const startedAt = new Date("2026-11-02T10:00:00Z");
    const attempt = { startedAt, finishedAt: null, async update(values) { Object.assign(this, values); } };
    context.mock.method(ExamAttempt, "findCreateFind", async ({ where }) => {
        assert.deepEqual(where, { userId: 7, examId: 9 });
        return [attempt, false];
    });
    await startAttempt(7, 9, "new-token");
    assert.equal(attempt.startedAt, startedAt);
    assert.equal(attempt.token, "new-token");
    assert.equal(attempt.connected, true);
    attempt.finishedAt = new Date();
    await startAttempt(7, 9, "another-token");
    assert.notEqual(attempt.startedAt, startedAt);
    assert.equal(attempt.finishedAt, null);
});

test("leaderboard ranks final scores then elapsed time and never exposes answer or email data", () => {
    const { leaderboardRows } = require("../src/bootstrap/system").leaderboard;
    function result(userId, score, seconds, answers = "{}") {
        return { userId, score, total: 5, answers, user: { name: `Student ${userId}`, email: "private@example.com", examAttempts: seconds === null ? [] : [{ startedAt: new Date(0), finishedAt: new Date(seconds * 1000), token: "secret" }] } };
    }
    const rows = leaderboardRows([result(1, 3, 90), result(2, 3, 60), result(3, 5, 180), result(4, 5, 20, '{"_pendingManual":[1]}'), result(5, 3, null), result(6, 5, 10, "invalid")]);
    assert.deepEqual(rows.map(row => row.userId), [3, 2, 1, 5]);
    assert.deepEqual(rows.map(row => row.position), [1, 2, 3, 4]);
    assert.equal(rows[3].elapsedSeconds, null);
    assert.equal(rows[0].elapsedSeconds, 180);
    assert.deepEqual(Object.keys(rows[0]).sort(), ["elapsedSeconds", "name", "position", "score", "total", "userId"]);
    assert.equal(leaderboardRows([result(4, 5, 20, '{"_pendingManual":[]}')]).length, 1);
});

test("exam deadline is server-owned, expires at the limit and stays optional", async context => {
    const now = Date.parse("2026-11-02T10:04:00Z");
    const lookup = context.mock.method(ExamAttempt, "findOne", async () => ({ startedAt: new Date(now - 240000) }));
    assert.equal(await examTiming({ id: 9, timeLimitMinutes: null }, 7, now), null);
    assert.equal(lookup.mock.callCount(), 0);
    const timing = await examTiming({ id: 9, timeLimitMinutes: 5 }, 7, now);
    assert.equal(timing.remainingMs, 60000);
    assert.equal(timing.expired, false);
    assert.equal((await examTiming({ id: 9, timeLimitMinutes: 5 }, 7, now + 60000)).expired, true);
    assert.equal((await examTiming({ id: 9, timeLimitMinutes: 5 }, 7, now + 120000)).remainingMs, 0);
    context.mock.method(ExamAttempt, "findOne", async () => null);
    assert.equal((await examTiming({ id: 9, timeLimitMinutes: 5 }, 7, now)).expired, true);
});

test("countdown automatically submits incomplete pages after system suspension only once", () => {
    let elapsed = 0;
    let wall = 0;
    let submissions = 0;
    const listeners = new Map();
    const clock = {};
    const status = {};
    const timer = { dataset: { remainingMs: "300000" }, classList: { toggle() {} }, querySelector(selector) { return selector === "[data-timer-clock]" ? clock : status; } };
    const form = { addEventListener() {}, requestSubmit() { submissions += 1; } };
    const context = vm.createContext({
        document: { querySelector() { return timer; }, getElementById(id) { return id === "examForm" ? form : null; }, addEventListener(type, handler) { listeners.set(type, handler); } },
        window: { addEventListener() {} }, performance: { now() { return elapsed; } }, Date: { now() { return wall; } },
        setInterval() { return 1; }, clearInterval() {},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examTimer.js"), "utf8"), context);
    assert.equal(clock.textContent, "5:00");
    elapsed = 240000;
    wall = 240000;
    listeners.get("visibilitychange")();
    assert.equal(clock.textContent, "1:00");
    assert.match(status.textContent, /minuto/);
    wall = 301000;
    listeners.get("visibilitychange")();
    listeners.get("visibilitychange")();
    assert.equal(clock.textContent, "0:00");
    assert.equal(form.noValidate, true);
    assert.equal(submissions, 1);
});

test("timer autosave redirects safely when the server finalizes an expired attempt", async () => {
    const listeners = new Map();
    let location;
    let released = false;
    const form = {
        action: "/student/exams/9/take?page=1", addEventListener(type, handler) { listeners.set(type, handler); },
        dispatchEvent(event) { assert.equal(event.type, "submit"); released = true; },
        requestSubmit() { assert.fail("Expired autosave resubmitted without an access grant"); },
    };
    const timer = { dataset: { remainingMs: "300000" }, classList: { toggle() {} }, querySelector() { return {}; } };
    const context = vm.createContext({
        document: { querySelector() { return timer; }, getElementById(id) { return id === "examForm" ? form : null; }, addEventListener() {} },
        window: { addEventListener() {} }, location: { assign(url) { location = url; } }, performance: { now() { return 0; } },
        setInterval() { return 1; }, clearInterval() {}, URLSearchParams,
        FormData: class { constructor() { return [["_csrf", "csrf"], ["question_1", "0"]]; } }, Event: class { constructor(type) { this.type = type; } },
        async fetch(_url, options) {
            assert.equal(options.body.get("_saveAnswers"), "on");
            assert.equal(options.body.get("_csrf"), "csrf");
            return { ok: true, headers: { get() { return "application/json"; } }, async json() { return { finished: true, redirect: "/student/exams" }; } };
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examTimer.js"), "utf8"), context);
    listeners.get("change")();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(location, "/student/exams");
    assert.equal(released, true);
});

test("student presence resumes after history restoration without revealing answers", async () => {
    const windowEvents = new Map();
    const timers = new Map();
    const requests = [];
    let timerId = 0;
    const context = vm.createContext({
        document: { hidden: false, querySelector() { return { dataset: { examId: "9", securityToken: "token", csrfToken: "csrf" }, inert: false }; }, getElementById() { return null; }, addEventListener() {} },
        window: { addEventListener(type, handler) { windowEvents.set(type, handler); } },
        navigator: { sendBeacon(_url, body) { requests.push(body); return true; } },
        MutationObserver: class { observe() {} },
        setInterval(handler) { timers.set(++timerId, handler); return timerId; },
        clearInterval(id) { timers.delete(id); },
        async fetch(_url, options) { requests.push(options.body); return { status: 204 }; },
        URLSearchParams, URL,
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examPresence.js"), "utf8"), context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests[0].get("action"), "heartbeat");
    assert.equal(requests[0].get("token"), "token");
    assert.deepEqual([...requests[0].keys()].sort(), ["_csrf", "action", "token"]);
    windowEvents.get("pagehide")();
    assert.equal(timers.size, 0);
    assert.equal(requests.at(-1).get("action"), "leave");
    windowEvents.get("pageshow")({ persisted: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(timers.size, 1);
    assert.equal(requests.at(-1).get("action"), "heartbeat");
});

test("activity uses server elapsed time, expires stale presence and never exposes tokens", () => {
    const now = Date.parse("2026-11-02T10:03:00Z");
    const attempt = { student: { id: 7, name: "Student", email: "student@example.com" }, token: "secret", startedAt: new Date(now - 180000), lastSeenAt: new Date(now), connected: true };
    assert.equal(activityView(attempt, now).elapsedSeconds, 180);
    assert.equal(activityView(attempt, now).state, "responding");
    assert.equal(activityView(attempt, now + 45001).state, "away");
    attempt.connected = false;
    assert.equal(activityView(attempt, now).state, "away");
    assert.equal(activityView(attempt, now).token, undefined);
    assert.equal(activityView(attempt, now).student.email, undefined);
});

test("activity panel loads once even when opened in a background tab", async () => {
    let requests = 0;
    const status = { textContent: "Cargando..." };
    const rows = { replaceChildren() {}, appendChild() {} };
    const count = {};
    const button = { addEventListener() {} };
    const panel = { dataset: { activityUrl: "/professor/exams/9/activity" }, querySelector(selector) {
        return { "[data-activity-rows]": rows, "[data-activity-count]": count, "[data-activity-status]": status, "[data-activity-refresh]": button }[selector];
    } };
    const context = vm.createContext({
        document: { hidden: true, querySelector() { return panel; }, addEventListener() {}, createElement() { return { appendChild() {} }; } },
        window: { addEventListener() {} }, performance: { now() { return 0; } },
        setInterval() { return 1; }, clearInterval() {},
        async fetch() { requests += 1; return { ok: true, headers: { get() { return "application/json"; } }, async json() { return { attempts: [], updatedAt: "2026-11-02T10:00:00Z" }; } }; },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examActivity.js"), "utf8"), context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.match(status.textContent, /^Actualizado:/);
    assert.equal(count.textContent, "0");
});

test("visible activity clock advances locally and expires stale presence without fetching again", async () => {
    let elapsed = 0;
    let requests = 0;
    const intervals = [];
    function element() {
        return { children: [], dataset: {}, appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
            querySelector(selector) { return this.children.find(child => Object.hasOwn(child.dataset, selector === "[data-duration]" ? "duration" : "presence")); } };
    }
    const rows = element();
    const count = {};
    const status = {};
    const panel = { dataset: { activityUrl: "/professor/exams/9/activity" }, querySelector(selector) {
        return { "[data-activity-rows]": rows, "[data-activity-count]": count, "[data-activity-status]": status, "[data-activity-refresh]": { addEventListener() {} } }[selector];
    } };
    const context = vm.createContext({
        document: { hidden: false, querySelector() { return panel; }, addEventListener() {}, createElement: element },
        window: { addEventListener() {} }, performance: { now() { return elapsed; } },
        setInterval(handler) { intervals.push(handler); return intervals.length; }, clearInterval() {},
        async fetch() { requests += 1; return { ok: true, headers: { get() { return "application/json"; } }, async json() {
            return { updatedAt: "2026-11-02T10:00:00Z", attempts: [{ student: { name: "Student" }, startedAt: "2026-11-02T09:58:00Z", lastSeenAt: "2026-11-02T10:00:00Z", elapsedSeconds: 120, state: "responding" }] };
        } }; },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examActivity.js"), "utf8"), context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(count.textContent, "1");
    elapsed = 2000;
    intervals[1]();
    assert.equal(rows.children[0].querySelector("[data-duration]").textContent, "2 min 2 s");
    elapsed = 46000;
    intervals[1]();
    assert.equal(count.textContent, "0");
    assert.equal(rows.children[0].querySelector("[data-presence]").textContent, "Sin actividad reciente");
    assert.equal(requests, 1);
});