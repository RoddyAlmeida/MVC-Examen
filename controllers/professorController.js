const { sequelize, Exam, Question, QuestionContent, User, Result } = require("../models");
const { getQuestionDefinition, legacyQuestionFields, normalizeAnswer, normalizeQuestionInput } = require("../services/questionService");
const { parseQtiPackage } = require("../services/examImport");
const MAX_QUESTIONS_PER_EXAM = 100;

async function dashboard(req, res) {
  const exams = await Exam.findAll({ order: [["createdAt", "DESC"]] });
  res.render("professor/dashboard", { title: "Mis exámenes", exams });
}

function renderImportExamPage(res, errors = [], formData = {}, status = 200) {
  return res.status(status).render("professor/exam-import", { title: "Importar examen", errors, formData });
}

function renderImportExam(req, res) {
  return renderImportExamPage(res);
}

async function importExam(req, res) {
  try {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".zip")) {
      throw new Error("Selecciona un paquete QTI 3 válido en formato .zip.");
    }
    const examData = await parseQtiPackage(req.file.buffer);
    const exam = await sequelize.transaction(async (transaction) => {
      const createdExam = await Exam.create({ title: examData.title, instructions: examData.instructions }, { transaction });
      for (const questionData of examData.questions) {
        const question = await Question.create({
          examId: createdExam.id,
          prompt: questionData.prompt,
          ...legacyQuestionFields(questionData.type, questionData.configuration),
        }, { transaction });
        await QuestionContent.create({
          questionId: question.id,
          type: questionData.type,
          configuration: JSON.stringify(questionData.configuration),
        }, { transaction });
      }
      return createdExam;
    });
    res.redirect(`/professor/exams/${exam.id}/questions`);
  } catch (error) {
    return renderImportExamPage(res, [{ msg: error.message }], {}, 400);
  }
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

async function findQuestions(examId) {
  return Question.findAll({
    where: { examId },
    include: [{ model: QuestionContent, as: "content" }],
    order: [["id", "ASC"]],
  });
}

function questionFormData(question, definition) {
  const { type, configuration } = definition;
  const options = configuration.options || [];
  return {
    questionType: type,
    prompt: question.prompt,
    optionText: options.map((option) => typeof option === "string" ? option : option.text),
    correctIndex: configuration.correctIndex || 0,
    correctBoolean: String(configuration.correctAnswer),
    acceptedAnswers: (configuration.acceptedAnswers || []).join("\n"),
    fillTemplate: configuration.template || "",
    dragAnswer: configuration.answer || "",
    dragOptions: (configuration.options || []).join("\n"),
    crosswordEntries: (configuration.entries || []).map((entry) => `${entry.clue} | ${entry.answer}`).join("\n"),
  };
}

async function renderQuestionManager(res, exam, errors, editingQuestion, formData, status = 200) {
  return res.status(status).render("professor/question-form", {
    title: "Preguntas",
    exam,
    questions: await findQuestions(exam.id),
    errors,
  });
}

function renderQuestionEditor(res, exam, errors, editingQuestion, formData, status = 200) {
  return res.status(status).render("professor/question-editor", {
    title: editingQuestion ? "Editar pregunta" : "Agregar pregunta",
    exam,
    errors,
    editingQuestion,
    formData,
  });
}

async function manageQuestions(req, res) {
  const exam = await Exam.findByPk(req.params.id, {
    include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
    order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
  });
  if (!exam) return res.redirect("/professor/dashboard");
  res.render("professor/question-form", { title: "Preguntas", exam, questions: exam.questions || [], errors: [], editingQuestion: null, formData: {} });
}

async function renderCreateQuestion(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.redirect("/professor/dashboard");
  if (await Question.count({ where: { examId: exam.id } }) >= MAX_QUESTIONS_PER_EXAM) {
    return renderQuestionManager(res, exam, [{ msg: `Límite alcanzado: máximo ${MAX_QUESTIONS_PER_EXAM} preguntas por examen.` }], null, {}, 400);
  }
  return renderQuestionEditor(res, exam, [], null, {});
}

