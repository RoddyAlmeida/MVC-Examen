const { Exam, Question, Result } = require("../models");

const MAX_ITEMS_PER_SCREEN = 5;

async function listExams(req, res) {
  const exams = await Exam.findAll({ order: [["createdAt", "DESC"]] });

  const myResults = await Result.findAll({
    where: { userId: req.session.userId },
    attributes: ["examId", "score", "total"],
  });
  const resultsMap = {};
  for (const r of myResults) {
    resultsMap[r.examId] = { score: r.score, total: r.total };
  }

  res.render("student/exams", { title: "Exámenes disponibles", exams, resultsMap, userName: req.session.userName || "Estudiante" });
}

async function renderStart(req, res) {
  const exam = await Exam.findOne({
    where: { id: req.params.id },
    include: [{ model: Question, as: "questions" }],
  });
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }

  const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
  if (existing) {
    return res.redirect("/student/exams");
  }

  const totalQuestions = exam.questions.length;
  const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
  res.render("exams/start", { title: "Sistema de examen accesible", exam, totalQuestions, totalPages, maxItems: MAX_ITEMS_PER_SCREEN });
}

async function renderExam(req, res) {
  const exam = await Exam.findOne({
    where: { id: req.params.id },
    include: [{ model: Question, as: "questions" }],
    order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
  });
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }

  const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
  if (existing) {
    return res.redirect("/student/exams");
  }

  const allQuestions = exam.questions;
  const totalQuestions = allQuestions.length;
  const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
  const currentPage = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages || 1);
  const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
  const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
  const savedAnswers = req.session.examAnswers || {};

  res.render("exams/take", {
    title: "Resolver examen",
    exam,
    questions,
    allQuestions,
    currentPage,
    totalPages,
    totalQuestions,
    errors: [],
    oldAnswers: savedAnswers,
  });
}

async function submitExam(req, res) {
  const exam = await Exam.findOne({
    where: { id: req.params.id },
    include: [{ model: Question, as: "questions" }],
    order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
  });
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }

  const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
  if (existing) {
    return res.redirect("/student/exams");
  }

  const allQuestions = exam.questions;
  const totalQuestions = allQuestions.length;
  const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
  const currentPage = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages || 1);
  const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
  const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);

  const errors = [];
  for (const [index, question] of questions.entries()) {
    const selectedAnswer = req.body[`question_${question.id}`];
    if (!selectedAnswer) {
      errors.push({ msg: `Debes responder la pregunta ${offset + index + 1}.` });
      continue;
    }
    if (!["A", "B", "C"].includes(selectedAnswer)) {
      errors.push({ msg: `La respuesta ${offset + index + 1} no es válida.` });
    }
  }

  if (errors.length > 0) {
    const savedAnswers = { ...(req.session.examAnswers || {}), ...req.body };
    return res.status(400).render("exams/take", {
      title: "Resolver examen",
      exam,
      questions,
      allQuestions,
      currentPage,
      totalPages,
      totalQuestions,
      errors,
      oldAnswers: savedAnswers,
    });
  }

  if (!req.session.examAnswers) req.session.examAnswers = {};
  Object.assign(req.session.examAnswers, req.body);

  if (currentPage < totalPages) {
    return res.redirect(`/student/exams/${exam.id}/take?page=${currentPage + 1}`);
  }

  let score = 0;
  const answersMap = {};
  for (const question of allQuestions) {
    const selectedAnswer = req.session.examAnswers[`question_${question.id}`];
    answersMap[question.id] = selectedAnswer;
    if (selectedAnswer === question.correctOption) {
      score += 1;
    }
  }

  await Result.create({ userId: req.session.userId, examId: exam.id, score, total: totalQuestions, answers: JSON.stringify(answersMap) });
  delete req.session.examAnswers;

  res.render("exams/result", {
    title: "Resultados",
    score,
    total: totalQuestions,
    examId: exam.id,
  });
}

module.exports = { listExams, renderStart, renderExam, submitExam };