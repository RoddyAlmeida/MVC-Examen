const { Exam, Question } = require("../models");

const MAX_ITEMS_PER_SCREEN = 5;

async function listExams(req, res) {
  const exams = await Exam.findAll({ order: [["createdAt", "DESC"]] });
  res.render("student/exams", { title: "Exámenes disponibles", exams });
}

async function renderStart(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }
  res.render("exams/start", { title: "Sistema de examen accesible", exam, maxItems: MAX_ITEMS_PER_SCREEN });
}

async function renderExam(req, res) {
  const exam = await Exam.findByPk(req.params.id, {
    include: [{ model: Question, as: "questions" }],
  });
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }
  res.render("exams/take", {
    title: "Resolver examen",
    exam,
    questions: exam.questions.slice(0, MAX_ITEMS_PER_SCREEN),
    errors: [],
    oldAnswers: {},
  });
}

async function submitExam(req, res) {
  const exam = await Exam.findByPk(req.params.id, {
    include: [{ model: Question, as: "questions" }],
  });
  if (!exam) {
    return res.status(404).render("errors/generic", {
      title: "Examen no encontrado",
      message: "El examen que buscas no existe.",
    });
  }

  const questions = exam.questions.slice(0, MAX_ITEMS_PER_SCREEN);
  const errors = [];
  for (const [index, question] of questions.entries()) {
    const selectedAnswer = req.body[`question_${question.id}`];
    if (!selectedAnswer) {
      errors.push({ msg: `Debes responder la pregunta ${index + 1}.` });
      continue;
    }
    if (!["A", "B", "C"].includes(selectedAnswer)) {
      errors.push({ msg: `La respuesta ${index + 1} no es válida.` });
    }
  }

  if (errors.length > 0) {
    return res.status(400).render("exams/take", {
      title: "Resolver examen",
      exam,
      questions,
      errors,
      oldAnswers: req.body,
    });
  }

  let score = 0;
  for (const question of questions) {
    const selectedAnswer = req.body[`question_${question.id}`];
    if (selectedAnswer === question.correctOption) {
      score += 1;
    }
  }

  res.render("exams/result", {
    title: "Resultados",
    score,
    total: questions.length,
    examId: exam.id,
  });
}

module.exports = { listExams, renderStart, renderExam, submitExam };
