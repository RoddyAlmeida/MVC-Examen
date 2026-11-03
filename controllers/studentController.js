const { Exam, Question, QuestionContent, Result } = require("../models");
const { getQuestionDefinition, gradeQuestion } = require("../services/questionService");
const { buildCrosswordLayout } = require("../services/crosswordLayout");

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

async function listExams(req, res) {
    const exams = await Exam.findAll({ order: [["createdAt", "DESC"]] });
    const myResults = await Result.findAll({
        where: { userId: req.session.userId },
        attributes: ["examId", "score", "total", "answers"],
    });
    const resultsMap = {};
    for (const result of myResults) {
        let pendingReview = 0;
        try {
            pendingReview = JSON.parse(result.answers || "{}")._pendingManual?.length || 0;
        } catch (_error) { }
        resultsMap[result.examId] = { score: result.score, total: result.total, pendingReview };
    }
    res.render("student/exams", {
        title: "Exámenes disponibles",
        exams,
        resultsMap,
        userName: req.session.userName || "Estudiante",
    });
}

async function renderStart(req, res) {
    const exam = await Exam.findOne({
        where: { id: req.params.id },
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
    });
    if (!exam) {
        return res.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    if (!exam.questions.length) {
        return res.status(400).render("errors/generic", { title: "Examen vacío", message: "Este examen todavía no tiene preguntas." });
    }
    const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
    if (existing) return res.redirect("/student/exams");
    const totalQuestions = exam.questions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    res.render("exams/start", {
        title: "Sistema de examen accesible",
        exam,
        totalQuestions,
        totalPages,
        maxItems: MAX_ITEMS_PER_SCREEN,
    });
}

async function renderExam(req, res) {
    const exam = await Exam.findOne({
        where: { id: req.params.id },
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
        order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
    });
    if (!exam) {
        return res.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
    if (existing) return res.redirect("/student/exams");

    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    const currentPage = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages || 1);
    const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
    const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
    res.render("exams/take", {
        title: "Resolver examen",
        exam,
        questions,
        questionViews: questionViews(questions),
        currentPage,
        totalPages,
        totalQuestions,
        errors: [],
        oldAnswers: req.session.examAnswers || {},
    });
}

async function submitExam(req, res) {
    const exam = await Exam.findOne({
        where: { id: req.params.id },
        include: [{ model: Question, as: "questions", include: [{ model: QuestionContent, as: "content" }] }],
        order: [[{ model: Question, as: "questions" }, "id", "ASC"]],
    });
    if (!exam) {
        return res.status(404).render("errors/generic", { title: "Examen no encontrado", message: "El examen que buscas no existe." });
    }
    const existing = await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } });
    if (existing) return res.redirect("/student/exams");

    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    const currentPage = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages || 1);
    const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
    const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
    const errors = [];

    for (const [index, question] of questions.entries()) {
        const answer = extractAnswer(question, req.body);
        const questionNumber = offset + index + 1;
        if (!answerIsComplete(question, answer)) {
            errors.push({ msg: `Debes responder la pregunta ${questionNumber}.` });
        } else if (!answerIsValid(question, answer)) {
            errors.push({ msg: `La respuesta ${questionNumber} no es válida.` });
        }
    }

    if (errors.length) {
        const oldAnswers = { ...(req.session.examAnswers || {}), ...req.body };
        return res.status(400).render("exams/take", {
            title: "Resolver examen",
            exam,
            questions,
            questionViews: questionViews(questions),
            currentPage,
            totalPages,
            totalQuestions,
            errors,
            oldAnswers,
        });
    }

    if (!req.session.examAnswers) req.session.examAnswers = {};
    Object.assign(req.session.examAnswers, req.body);
    if (currentPage < totalPages) return res.redirect(`/student/exams/${exam.id}/take?page=${currentPage + 1}`);

    const submittedAnswers = {};
    const manualQuestionIds = [];
    let objectiveScore = 0;
    for (const question of allQuestions) {
        const answer = extractAnswer(question, req.session.examAnswers);
        submittedAnswers[question.id] = answer;
        const grade = gradeQuestion(question, answer);
        if (grade === null) manualQuestionIds.push(question.id);
        else if (grade) objectiveScore += 1;
    }
    submittedAnswers._objectiveScore = objectiveScore;
    submittedAnswers._manualScores = {};
    submittedAnswers._pendingManual = manualQuestionIds;
    await Result.create({
        userId: req.session.userId,
        examId: exam.id,
        score: objectiveScore,
        total: totalQuestions,
        answers: JSON.stringify(submittedAnswers),
    });
    delete req.session.examAnswers;
    res.render("exams/result", {
        title: "Resultados",
        score: objectiveScore,
        total: totalQuestions,
        examId: exam.id,
        pendingReview: manualQuestionIds.length,
    });
}

module.exports = { listExams, renderStart, renderExam, submitExam };
