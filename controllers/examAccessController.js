const bcrypt = require("bcryptjs");
const { randomBytes } = require("node:crypto");
const { User, Exam, Question, Course, CourseEnrollment, ExamAssignment, ExamSecurityEvent, ExamAttempt, Result, sequelize } = require("../models");
const { startAttempt, activityView } = require("../services/examActivity");
const { EnrollmentError } = require("../services/enrollmentService");
const { notice } = require("./enrollmentController");

const eventTypes = { blur: "Cambio de ventana", hidden: "Examen oculto", fullscreen_exit: "Salida de pantalla completa", navigation: "Salida del examen" };

async function accessPage(req, res) {
    const members = await CourseEnrollment.findAll({ where: { courseId: req.course.id, status: "active" }, include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }] });
    const assignments = await ExamAssignment.findAll({ where: { examId: req.exam.id }, include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }] });
    res.render("professor/exam-access", { title: req.exam.title, exam: req.exam, course: req.course, members, assignments });
}

async function saveSecurity(req, res) {
    const mode = req.body.securityMode;
    if (!["none", "locked", "monitored"].includes(mode)) throw new EnrollmentError("Selecciona un modo de seguridad valido.");
    const values = { securityMode: mode, securityRevision: sequelize.literal('"securityRevision" + 1') };
    if (req.body.password) {
        if (typeof req.body.password !== "string" || req.body.password.length < 8 || Buffer.byteLength(req.body.password) > 72) throw new EnrollmentError("La contrasena debe tener al menos 8 caracteres y hasta 72 bytes.");
        values.passwordHash = await bcrypt.hash(req.body.password, 10);
    }
    if (req.body.removePassword === "on") values.passwordHash = null;
    await req.exam.update(values);
    notice(req, res, `/professor/exams/${req.exam.id}/access`, "Seguridad actualizada. Los estudiantes deberan volver a iniciar el examen.");
}

async function generateCode(req, res) {
    if (!["generate", "disable"].includes(req.body.action)) throw new EnrollmentError("Selecciona generar o desactivar el codigo.");
    await req.exam.update({ joinCode: req.body.action === "generate" ? randomBytes(6).toString("hex").toUpperCase() : null });
    notice(req, res, `/professor/exams/${req.exam.id}/access`, req.body.action === "generate" ? "Codigo generado. El codigo anterior ya no funciona." : "Codigo desactivado.");
}

async function beginExam(req, res) {
    const exam = req.exam;
    if (await Result.findOne({ where: { userId: req.session.userId, examId: exam.id } })) return res.redirect("/student/exams");
    if (!await Question.count({ where: { examId: exam.id } })) return res.status(400).render("errors/generic", { title: "Examen vacio", message: "Este examen todavia no tiene preguntas." });
    const now = Date.now();
    if (!req.session.passwordAttempts) req.session.passwordAttempts = {};
    let attempts = req.session.passwordAttempts[exam.id];
    if (!attempts || attempts.until <= now) attempts = { count: 0, until: now + 60000 };
    req.session.passwordAttempts[exam.id] = attempts;
    if (attempts.count >= 5) return res.status(429).render("errors/generic", { title: "Demasiados intentos", message: "Espera un minuto para volver a verificar la contrasena." });
    if (exam.passwordHash && (typeof req.body.password !== "string" || Buffer.byteLength(req.body.password) > 72 || !await bcrypt.compare(req.body.password, exam.passwordHash))) {
        attempts.count += 1;
        res.locals.startErrors = ["La contrasena del examen no es correcta."];
        return require("./studentController").renderStart(req, res.status(403));
    }
    delete req.session.passwordAttempts[exam.id];
    const grant = { revision: exam.securityRevision, token: randomBytes(32).toString("hex"), expiresAt: now + 12 * 60 * 60 * 1000 };
    await startAttempt(req.session.userId, exam.id, grant.token);
    if (!req.session.examAccess) req.session.examAccess = {};
    req.session.examAccess[exam.id] = grant;
    res.redirect(`/student/exams/${exam.id}/take`);
}

async function heartbeat(req, res) {
    const grant = req.session.examAccess[req.exam.id];
    if (req.body.token !== grant.token || !["heartbeat", "leave"].includes(req.body.action)) return res.sendStatus(400);
    const [updated] = await ExamAttempt.update({ lastSeenAt: new Date(), connected: req.body.action === "heartbeat" }, {
        where: { userId: req.session.userId, examId: req.exam.id, token: grant.token, finishedAt: null },
    });
    res.sendStatus(updated ? 204 : 409);
}

async function activity(req, res) {
    const attempts = await ExamAttempt.findAll({
        where: { examId: req.exam.id, finishedAt: null },
        attributes: ["startedAt", "lastSeenAt", "connected"],
        include: [{ model: User, as: "student", where: { role: "estudiante" }, attributes: ["id", "name", "email"],
            include: [{ model: CourseEnrollment, as: "enrollments", attributes: [], where: { courseId: req.course.id, status: "active" }, required: true },
                { model: ExamAssignment, as: "assignments", attributes: [], where: { examId: req.exam.id, status: "active" }, required: true }] }],
        order: [["startedAt", "ASC"]],
    });
    const now = Date.now();
    res.set("Cache-Control", "no-store");
    res.json({ updatedAt: new Date(now).toISOString(), attempts: attempts.map(attempt => activityView(attempt, now)) });
}

async function securityEvent(req, res) {
    const grant = req.session.examAccess[req.exam.id];
    if (req.exam.securityMode === "none") return res.sendStatus(204);
    if (req.body.token !== grant.token || !Object.hasOwn(eventTypes, req.body.type) || !/^[a-f0-9-]{36}$/i.test(String(req.body.eventId || ""))) return res.sendStatus(400);
    const now = Date.now();
    const window = req.session.securityEventWindow || { count: 0, until: now + 60000 };
    if (window.until <= now) { window.count = 0; window.until = now + 60000; }
    req.session.securityEventWindow = window;
    if (++window.count > 30) return res.sendStatus(429);
    await ExamSecurityEvent.findCreateFind({
        where: { userId: req.session.userId, examId: req.exam.id, eventId: req.body.eventId }, defaults: { type: req.body.type },
    });
    res.sendStatus(204);
}

function notificationScope(userId) {
    return [{ model: Exam, as: "exam", required: true, include: [{ model: Course, as: "course", where: { professorId: userId }, required: true }] }];
}

async function notifications(req, res) {
    const events = await ExamSecurityEvent.findAll({ include: [...notificationScope(req.session.userId), { model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]], limit: 100 });
    res.render("professor/notifications", { title: "Notificaciones", events, eventTypes });
}

async function notificationCount(req, res) {
    const unread = await ExamSecurityEvent.count({ where: { readAt: null }, include: notificationScope(req.session.userId) });
    res.json({ unread });
}

async function readNotification(req, res) {
    const event = await ExamSecurityEvent.findOne({ where: { id: req.params.id }, include: notificationScope(req.session.userId) });
    if (!event) throw new EnrollmentError("La notificacion no pertenece a tus cursos.");
    await event.update({ readAt: new Date() });
    res.redirect("/professor/notifications");
}

module.exports = { accessPage, saveSecurity, generateCode, beginExam, securityEvent, notifications, notificationCount, readNotification, eventTypes, heartbeat, activity };