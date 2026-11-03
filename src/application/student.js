const { getQuestionDefinition, gradeQuestion } = require("../domain/questions");
const { buildCrosswordLayout } = require("../domain/crossword");
const { assertPort, contracts } = require("../ports");

function createStudentUseCases({ data, unitOfWork, activity }) {
  assertPort("student", data, contracts.student);
  const { examTiming } = activity;
  const MAX_ITEMS_PER_SCREEN = 5;

  function questionViews(questions) {
    return questions.map((question) => {
      const definition = getQuestionDefinition(question);
      return {
        question,
        type: definition.type,
        configuration: definition.configuration,
        layout: definition.type === "crossword" ? buildCrosswordLayout(definition.configuration.entries) : null,
      };
    });
  }

  function extractAnswer(question, source) {
    const { type, configuration } = getQuestionDefinition(question);
    const key = `question_${question.id}`;
    if (type !== "crossword") return source[key];
    const layout = buildCrosswordLayout(configuration.entries);
    return layout.words.map((word) => word.cells.map((cell) => source[`${key}_cell_${cell.row}_${cell.col}`] || "").join(""));
  }

  function answerIsComplete(question, answer) {
    const { type } = getQuestionDefinition(question);
    if (type === "crossword") return Array.isArray(answer) && answer.every((word) => word.length > 0);
    return typeof answer === "string" && answer.trim().length > 0;
  }

  function answerIsValid(question, answer) {
    const { type, configuration } = getQuestionDefinition(question);
    if (type === "multiple_choice") {
      return Number.isInteger(Number(answer)) && Number(answer) >= 0 && Number(answer) < configuration.options.length;
    }
    if (type === "true_false") return ["true", "false"].includes(String(answer));
    if (type === "crossword") return Array.isArray(answer) && answer.every((word) => /^[\p{L}\p{N}]+$/u.test(word));
    return true;
  }

  async function listExams(context, output) {
    const exams = await data.listAccessibleExams(context);
    const myResults = await data.listStudentResults(context);
    const resultsMap = {};
    const invitations = await data.listExamInvitations(context);
    for (const result of myResults) {
      let pendingReview = 0;
      try {
        pendingReview = JSON.parse(result.answers || "{}")._pendingManual?.length || 0;
      } catch (_error) { }
      resultsMap[result.examId] = { score: result.score, total: result.total, pendingReview };
    }
    output.render("student/exams", {
      title: "Exámenes disponibles",
      exams,
      resultsMap,
      invitations,
      userName: context.session.userName || "Estudiante",
    });
  }

  async function renderStart(context, output) {
    const exam = await data.findExamForStart(context);
    if (!exam) {
      return output.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    if (!exam.questions.length) {
      return output.status(400).render("errors/generic", { title: "Examen vacío", message: "Este examen todavía no tiene preguntas." });
    }
    const existing = await data.findExistingResult(context, exam);
    if (existing) return output.redirect("/student/exams");
    const totalQuestions = exam.questions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    output.render("exams/start", {
      title: "Sistema de examen accesible",
      exam,
      totalQuestions,
      totalPages,
      maxItems: MAX_ITEMS_PER_SCREEN,
      startErrors: output.locals.startErrors || [],
    });
  }

  async function renderExam(context, output) {
    const exam = await data.findExamWithQuestions(context);
    if (!exam) {
      return output.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    const existing = await data.findExistingResult(context, exam);
    if (existing) return output.redirect("/student/exams");

    const timing = await examTiming(exam, context.session.userId);
    if (timing?.expired) return finishExam(context, output, exam);
    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    const currentPage = Math.min(Math.max(parseInt(context.query.page) || 1, 1), totalPages || 1);
    const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
    const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
    output.render("exams/take", {
      title: "Resolver examen",
      exam,
      questions,
      questionViews: questionViews(questions),
      currentPage,
      totalPages,
      totalQuestions,
      timing,
      errors: [],
      oldAnswers: context.session.examAnswersByExam?.[exam.id] || {},
    });
  }

  async function submitExam(context, output) {
    const exam = await data.findExamWithQuestions(context);
    if (!exam) {
      return output.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    const existing = await data.findExistingResult(context, exam);
    if (existing) return output.redirect("/student/exams");

    const timing = await examTiming(exam, context.session.userId);
    if (timing?.expired) return finishExam(context, output, exam);
    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    const currentPage = Math.min(Math.max(parseInt(context.query.page) || 1, 1), totalPages || 1);
    const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
    const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
    const errors = [];

    if (timing && context.body._saveAnswers === "on") {
      savePageAnswers(context, exam, questions);
      return output.json({ remainingMs: Math.max(0, timing.expiresAt - Date.now()) });
    }

    for (const [index, question] of questions.entries()) {
      const answer = extractAnswer(question, context.body);
      const questionNumber = offset + index + 1;
      if (!answerIsComplete(question, answer)) {
        errors.push({ msg: `Debes responder la pregunta ${questionNumber}.` });
      } else if (!answerIsValid(question, answer)) {
        errors.push({ msg: `La respuesta ${questionNumber} no es válida.` });
      }
    }

    if (errors.length) {
      const oldAnswers = { ...(context.session.examAnswersByExam?.[exam.id] || {}), ...context.body };
      return output.status(400).render("exams/take", {
        title: "Resolver examen",
        exam,
        questions,
        questionViews: questionViews(questions),
        currentPage,
        totalPages,
        totalQuestions,
        timing,
        errors,
        oldAnswers,
      });
    }

    savePageAnswers(context, exam, questions);
    if (currentPage < totalPages) return output.redirect(`/student/exams/${exam.id}/take?page=${currentPage + 1}`);

    return finishExam(context, output, exam);
  }

  function savePageAnswers(context, exam, questions) {
    if (!context.session.examAnswersByExam) context.session.examAnswersByExam = {};
    if (!context.session.examAnswersByExam[exam.id]) context.session.examAnswersByExam[exam.id] = {};
    const answers = context.session.examAnswersByExam[exam.id];
    for (const question of questions) {
      const key = `question_${question.id}`;
      for (const field of Object.keys(answers)) {
        if (field === key || field.startsWith(`${key}_cell_`)) delete answers[field];
      }
      for (const [field, value] of Object.entries(context.body)) {
        if ((field === key || field.startsWith(`${key}_cell_`)) && typeof value === "string") answers[field] = value;
      }
    }
  }

  async function finishExam(context, output, exam) {
    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const savedAnswers = context.session.examAnswersByExam?.[exam.id] || {};
    const submittedAnswers = {};
    const manualQuestionIds = [];
    let objectiveScore = 0;
    for (const question of allQuestions) {
      const answer = extractAnswer(question, savedAnswers);
      submittedAnswers[question.id] = answer;
      const grade = answerIsComplete(question, answer) && answerIsValid(question, answer) ? gradeQuestion(question, answer) : false;
      if (grade === null) manualQuestionIds.push(question.id);
      else if (grade) objectiveScore += 1;
    }
    submittedAnswers._objectiveScore = objectiveScore;
    submittedAnswers._manualScores = {};
    submittedAnswers._pendingManual = manualQuestionIds;
    await unitOfWork.run(async transaction => {
      await data.createResult({
        userId: context.session.userId,
        examId: exam.id,
        score: objectiveScore,
        total: totalQuestions,
        answers: JSON.stringify(submittedAnswers),
      }, transaction);
      await data.finishAttempt({ finishedAt: new Date(), connected: false }, context, exam, transaction);
    });
    if (context.session.examAnswersByExam) delete context.session.examAnswersByExam[exam.id];
    if (context.session.examAccess) delete context.session.examAccess[exam.id];
    if (context.body?._saveAnswers === "on") return output.json({ finished: true, redirect: "/student/exams" });
    output.render("exams/result", {
      title: "Resultados",
      score: objectiveScore,
      total: totalQuestions,
      examId: exam.id,
      leaderboardEnabled: exam.leaderboardEnabled,
      pendingReview: manualQuestionIds.length,
    });
  }

  return { listExams, renderStart, renderExam, submitExam };
}

module.exports = { createStudentUseCases };