async function createQuestion(req, res) {
  const exam = await Exam.findByPk(req.params.id);
  if (!exam) return res.redirect("/professor/dashboard");

  const questionCount = await Question.count({ where: { examId: exam.id } });
  if (questionCount >= MAX_QUESTIONS_PER_EXAM) {
    return renderQuestionManager(res, exam, [{ msg: `Límite alcanzado: máximo ${MAX_QUESTIONS_PER_EXAM} preguntas por examen.` }], null, req.body, 400);
  }

  let normalized;
  try {
    normalized = normalizeQuestionInput(req.body);
  } catch (error) {
    return renderQuestionEditor(res, exam, [{ msg: error.message }], null, req.body, 400);
  }
  const question = await Question.create({
    examId: exam.id,
    prompt: normalized.prompt,
    ...legacyQuestionFields(normalized.type, normalized.configuration),
  });
  await QuestionContent.create({
    questionId: question.id,
    type: normalized.type,
    configuration: JSON.stringify(normalized.configuration),
  });
  res.redirect(`/professor/exams/${exam.id}/questions`);
}

async function renderEditQuestion(req, res) {
  const question = await Question.findByPk(req.params.qid, { include: [{ model: QuestionContent, as: "content" }] });
  if (!question) return res.redirect("/professor/dashboard");
  const exam = await Exam.findByPk(question.examId);
  if (!exam) return res.redirect("/professor/dashboard");
  const definition = getQuestionDefinition(question);
  return renderQuestionEditor(res, exam, [], question, questionFormData(question, definition));
}

async function editQuestion(req, res) {
  const question = await Question.findByPk(req.params.qid, { include: [{ model: QuestionContent, as: "content" }] });
  if (!question) return res.redirect("/professor/dashboard");
  const exam = await Exam.findByPk(question.examId);
  if (!exam) return res.redirect("/professor/dashboard");
  let normalized;
  try {
    normalized = normalizeQuestionInput(req.body);
  } catch (error) {
    return renderQuestionEditor(res, exam, [{ msg: error.message }], question, req.body, 400);
  }
  await question.update({
    prompt: normalized.prompt,
    ...legacyQuestionFields(normalized.type, normalized.configuration),
  });
  if (question.content) {
    await question.content.update({ type: normalized.type, configuration: JSON.stringify(normalized.configuration) });
  } else {
    await QuestionContent.create({ questionId: question.id, type: normalized.type, configuration: JSON.stringify(normalized.configuration) });
  }
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

async function listStudents(req, res) {
  const students = await User.findAll({
    where: { role: "estudiante" },
    order: [["createdAt", "DESC"]],
  });
  res.render("professor/students", { title: "Estudiantes", students });
}

async function viewStudent(req, res) {
  try {
    const student = await User.findByPk(req.params.id);
    if (!student || student.role !== "estudiante") return res.redirect("/professor/students");

    const results = await Result.findAll({
      where: { userId: student.id },
      include: [{ model: Exam, as: "exam" }],
      order: [["createdAt", "DESC"]],
    });
    for (const result of results) {
      try {
        result.setDataValue("pendingReview", JSON.parse(result.answers || "{}")._pendingManual?.length || 0);
      } catch (_error) {
        result.setDataValue("pendingReview", 0);
      }
    }

    res.render("professor/student-detail", { title: student.name || student.email, student, results });
  } catch (e) {
    console.error("viewStudent error:", e);
    res.status(500).send("Error al cargar datos del estudiante");
  }
}

async function viewStudentExam(req, res) {
  try {
    const student = await User.findByPk(req.params.id);
    if (!student || student.role !== "estudiante") return res.redirect("/professor/students");

    const result = await Result.findOne({
      where: { userId: student.id, examId: req.params.eid },
      include: [{ model: Exam, as: "exam", include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }] }],
    });
    if (!result) return res.redirect("/professor/students/" + student.id);

    const answers = result.answers ? JSON.parse(result.answers) : {};
    const questions = result.exam.questions.sort((a, b) => a.id - b.id);
    const manualScores = answers._manualScores || {};
    const questionViews = questions.map((question) => {
      const definition = getQuestionDefinition(question);
      let correct = null;
      if (definition.type === "multiple_choice") {
        const legacyIndex = ["A", "B", "C"].indexOf(String(answers[question.id]));
        const answerIndex = legacyIndex >= 0 ? legacyIndex : Number(answers[question.id]);
        correct = answerIndex === Number(definition.configuration.correctIndex);
      }
      if (definition.type === "true_false") correct = String(answers[question.id]) === String(definition.configuration.correctAnswer);
      if (definition.type === "fill_text") correct = definition.configuration.acceptedAnswers.some((item) => normalizeAnswer(item) === normalizeAnswer(answers[question.id]));
      if (definition.type === "fill_drag") correct = normalizeAnswer(definition.configuration.answer) === normalizeAnswer(answers[question.id]);
      if (definition.type === "crossword") correct = definition.configuration.entries.every((entry, index) => normalizeAnswer(entry.answer) === normalizeAnswer(answers[question.id]?.[index]));
      return { question, ...definition, answer: answers[question.id], correct, manualScore: manualScores[question.id] };
    });

    res.render("professor/student-exam-detail", {
      title: "Detalle del examen",
      student,
      result,
      questions,
      questionViews,
      answers,
      pendingReview: (answers._pendingManual || []).length,
    });
  } catch (e) {
    console.error("viewStudentExam error:", e.message, e.stack);
    res.status(500).send("Error al cargar detalle del examen: " + e.message);
  }
}

