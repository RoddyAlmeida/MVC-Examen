const { Exam, Question } = require("../models");

async function dashboard(req, res) {
  const exams = await Exam.findAll({ order: [["createdAt", "DESC"]] });
  res.render("professor/dashboard", { title: "Mis exámenes", exams });
}

async function renderCreateExam(req, res) {
  res.render("professor/exam-form", { title: "Crear examen", exam: null, errors: [] });
}

async function createExam(req, res) {
  const { title, instructions } = req.body;
  const errors = [];
  if (!title || !title.trim()) errors.push({ msg: "El título es obligatorio." });
  if (!instructions || !instructions.trim()) errors.push({ msg: "Las instrucciones son obligatorias." });
  if (errors.length > 0) {
    return res.status(400).render("professor/exam-form", { title: "Crear examen", exam: req.body, errors });
  }
  await Exam.create({ title: title.trim(), instructions: instructions.trim() });
  res.redirect("/professor/dashboard");
}

async function renderEditExam(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.redirect("/professor/dashboard");
  res.render("professor/exam-form", { title: "Editar examen", exam, errors: [] });
}

async function editExam(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.redirect("/professor/dashboard");
  const { title, instructions } = req.body;
  const errors = [];
  if (!title || !title.trim()) errors.push({ msg: "El título es obligatorio." });
  if (!instructions || !instructions.trim()) errors.push({ msg: "Las instrucciones son obligatorias." });
  if (errors.length > 0) {
    return res.status(400).render("professor/exam-form", { title: "Editar examen", exam: { ...req.body, id: exam.id }, errors });
  }
  await exam.update({ title: title.trim(), instructions: instructions.trim() });
  res.redirect("/professor/dashboard");
}

async function deleteExam(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (exam) await exam.destroy();
  res.redirect("/professor/dashboard");
}

async function manageQuestions(req, res) {
  const exam = await Exam.findByPk(req.params.id, {
    include: [{ model: Question, as: "questions" }],
    order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
  });
  if (!exam) return res.redirect("/professor/dashboard");
  res.render("professor/question-form", { title: "Preguntas", exam, questions: exam.questions || [], errors: [] });
}

async function createQuestion(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.redirect("/professor/dashboard");
  const { prompt, optionA, optionB, optionC, correctOption } = req.body;
  const errors = [];
  if (!prompt || !prompt.trim()) errors.push({ msg: "El enunciado es obligatorio." });
  if (!optionA || !optionA.trim()) errors.push({ msg: "La opción A es obligatoria." });
  if (!optionB || !optionB.trim()) errors.push({ msg: "La opción B es obligatoria." });
  if (!optionC || !optionC.trim()) errors.push({ msg: "La opción C es obligatoria." });
  if (!["A", "B", "C"].includes(correctOption)) errors.push({ msg: "Selecciona una opción correcta válida." });
  if (errors.length > 0) {
    const questions = await Question.findAll({ where: { examId: exam.id } });
    return res.status(400).render("professor/question-form", { title: "Preguntas", exam, questions, errors });
  }
  await Question.create({ examId: exam.id, prompt: prompt.trim(), optionA: optionA.trim(), optionB: optionB.trim(), optionC: optionC.trim(), correctOption });
  res.redirect(`/professor/exams/${exam.id}/questions`);
}

async function editQuestion(req, res) {
  const question = await Question.findByPk(req.params.qid);
  if (!question) return res.redirect("/professor/dashboard");
  const { prompt, optionA, optionB, optionC, correctOption } = req.body;
  const errors = [];
  if (!prompt || !prompt.trim()) errors.push({ msg: "El enunciado es obligatorio." });
  if (!optionA || !optionA.trim()) errors.push({ msg: "La opción A es obligatoria." });
  if (!optionB || !optionB.trim()) errors.push({ msg: "La opción B es obligatoria." });
  if (!optionC || !optionC.trim()) errors.push({ msg: "La opción C es obligatoria." });
  if (!["A", "B", "C"].includes(correctOption)) errors.push({ msg: "Selecciona una opción correcta válida." });
  if (errors.length > 0) {
    const exam = await Exam.findByPk(question.examId, { include: [{ model: Question, as: "questions" }] });
    return res.status(400).render("professor/question-form", { title: "Preguntas", exam, questions: exam.questions, errors, editing: question.id });
  }
  await question.update({ prompt: prompt.trim(), optionA: optionA.trim(), optionB: optionB.trim(), optionC: optionC.trim(), correctOption });
  res.redirect(`/professor/exams/${question.examId}/questions`);
}

async function deleteQuestion(req, res) {
  const question = await Question.findByPk(req.params.qid);
  if (question) {
    const examId = question.examId;
    await question.destroy();
    res.redirect(`/professor/exams/${examId}/questions`);
  } else {
    res.redirect("/professor/dashboard");
  }
}

module.exports = { dashboard, renderCreateExam, createExam, renderEditExam, editExam, deleteExam, manageQuestions, createQuestion, editQuestion, deleteQuestion };
