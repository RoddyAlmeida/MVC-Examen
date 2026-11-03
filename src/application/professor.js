const { getQuestionDefinition, legacyQuestionFields, normalizeAnswer, normalizeQuestionInput } = require("../domain/questions");
const { assertPort, contracts } = require("../ports");

function createProfessorUseCases({ data, unitOfWork, importQuestions }) {
  assertPort("professor", data, contracts.professor);
  const MAX_QUESTIONS_PER_EXAM = 100;

  async function dashboard(context, output) {
    const courses = await data.listOwnedCourses(context);
    const course = context.query?.courseId ? courses.find(item => item.id === Number(context.query.courseId)) : courses[0] || null;
    if (context.query?.courseId && !course) return output.status(403).render("errors/generic", { title: "Acceso denegado", message: "El curso seleccionado no esta asignado a tu cuenta." });
    const exams = course ? await data.listCourseExams(course, context) : [];
    output.render("professor/dashboard", { title: course ? course.name : "Mis cursos", exams, course, courses });
  }

  function renderImportExamPage(output, errors = [], formData = {}, status = 200) {
    return output.status(status).render("professor/exam-import", { title: "Importar examen", errors, formData, courses: output.locals.courses || [] });
  }

  function renderImportExam(context, output) {
    return renderImportExamPage(output, [], { courseId: context.course?.id || "" });
  }

  async function importExam(context, output) {
    try {
      if (!context.file || !context.file.originalname.toLowerCase().endsWith(".zip")) {
        throw new Error("Selecciona un paquete QTI 3 válido en formato .zip.");
      }
      const examData = await importQuestions(context.file.buffer);
      const exam = await unitOfWork.run(async (transaction) => {
        const createdExam = await data.createImportedExam({ title: examData.title, instructions: examData.instructions, creatorId: context.session.userId, courseId: context.course.id }, transaction);
        for (const questionData of examData.questions) {
          const question = await data.createImportedQuestion({
            examId: createdExam.id,
            prompt: questionData.prompt,
            ...legacyQuestionFields(questionData.type, questionData.configuration),
          }, transaction);
          await data.createImportedContent({
            questionId: question.id,
            type: questionData.type,
            configuration: JSON.stringify(questionData.configuration),
          }, transaction);
        }
        return createdExam;
      });
      output.redirect(`/professor/exams/${exam.id}/questions`);
    } catch (error) {
      return renderImportExamPage(output, [{ msg: error.message }], context.body || {}, 400);
    }
  }

  async function renderCreateExam(context, output) {
    output.render("professor/exam-form", { title: "Crear examen", exam: null, errors: [], course: context.course, courses: context.courses });
  }

  function examTimeLimit(body, errors) {
    if (body.timerEnabled !== "on") return null;
    const minutes = Number(body.timeLimitMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 2147483647) {
      errors.push({ msg: "El temporizador debe tener una duracion entera de al menos 5 minutos." });
    }
    return minutes;
  }

  async function createExam(context, output) {
    const { title, instructions } = context.body;
    const errors = [];
    const timeLimitMinutes = examTimeLimit(context.body, errors);
    if (!title || !title.trim()) errors.push({ msg: "El título es obligatorio." });
    if (!instructions || !instructions.trim()) errors.push({ msg: "Las instrucciones son obligatorias." });
    if (errors.length > 0) {
      return output.status(400).render("professor/exam-form", { title: "Crear examen", exam: context.body, errors, course: context.course, courses: context.courses });
    }
    await data.createExam({ title: title.trim(), instructions: instructions.trim(), timeLimitMinutes, leaderboardEnabled: context.body.leaderboardEnabled === "on", creatorId: context.session.userId, courseId: context.course.id });
    output.redirect(`/professor/dashboard?courseId=${context.course.id}`);
  }

  async function renderEditExam(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) return output.redirect("/professor/dashboard");
    output.render("professor/exam-form", { title: "Editar examen", exam, errors: [], course: context.course });
  }

  async function editExam(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) return output.redirect("/professor/dashboard");
    const { title, instructions } = context.body;
    const errors = [];
    const timeLimitMinutes = examTimeLimit(context.body, errors);
    if (!title || !title.trim()) errors.push({ msg: "El título es obligatorio." });
    if (!instructions || !instructions.trim()) errors.push({ msg: "Las instrucciones son obligatorias." });
    if (errors.length > 0) {
      return output.status(400).render("professor/exam-form", { title: "Editar examen", exam: { ...context.body, id: exam.id }, errors, course: context.course });
    }
    await data.update(exam, { title: title.trim(), instructions: instructions.trim(), timeLimitMinutes, leaderboardEnabled: context.body.leaderboardEnabled === "on" });
    output.redirect(`/professor/dashboard?courseId=${context.course.id}`);
  }

  async function deleteExam(context, output) {
    const exam = await data.findExamById(context);
    if (exam) await data.destroy(exam);
    output.redirect(`/professor/dashboard?courseId=${context.course.id}`);
  }

  async function findQuestions(examId) {
    return data.listQuestions(examId);
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

  async function renderQuestionManager(output, exam, errors, editingQuestion, formData, status = 200) {
    return output.status(status).render("professor/question-form", {
      title: "Preguntas",
      exam,
      questions: await findQuestions(exam.id),
      errors,
    });
  }

  function renderQuestionEditor(output, exam, errors, editingQuestion, formData, status = 200) {
    return output.status(status).render("professor/question-editor", {
      title: editingQuestion ? "Editar pregunta" : "Agregar pregunta",
      exam,
      errors,
      editingQuestion,
      formData,
    });
  }

  async function manageQuestions(context, output) {
    const exam = await data.findExamWithQuestions(context);
    if (!exam) return output.redirect("/professor/dashboard");
    output.render("professor/question-form", { title: "Preguntas", exam, questions: exam.questions || [], errors: [], editingQuestion: null, formData: {} });
  }

  async function renderCreateQuestion(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) return output.redirect("/professor/dashboard");
    if (await data.countQuestions(exam) >= MAX_QUESTIONS_PER_EXAM) {
      return renderQuestionManager(output, exam, [{ msg: `Límite alcanzado: máximo ${MAX_QUESTIONS_PER_EXAM} preguntas por examen.` }], null, {}, 400);
    }
    return renderQuestionEditor(output, exam, [], null, {});
  }

  async function createQuestion(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) return output.redirect("/professor/dashboard");

    const questionCount = await data.countQuestions(exam);
    if (questionCount >= MAX_QUESTIONS_PER_EXAM) {
      return renderQuestionManager(output, exam, [{ msg: `Límite alcanzado: máximo ${MAX_QUESTIONS_PER_EXAM} preguntas por examen.` }], null, context.body, 400);
    }

    let normalized;
    try {
      normalized = normalizeQuestionInput(context.body);
    } catch (error) {
      return renderQuestionEditor(output, exam, [{ msg: error.message }], null, context.body, 400);
    }
    const question = await data.createQuestion({
      examId: exam.id,
      prompt: normalized.prompt,
      ...legacyQuestionFields(normalized.type, normalized.configuration),
    });
    await data.createContent({
      questionId: question.id,
      type: normalized.type,
      configuration: JSON.stringify(normalized.configuration),
    });
    output.redirect(`/professor/exams/${exam.id}/questions`);
  }

  async function renderEditQuestion(context, output) {
    const question = await data.findQuestionWithContent(context);
    if (!question) return output.redirect("/professor/dashboard");
    const exam = await data.findQuestionExam(question);
    if (!exam) return output.redirect("/professor/dashboard");
    const definition = getQuestionDefinition(question);
    return renderQuestionEditor(output, exam, [], question, questionFormData(question, definition));
  }

  async function editQuestion(context, output) {
    const question = await data.findQuestionWithContent(context);
    if (!question) return output.redirect("/professor/dashboard");
    const exam = await data.findQuestionExam(question);
    if (!exam) return output.redirect("/professor/dashboard");
    let normalized;
    try {
      normalized = normalizeQuestionInput(context.body);
    } catch (error) {
      return renderQuestionEditor(output, exam, [{ msg: error.message }], question, context.body, 400);
    }
    await data.update(question, {
      prompt: normalized.prompt,
      ...legacyQuestionFields(normalized.type, normalized.configuration),
    });
    if (question.content) {
      await data.update(question.content, { type: normalized.type, configuration: JSON.stringify(normalized.configuration) });
    } else {
      await data.createContent({ questionId: question.id, type: normalized.type, configuration: JSON.stringify(normalized.configuration) });
    }
    output.redirect(`/professor/exams/${question.examId}/questions`);
  }

  async function deleteQuestion(context, output) {
    const question = await data.findQuestionById(context);
    if (question) {
      const examId = question.examId;
      await data.destroy(question);
      output.redirect(`/professor/exams/${examId}/questions`);
    } else {
      output.redirect("/professor/dashboard");
    }
  }

  async function listStudents(context, output) {
    const students = await data.listTeachingStudents(context);
    output.render("professor/students", { title: "Estudiantes", students });
  }

  async function viewStudent(context, output) {
    try {
      const student = await data.findStudentById(context);
      if (!student || student.role !== "estudiante") return output.redirect("/professor/students");

      const results = await data.listStudentResults(student, context);
      for (const result of results) {
        try {
          result["pendingReview"] = JSON.parse(result.answers || "{}")._pendingManual?.length || 0;
        } catch (_error) {
          result["pendingReview"] = 0;
        }
      }

      output.render("professor/student-detail", { title: student.name || student.email, student, results });
    } catch (e) {
      console.error("viewStudent error:", e);
      output.status(500).send("Error al cargar datos del estudiante");
    }
  }

  async function viewStudentExam(context, output) {
    try {
      const student = await data.findStudentById(context);
      if (!student || student.role !== "estudiante") return output.redirect("/professor/students");

      const result = await data.findStudentExamResult(student, context);
      if (!result) return output.redirect("/professor/students/" + student.id);

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

      output.render("professor/student-exam-detail", {
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
      output.status(500).send("Error al cargar detalle del examen: " + e.message);
    }
  }

  async function reviewStudentExam(context, output) {
    const student = await data.findStudentById(context);
    if (!student || student.role !== "estudiante") return output.redirect("/professor/students");
    const result = await data.findStudentExamResult(student, context);
    if (!result) return output.redirect(`/professor/students/${student.id}`);

    const answers = result.answers ? JSON.parse(result.answers) : {};
    const manualScores = answers._manualScores || {};
    const pending = new Set(answers._pendingManual || []);
    for (const question of result.exam.questions) {
      if (getQuestionDefinition(question).type !== "concept") continue;
      const value = context.body[`manualScore_${question.id}`];
      if (value === "0" || value === "1") {
        manualScores[question.id] = Number(value);
        pending.delete(question.id);
      }
    }
    answers._manualScores = manualScores;
    answers._pendingManual = [...pending];
    const objectiveScore = Number.isInteger(answers._objectiveScore) ? answers._objectiveScore : result.score;
    const manualScoreTotal = Object.values(manualScores).reduce((sum, score) => sum + Number(score), 0);
    await data.update(result, { score: objectiveScore + manualScoreTotal, answers: JSON.stringify(answers) });
    output.redirect(`/professor/students/${student.id}/exam/${context.params.eid}`);
  }

  async function resetStudentExam(context, output) {
    const student = await data.findStudentById(context);
    if (!student || student.role !== "estudiante") return output.redirect("/professor/students");
    await unitOfWork.run(async transaction => {
      await data.removeStudentExamResult(student, context, transaction);
      await data.removeStudentExamAttempt(student, context, transaction);
    });
    output.redirect("/professor/students/" + student.id);
  }

  return { dashboard, renderImportExam, importExam, renderCreateExam, createExam, renderEditExam, editExam, deleteExam, manageQuestions, renderCreateQuestion, createQuestion, renderEditQuestion, editQuestion, deleteQuestion, listStudents, viewStudent, viewStudentExam, reviewStudentExam, resetStudentExam };
}

module.exports = { createProfessorUseCases };
