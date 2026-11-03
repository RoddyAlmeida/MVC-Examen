const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const course = { id: 2, name: "Literatura" };
const base = { title: "Crear examen", course, courses: [course], exam: null, errors: [], csrfToken: "csrf-test", actionNotice: null, req: { session: { userName: "Docente <script>", role: "profesor" }, query: {}, originalUrl: "/professor/exams/create" } };
const render = (view, values = {}) => ejs.renderFile(path.join(__dirname, `../views/professor/${view}.ejs`), { ...base, ...values });

test("exam creation separates required data from optional settings and preserves POST contracts", async () => {
    const html = await render("exam-form");
    assert.match(html, /professor.css/);
    assert.match(html, /Docente &lt;script&gt;/);
    assert.match(html, /action="\/professor\/exams\/create"/);
    assert.match(html, /name="_csrf" value="csrf-test"/);
    assert.match(html, /Crear y añadir preguntas/);
    assert.match(html, /aria-current="step"/);
    assert.match(html, /id="timerEnabled"/);
    assert.match(html, /id="timerDuration"[^>]*hidden/);
    assert.match(html, /id="timeLimitMinutes"[^>]*disabled/);
    assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1);
});

test("editing and invalid exam submissions retain values and optional setting state", async () => {
    const html = await render("exam-form", { exam: { id: 9, title: "Evaluación", instructions: "Responder", timerEnabled: "on", timeLimitMinutes: 45, leaderboardEnabled: "on" }, errors: [{ msg: "Revisa el título" }] });
    assert.match(html, /action="\/professor\/exams\/9\/edit"/);
    assert.match(html, /Revisa el título/);
    assert.match(html, /value="45"/);
    assert.match(html, /id="timerEnabled"[^>]*checked/);
    assert.match(html, /id="leaderboardEnabled"[^>]*checked/);
    assert.match(html, /href="\/professor\/exams\/9\/questions"/);
    assert.doesNotMatch(html, /name="courseId"/);
});

test("every professor view uses one shared layout while retaining its forms and feedback", async () => {
    const exam = { id: 9, courseId: 2, title: "Lectura", instructions: "Responder", createdAt: new Date(), securityMode: "none" };
    const student = { id: 7, name: "Ana", email: "ana@local.test" };
    const result = { exam, examId: 9, score: 1, total: 2, createdAt: new Date() };
    const values = { exam, exams: [exam], students: [student], student, result, results: [result], questions: [], questionViews: [], formData: {}, editingQuestion: null, members: [], assignments: [], events: [], eventTypes: {}, professor: null, enrollments: [], pendingReview: 0 };
    for (const view of ["dashboard", "exam-form", "exam-import", "question-form", "question-editor", "students", "student-detail", "student-exam-detail", "course-members", "exam-access", "notifications"]) {
        const html = await render(view, values);
        assert.match(html, /class="professor-sidebar"/, view);
        assert.match(html, /id="page-feedback"/, view);
        assert.match(html, /name="csrf-token" content="csrf-test"/, view);
        assert.equal((html.match(/id="theme-toggle"/g) || []).length, 1, view);
        assert.equal((html.match(/<main\b/g) || []).length, 1, view);
        assert.doesNotMatch(html, /app-shell|onsubmit="return confirm/, view);
        assert.ok(html.indexOf('/js/professorWorkspace.js') < html.indexOf('/js/pageFeedback.js'), view);
    }
});

test("question editor keeps all six question types and escaped values with a preview", async () => {
    const html = await render("question-editor", { exam: { id: 9, title: "Lectura" }, editingQuestion: null, formData: { prompt: '<script>Texto</script>', questionType: "multiple_choice", optionText: ["Primera", "Segunda"], correctIndex: 1 } });
    for (const type of ["multiple_choice", "true_false", "fill_text", "fill_drag", "concept", "crossword"]) assert.ok(html.includes(`data-type-fields="${type}"`), type);
    assert.match(html, /data-preview-prompt/);
    assert.match(html, /&lt;script&gt;Texto&lt;\/script&gt;/);
    assert.match(html, /name="optionText\[\]"/);
    assert.match(html, /name="correctIndex"/);
    assert.match(html, /action="\/professor\/exams\/9\/questions\/create"/);
});

test("question limit and drag-answer review remain visible in the new layout", async () => {
    const exam = { id: 9, title: "Lectura", courseId: 2 };
    const questions = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, prompt: `Pregunta ${index + 1}` }));
    const manager = await render("question-form", { exam, questions });
    assert.doesNotMatch(manager, /href="\/professor\/exams\/9\/questions\/create"/);
    assert.match(manager, /Límite de 100\s+preguntas\s+alcanzado/);
    const review = await render("student-exam-detail", { student: { id: 7, name: "Ana" }, result: { exam, examId: 9, score: 1, total: 1 }, pendingReview: 0, questionViews: [{ type: "fill_drag", question: { id: 1, prompt: "Capital" }, answer: "Quito", configuration: { answer: "Quito" }, correct: true }] });
    assert.match(review, /Quito/);
});

