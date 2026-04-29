const { Exam, Question } = require("../models");

const MAX_ITEMS_PER_SCREEN = 5;

async function renderStart(req, res) {
  const exam = await Exam.findOne();
  if (!exam) {
    return res.status(500).render("errors/generic", {
      title: "Sin examen disponible",
      message: "No hay datos cargados. Ejecuta npm run seed.",
    });
  }

  return res.render("exams/start", {
    title: "Sistema de examen accesible",
    exam,
    maxItems: MAX_ITEMS_PER_SCREEN,
  });
}

async function renderExam(req, res) {
  const exam = await Exam.findOne({
    include: [
      {
        model: Question,
        as: "questions",
      },
    ],
  });

  if (!exam) {
    return res.status(500).render("errors/generic", {
      title: "Sin examen disponible",
      message: "No hay datos cargados. Ejecuta npm run seed.",
    });
  }

  return res.render("exams/take", {
    title: "Resolver examen",
    exam,
    questions: exam.questions.slice(0, MAX_ITEMS_PER_SCREEN),
    errors: [],
    oldAnswers: {},
  });
}

async function submitExam(req, res) {
  const exam = await Exam.findOne({
    include: [
      {
        model: Question,
        as: "questions",
      },
    ],
  });

  if (!exam) {
    return res.status(500).render("errors/generic", {
      title: "Sin examen disponible",
      message: "No hay datos cargados. Ejecuta npm run seed.",
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
      errors.push({ msg: `La respuesta ${index + 1} no es valida.` });
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

  return res.render("exams/result", {
    title: "Resultados",
    score,
    total: questions.length,
  });
}

module.exports = {
  MAX_ITEMS_PER_SCREEN,
  renderStart,
  renderExam,
  submitExam,
};
