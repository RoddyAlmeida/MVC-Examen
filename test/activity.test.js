const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { ExamAttempt } = require("../models");
const { startAttempt, activityView } = require("../services/examActivity");

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