test("exam summary follows required fields and optional settings without changing form values", () => {
    const listeners = {};
    const summary = Object.fromEntries(["title", "course", "duration", "ranking"].map(key => [`[data-exam-summary-${key}]`, { textContent: "" }]));
    const elements = { title: { value: "" }, courseId: { value: "", selectedOptions: [{ textContent: "Literatura" }] }, timerEnabled: { checked: false }, timeLimitMinutes: { value: "30" }, leaderboardEnabled: { checked: false } };
    const form = { elements, addEventListener(name, callback) { listeners[name] = callback; } };
    require("node:vm").runInNewContext(require("node:fs").readFileSync(path.join(__dirname, "../public/js/professorWorkspace.js"), "utf8"), {
        document: { getElementById: id => id === "examDetailsForm" ? form : null, querySelector: selector => summary[selector] },
    });
    assert.equal(summary["[data-exam-summary-title]"].textContent, "Sin título");
    assert.equal(summary["[data-exam-summary-duration]"].textContent, "Sin límite");
    elements.title.value = "  Lectura  ";
    elements.courseId.value = "2";
    elements.timerEnabled.checked = true;
    elements.timeLimitMinutes.value = "45";
    elements.leaderboardEnabled.checked = true;
    listeners.input();
    assert.equal(summary["[data-exam-summary-title]"].textContent, "Lectura");
    assert.equal(summary["[data-exam-summary-course]"].textContent, "Literatura");
    assert.equal(summary["[data-exam-summary-duration]"].textContent, "45 min");
    assert.equal(summary["[data-exam-summary-ranking]"].textContent, "Activado");
    assert.equal(elements.title.value, "  Lectura  ");
});

test("destructive professor actions require confirmation and retain their original submitter", () => {
    const events = {};
    const dialogEvents = {};
    const accept = { addEventListener(_name, callback) { this.click = callback; } };
    const cancel = { addEventListener(_name, callback) { this.click = callback; } };
    const copy = {};
    const dialog = {
        open: false,
        querySelector: selector => selector === "[data-confirm-copy]" ? copy : accept,
        querySelectorAll: () => [cancel],
        addEventListener(name, callback) { dialogEvents[name] = callback; },
        showModal() { this.open = true; },
        close() { this.open = false; dialogEvents.close(); },
    };
    require("node:vm").runInNewContext(require("node:fs").readFileSync(path.join(__dirname, "../public/js/professorWorkspace.js"), "utf8"), {
        document: { getElementById: id => id === "professor-confirm" ? dialog : null, addEventListener(name, callback) { events[name] = callback; } },
    });
    let sent = 0;
    const button = {};
    const form = {
        dataset: { confirmMessage: "Eliminar pregunta" }, matches: () => true,
        requestSubmit(submitter) {
            assert.equal(submitter, button);
            const event = { target: form, submitter, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
            events.submit(event);
            if (!event.defaultPrevented) sent += 1;
        },
    };
    function submit() { const event = { target: form, submitter: button, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; events.submit(event); return event; }
    assert.equal(submit().defaultPrevented, true);
    assert.equal(copy.textContent, "Eliminar pregunta");
    cancel.click();
    assert.equal(sent, 0);
    assert.equal(dialog.open, false);
    submit();
    accept.click();
    assert.equal(sent, 1);
    assert.equal(dialog.open, false);
});