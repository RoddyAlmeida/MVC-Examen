const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const base = {
    title: "Mis exámenes",
    csrfToken: "test-csrf",
    actionNotice: null,
    req: { session: { userName: "Ana <script>", role: "estudiante", examAccess: { 1: { token: "test-grant" } } } },
};
const exam = { id: 1, title: "Evaluación de literatura", instructions: "Lee con atención.", createdAt: new Date("2026-11-03"), course: { name: "Literatura" }, securityMode: "monitored", timeLimitMinutes: 30, leaderboardEnabled: true };
const render = (view, data = {}) => ejs.renderFile(path.join(__dirname, "../views", `${view}.ejs`), { ...base, ...data });

test("student navigation renders empty pages, current destinations and escaped account names", async () => {
    for (const [view, data, destination] of [
        ["student/exams", { exams: [], invitations: [], resultsMap: {} }, "exams"],
        ["student/courses", { enrollments: [] }, "courses"],
        ["student/results", { results: [] }, "results"],
        ["student/course-members", { professor: null, enrollments: [] }, "courses"],
    ]) {
        const html = await render(view, data);
        assert.match(html, new RegExp(`href="/student/${destination}"\\s+aria-current="page"`));
        assert.match(html, /Ana &lt;script&gt;/);
        assert.match(html, /href="\/logout"/);
        assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1);
        assert.doesNotMatch(html, /professor-course-page|app-shell/);
    }
});

test("exam lists preserve invitations, CSRF, ranking and distinguish submitted exams", async () => {
    const html = await render("student/exams", {
        exams: [exam, { ...exam, id: 2, title: "Examen entregado" }],
        invitations: [{ id: 7, exam }],
        resultsMap: { 2: { score: 3, total: 5, pendingReview: 1 } },
    });
    assert.match(html, /href="\/student\/exams\/1\/start"/);
    assert.doesNotMatch(html, /href="\/student\/exams\/2\/start"/);
    assert.match(html, /href="\/student\/exams\/1\/leaderboard"/);
    assert.match(html, /action="\/student\/exams\/invitations\/7\/respond"/);
    assert.match(html, /name="_csrf" value="test-csrf"/);
    assert.match(html, /name="action" value="accept"/);
    assert.match(html, /name="action" value="reject"/);
    assert.match(html, /Revisión pendiente \(1\)/);
});

test("result history labels provisional grades and handles a zero total", async () => {
    const html = await render("student/results", {
        results: [
            { exam, createdAt: exam.createdAt, score: 3, total: 5, pendingReview: 1 },
            { exam, createdAt: exam.createdAt, score: 0, total: 0, pendingReview: 0 },
        ]
    });
    assert.match(html, /En revisión/);
    assert.match(html, /Calificado/);
    assert.doesNotMatch(html, /NaN|Infinity/);
});

test("evaluation pages retain security, timer, answer and accessibility hooks without exit navigation during an exam", async () => {
    const start = await render("exams/start", { exam: { ...exam, passwordHash: "hash" }, maxItems: 5, totalPages: 1, startErrors: ["Contraseña incorrecta"] });
    const action = start.match(/<form\s+action="([^"]+)"/)[1];
    assert.equal(new URL(action, "http://localhost").href, "http://localhost/student/exams/1/begin");
    assert.match(start, /name="password"/);
    assert.match(start, /Contraseña incorrecta/);
    const question = { id: 9, prompt: "¿Es verdadero?" };
    const take = await render("exams/take", { exam, questions: [question], questionViews: [{ question, type: "true_false" }], currentPage: 1, totalPages: 1, totalQuestions: 1, timing: { remainingMs: 90000 }, errors: [], oldAnswers: { question_9: "true" } });
    for (const hook of ["data-exam-session", "data-security-token=\"test-grant\"", "data-exam-timer", "id=\"examForm\"", "id=\"toggleReadBtn\"", "id=\"clearAnswersBtn\"", "name=\"question_9\"", "data-question-answer=\"9\""]) assert.ok(take.includes(hook), hook);
    assert.doesNotMatch(take, /href="\/student\/exams"|href="\/logout"/);
    const result = await render("exams/result", { score: 3, total: 5, pendingReview: 1, leaderboardEnabled: true, examId: 1 });
    assert.match(result, /Puntaje provisional/);
    assert.match(result, /href="\/student\/results"/);
});

test("leaderboard redesign is isolated to students and authentication retains form contracts", async () => {
    for (const role of ["student", "professor"]) {
        const html = await render("exams/leaderboard", { exam, backUrl: `/${role}/exams`, refreshUrl: `/${role}/exams/1/leaderboard`, rows: [], currentUserId: 1 });
        assert.equal(html.includes("/css/student.css"), role === "student");
        assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1);
    }
    for (const view of ["login", "register"]) {
        const html = await render(view, { registered: true, error: "Error de acceso" });
        assert.match(html, new RegExp(`action="/${view}"`));
        assert.match(html, /name="email"/);
        assert.match(html, /name="password"/);
        assert.match(html, /role="alert"/);
        assert.match(html, /class="auth-page"/);
    }
});

test("error pages offer safe role-specific recovery without replaying exam submissions", async () => {
    const html = await render("errors/generic", { title: "Error del servidor", message: "Entrega no confirmada", submissionFailed: true });
    assert.match(html, /No se pudo confirmar la entrega/);
    assert.match(html, /href="\/student\/results"/);
    assert.match(html, /href="\/student\/exams"/);
    assert.doesNotMatch(html, /\/exam\/start|history\.back|location\.reload|<form\b|app-shell/);
    for (const [role, destination] of [["profesor", "/professor/dashboard"], ["administrador", "/admin/dashboard"], [null, "/login"]]) {
        const page = await render("errors/generic", { title: "Error", message: "No disponible", req: { session: { role } } });
        assert.ok(page.includes(`href="${destination}"`));
    }
});