async function reviewStudentExam(req, res) {
  const student = await User.findByPk(req.params.id);
  if (!student || student.role !== "estudiante") return res.redirect("/professor/students");
  const result = await Result.findOne({
    where: { userId: student.id, examId: req.params.eid },
    include: [{ model: Exam, as: "exam", include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }] }],
  });
  if (!result) return res.redirect(`/professor/students/${student.id}`);

  const answers = result.answers ? JSON.parse(result.answers) : {};
  const manualScores = answers._manualScores || {};
  const pending = new Set(answers._pendingManual || []);
  for (const question of result.exam.questions) {
    if (getQuestionDefinition(question).type !== "concept") continue;
    const value = req.body[`manualScore_${question.id}`];
    if (value === "0" || value === "1") {
      manualScores[question.id] = Number(value);
      pending.delete(question.id);
    }
  }
  answers._manualScores = manualScores;
  answers._pendingManual = [...pending];
  const objectiveScore = Number.isInteger(answers._objectiveScore) ? answers._objectiveScore : result.score;
  const manualScoreTotal = Object.values(manualScores).reduce((sum, score) => sum + Number(score), 0);
  await result.update({ score: objectiveScore + manualScoreTotal, answers: JSON.stringify(answers) });
  res.redirect(`/professor/students/${student.id}/exam/${req.params.eid}`);
}

async function editStudent(req, res) {
  const student = await User.findByPk(req.params.id);
  if (!student || student.role !== "estudiante") return res.redirect("/professor/students");
  const { name, email } = req.body;
  if (email && email !== student.email) {
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.redirect("/professor/students/" + student.id + "?error=El correo ya está en uso.");
    }
  }
  await student.update({ name: name || null, email: email || student.email });
  res.redirect("/professor/students/" + student.id);
}

async function resetStudentExam(req, res) {
  const student = await User.findByPk(req.params.id);
  if (!student || student.role !== "estudiante") return res.redirect("/professor/students");
  await Result.destroy({ where: { userId: student.id, examId: req.params.eid } });
  res.redirect("/professor/students/" + student.id);
}

async function deleteStudent(req, res) {
  const student = await User.findByPk(req.params.id);
  if (!student || student.role !== "estudiante") return res.redirect("/professor/students");
  await Result.destroy({ where: { userId: student.id } });
  await student.destroy();
  res.redirect("/professor/students");
}

module.exports = { dashboard, renderImportExam, importExam, renderCreateExam, createExam, renderEditExam, editExam, deleteExam, manageQuestions, renderCreateQuestion, createQuestion, renderEditQuestion, editQuestion, deleteQuestion, listStudents, viewStudent, viewStudentExam, reviewStudentExam, editStudent, resetStudentExam, deleteStudent };
