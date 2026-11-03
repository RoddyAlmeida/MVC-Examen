const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { sequelize, User, Course, CourseEnrollment, Exam, ExamAssignment, Question, QuestionContent, Result, ExamAttempt } = require("../src/adapters/persistence/sequelize/models/index");
const { seedUsers, seedTemplate, demoCourses } = require("../src/adapters/cli/seed");
const { QUESTION_TYPES, gradeQuestion, normalizeQuestionInput } = require("../src/domain/questions");
const { buildCrosswordLayout } = require("../src/domain/crossword");

test("seed creates five accounts and three complete exams with isolated active access, without duplicates", async (context) => {
  sequelize.connectionManager.lib.Database = require("sqlite3").Database;
  sequelize.options.storage = ":memory:";
  context.after(async () => sequelize.close());
  await sequelize.sync({ force: true });

  const users = await seedUsers();
  await seedTemplate(users);
  await seedTemplate(await seedUsers());

  assert.equal(await User.count(), 5);
  assert.equal(await User.count({ where: { role: "profesor" } }), 1);
  assert.equal(await User.count({ where: { role: "administrador" } }), 1);
  assert.equal(await User.count({ where: { role: "estudiante" } }), 3);
  assert.equal(await Course.count(), 3);
  assert.equal(await Exam.count(), 3);
  assert.equal(await Question.count(), 21);
  assert.equal(await QuestionContent.count(), 21);
  assert.equal(await CourseEnrollment.count(), 3);
  assert.equal(await ExamAssignment.count(), 3);

  for (const [index, demoCourse] of demoCourses.entries()) {
    const student = users.estudiantes[index];
    assert.ok(await bcrypt.compare("estudiante123", student.password));
    const course = await Course.findOne({ where: { name: demoCourse.name } });
    assert.equal(course.professorId, users.profesor.id);
    const enrollment = await CourseEnrollment.findOne({ where: { courseId: course.id } });
    assert.equal(enrollment.userId, student.id);
    assert.equal(enrollment.status, "active");
    const exam = await Exam.findOne({ where: { courseId: course.id } });
    assert.equal(exam.creatorId, users.profesor.id);
    const assignment = await ExamAssignment.findOne({ where: { examId: exam.id } });
    assert.equal(assignment.userId, student.id);
    assert.equal(assignment.status, "active");
    const questions = await Question.findAll({ where: { examId: exam.id }, include: [{ model: QuestionContent, as: "content" }] });
    assert.deepEqual(new Set(questions.map(question => question.content.type)), QUESTION_TYPES);
    assert.equal(questions.filter(question => question.content.type === "true_false").length, 2);
    for (const input of demoCourse.questions) {
      const normalized = normalizeQuestionInput(input);
      const question = questions.find(item => item.prompt === normalized.prompt);
      assert.deepEqual(JSON.parse(question.content.configuration), normalized.configuration);
      const configuration = normalized.configuration;
      const answer = normalized.type === "multiple_choice" ? configuration.correctIndex
        : normalized.type === "true_false" ? configuration.correctAnswer
          : normalized.type === "fill_text" ? configuration.acceptedAnswers[0]
            : normalized.type === "fill_drag" ? configuration.answer
              : normalized.type === "crossword" ? configuration.entries.map(entry => entry.answer)
                : "Respuesta para revision";
      assert.equal(gradeQuestion(question, answer), normalized.type === "concept" ? null : true);
      if (normalized.type === "crossword") {
        assert.equal(buildCrosswordLayout(configuration.entries).words.length, configuration.entries.length);
      }
    }
  }
  assert.ok(await bcrypt.compare("profesor123", users.profesor.password));
  assert.ok(await bcrypt.compare("administrador123", users.administrador.password));

  const { startServer } = require("../src/bootstrap/server");
  const server = await startServer(0);
  context.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${baseUrl}/login`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/css/styles.css`)).status, 200);
  const accounts = [
    { email: "profesor@example.com", password: "profesor123", path: "/professor/dashboard" },
    { email: "administrador@example.com", password: "administrador123", path: "/admin/dashboard" },
    ...users.estudiantes.map(student => ({ email: student.email, password: "estudiante123", path: "/student/exams" })),
  ];
  for (const account of accounts) {
    const login = await fetch(`${baseUrl}/login`, {
      method: "POST", redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: account.email, password: account.password }),
    });
    assert.equal(login.status, 302);
    assert.equal(login.headers.get("location"), account.path);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const dashboard = await fetch(`${baseUrl}${account.path}`, { headers: { Cookie: cookie } });
    assert.equal(dashboard.status, 200);
    if (account.email.startsWith("estudiante")) {
      const html = await dashboard.text();
      const index = users.estudiantes.findIndex(student => student.email === account.email);
      assert.ok(html.includes(`Examen de ejemplo: ${demoCourses[index].name}`));
      for (const [otherIndex, course] of demoCourses.entries()) {
        if (otherIndex !== index) assert.ok(!html.includes(`Examen de ejemplo: ${course.name}`));
      }
      if (index === 0) {
        const csrf = html.match(/name="csrf-token" content="([^"]+)"/)[1];
        const exam = await Exam.findOne({ where: { courseId: (await Course.findOne({ where: { name: demoCourses[0].name } })).id } });
        const begin = await fetch(`${baseUrl}/student/exams/${exam.id}/begin`, {
          method: "POST", redirect: "manual", headers: { Cookie: cookie }, body: new URLSearchParams({ _csrf: csrf }),
        });
        assert.equal(begin.status, 302);
        const questions = await Question.findAll({ where: { examId: exam.id }, include: [{ model: QuestionContent, as: "content" }], order: [["id", "ASC"]] });
        for (let page = 1; page <= 2; page += 1) {
          const body = new URLSearchParams({ _csrf: csrf });
          for (const question of questions.slice((page - 1) * 5, page * 5)) {
            const { type, configuration } = { type: question.content.type, configuration: JSON.parse(question.content.configuration) };
            const key = `question_${question.id}`;
            if (type === "crossword") {
              for (const word of buildCrosswordLayout(configuration.entries).words) {
                for (const cell of word.cells) body.set(`${key}_cell_${cell.row}_${cell.col}`, "A");
              }
            } else {
              body.set(key, type === "multiple_choice" ? String(configuration.correctIndex)
                : type === "true_false" ? String(configuration.correctAnswer)
                  : type === "fill_text" ? configuration.acceptedAnswers[0]
                    : type === "fill_drag" ? configuration.answer : "Respuesta para revision manual");
            }
          }
          if (page === 2) {
            const failure = context.mock.method(Result, "create", async () => { throw new Error("Simulated result storage failure"); });
            try {
              const failed = await fetch(`${baseUrl}/student/exams/${exam.id}/take?page=${page}`, {
                method: "POST", redirect: "manual", headers: { Cookie: cookie }, body,
              });
              assert.equal(failed.status, 500);
              const errorPage = await failed.text();
              assert.match(errorPage, /No se pudo confirmar la entrega/);
              assert.match(errorPage, /href="\/student\/results"/);
              assert.doesNotMatch(errorPage, /\/exam\/start|location\.reload/);
              assert.equal(await Result.count({ where: { userId: users.estudiantes[0].id, examId: exam.id } }), 0);
              assert.equal((await ExamAttempt.findOne({ where: { userId: users.estudiantes[0].id, examId: exam.id } })).finishedAt, null);
            } finally { failure.mock.restore(); }
          }
          const reply = await fetch(`${baseUrl}/student/exams/${exam.id}/take?page=${page}`, {
            method: "POST", redirect: "manual", headers: { Cookie: cookie }, body,
          });
          assert.equal(reply.status, page === 1 ? 302 : 200);
          if (page === 2) assert.match(await reply.text(), /Resultado del examen/);
        }
        const result = await Result.findOne({ where: { userId: users.estudiantes[0].id, examId: exam.id } });
        assert.equal(result.total, 7);
        assert.equal(JSON.parse(result.answers)._pendingManual.length, 1);
        assert.equal(await Result.count({ where: { userId: users.estudiantes[0].id, examId: exam.id } }), 1);
        assert.ok((await ExamAttempt.findOne({ where: { userId: users.estudiantes[0].id, examId: exam.id } })).finishedAt);
      }
    }
  }
});