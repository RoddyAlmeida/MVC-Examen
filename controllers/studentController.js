const { sequelize, Exam, Question, QuestionContent, Result, ExamAssignment, ExamAttempt, Course, CourseEnrollment } = require("../models");
const { getQuestionDefinition, gradeQuestion } = require("../services/questionService");
const { buildCrosswordLayout } = require("../services/crosswordLayout");
const { examTiming } = require("../services/examActivity");

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
    const exams = await Exam.findAll({
        attributes: { exclude: ["passwordHash", "joinCode"] },
        include: [{ model: ExamAssignment, as: "assignments", where: { userId: req.session.userId, status: "active" }, required: true },
            { model: Course, as: "course", required: true, include: [{ model: CourseEnrollment, as: "enrollments", where: { userId: req.session.userId, status: "active" }, required: true }] }],
        order: [["createdAt", "DESC"]],
    });
    const myResults = await Result.findAll({
        where: { userId: req.session.userId },
        attributes: ["examId", "score", "total", "answers"],
    });
    const resultsMap = {};
    const invitations = await ExamAssignment.findAll({ where: { userId: req.session.userId, status: "invited" }, include: [{ model: Exam, as: "exam", attributes: ["id", "title", "courseId"], include: [{ model: Course, as: "course" }] }] });
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
        invitations,
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
        startErrors: res.locals.startErrors || [],
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

    const timing = await examTiming(exam, req.session.userId);
    if (timing?.expired) return finishExam(req, res, exam);
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
        timing,
        errors: [],
        oldAnswers: req.session.examAnswersByExam?.[exam.id] || {},
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

    const timing = await examTiming(exam, req.session.userId);
    if (timing?.expired) return finishExam(req, res, exam);
    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const totalPages = Math.ceil(totalQuestions / MAX_ITEMS_PER_SCREEN);
    const currentPage = Math.min(Math.max(parseInt(req.query.page) || 1, 1), totalPages || 1);
    const offset = (currentPage - 1) * MAX_ITEMS_PER_SCREEN;
    const questions = allQuestions.slice(offset, offset + MAX_ITEMS_PER_SCREEN);
    const errors = [];

    if (timing && req.body._saveAnswers === "on") {
        savePageAnswers(req, exam, questions);
        return res.json({ remainingMs: Math.max(0, timing.expiresAt - Date.now()) });
    }

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
        const oldAnswers = { ...(req.session.examAnswersByExam?.[exam.id] || {}), ...req.body };
        return res.status(400).render("exams/take", {
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

    savePageAnswers(req, exam, questions);
    if (currentPage < totalPages) return res.redirect(`/student/exams/${exam.id}/take?page=${currentPage + 1}`);

    return finishExam(req, res, exam);
}

function savePageAnswers(req, exam, questions) {
    if (!req.session.examAnswersByExam) req.session.examAnswersByExam = {};
    if (!req.session.examAnswersByExam[exam.id]) req.session.examAnswersByExam[exam.id] = {};
    const answers = req.session.examAnswersByExam[exam.id];
    for (const question of questions) {
        const key = `question_${question.id}`;
        for (const field of Object.keys(answers)) {
            if (field === key || field.startsWith(`${key}_cell_`)) delete answers[field];
        }
        for (const [field, value] of Object.entries(req.body)) {
            if ((field === key || field.startsWith(`${key}_cell_`)) && typeof value === "string") answers[field] = value;
        }
    }
}

async function finishExam(req, res, exam) {
    const allQuestions = exam.questions;
    const totalQuestions = allQuestions.length;
    const savedAnswers = req.session.examAnswersByExam?.[exam.id] || {};
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
    await sequelize.transaction(async transaction => {
        await Result.create({
            userId: req.session.userId,
            examId: exam.id,
            score: objectiveScore,
            total: totalQuestions,
            answers: JSON.stringify(submittedAnswers),
        }, { transaction });
        await ExamAttempt.update({ finishedAt: new Date(), connected: false }, {
            where: { userId: req.session.userId, examId: exam.id }, transaction,
        });
    });
    if (req.session.examAnswersByExam) delete req.session.examAnswersByExam[exam.id];
    if (req.session.examAccess) delete req.session.examAccess[exam.id];
    if (req.body?._saveAnswers === "on") return res.json({ finished: true, redirect: "/student/exams" });
    res.render("exams/result", {
        title: "Resultados",
        score: objectiveScore,
        total: totalQuestions,
        examId: exam.id,
        leaderboardEnabled: exam.leaderboardEnabled,
        pendingReview: manualQuestionIds.length,
    });
}

module.exports = { listExams, renderStart, renderExam, submitExam };
