const { Op } = require("sequelize");
const { sequelize, User, Exam, Course, CourseEnrollment, ExamAssignment } = require("../models");
const { EnrollmentError, studentByEmail, enrollStudent, inviteExam, activateAssignment } = require("../services/enrollmentService");

function notice(req, res, path, message) {
    req.session.actionNotice = { kind: "success", message };
    res.redirect(path);
}

async function studentCourses(req, res) {
    const enrollments = await CourseEnrollment.findAll({
        where: { userId: req.session.userId, status: { [Op.ne]: "rejected" } },
        include: [{ model: Course, as: "course", include: [{ model: User, as: "professor", attributes: ["name", "email"] }] }],
        order: [["createdAt", "DESC"]],
    });
    res.render("student/courses", { title: "Mis cursos", enrollments });
}

async function respondCourse(req, res) {
    const enrollment = await CourseEnrollment.findOne({ where: { id: req.params.id, userId: req.session.userId, status: "invited" } });
    if (!enrollment) throw new EnrollmentError("La invitacion al curso no esta pendiente o no te pertenece.");
    if (!["accept", "reject"].includes(req.body.action)) throw new EnrollmentError("Selecciona aceptar o rechazar.");
    await enrollment.update({ status: req.body.action === "accept" ? "active" : "rejected" });
    notice(req, res, "/student/courses", req.body.action === "accept" ? "Inscripcion al curso aceptada." : "Invitacion rechazada.");
}

async function respondExam(req, res) {
    const assignment = await ExamAssignment.findOne({
        where: { id: req.params.id, userId: req.session.userId, status: "invited" }, include: [{ model: Exam, as: "exam" }],
    });
    if (!assignment) throw new EnrollmentError("La invitacion al examen no esta pendiente o no te pertenece.");
    if (!["accept", "reject"].includes(req.body.action)) throw new EnrollmentError("Selecciona aceptar o rechazar.");
    if (req.body.action === "accept") await activateAssignment(req.session.userId, assignment.exam);
    else await assignment.update({ status: "rejected" });
    notice(req, res, "/student/exams", req.body.action === "accept" ? "Invitacion al examen aceptada." : "Invitacion rechazada.");
}

async function joinExam(req, res) {
    const now = Date.now();
    const attempts = req.session.codeAttempts || { count: 0, until: now + 60000 };
    if (attempts.until <= now) { attempts.count = 0; attempts.until = now + 60000; }
    req.session.codeAttempts = attempts;
    if (++attempts.count > 10) return res.status(429).render("errors/generic", { title: "Demasiados intentos", message: "Espera un minuto antes de probar otro codigo." });
    const code = String(req.body.code || "").trim().toUpperCase();
    const exam = /^[A-F0-9]{12}$/.test(code) ? await Exam.findOne({ where: { joinCode: code } }) : null;
    if (!exam) throw new EnrollmentError("El codigo no es valido o ha sido desactivado.");
    await activateAssignment(req.session.userId, exam);
    notice(req, res, "/student/exams", "Te has unido al examen.");
}

async function courseMembers(req, res) {
    const enrollments = await CourseEnrollment.findAll({
        where: { courseId: req.course.id, status: { [Op.ne]: "rejected" } },
        include: [{ model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]],
    });
    const professor = await User.findByPk(req.course.professorId, { attributes: ["id", "name", "email"] });
    res.render("professor/course-members", { title: req.course.name, course: req.course, enrollments, professor });
}

async function setMembersVisibility(req, res) {
    await req.course.update({ membersVisible: req.body.membersVisible === "on" });
    notice(req, res, `/professor/courses/${req.course.id}/members`, "Visibilidad de integrantes actualizada.");
}

async function studentMembers(req, res) {
    const enrollments = await CourseEnrollment.findAll({
        where: { courseId: req.course.id, status: "active" },
        include: [{ model: User, as: "student", where: { role: "estudiante" }, attributes: ["id", "name"] }],
        order: [[{ model: User, as: "student" }, "name", "ASC"]],
    });
    const professor = await User.findByPk(req.course.professorId, { attributes: ["id", "name"] });
    res.render("student/course-members", { title: req.course.name, course: req.course, enrollments, professor });
}

async function inviteCourse(req, res) {
    const student = await studentByEmail(req.body.email);
    await enrollStudent(student.id, req.course.id, "invited");
    notice(req, res, `/professor/courses/${req.course.id}/members`, "Invitacion al curso enviada.");
}

async function removeMember(req, res) {
    const enrollment = await CourseEnrollment.findOne({ where: { id: req.params.enrollmentId, courseId: req.course.id } });
    if (!enrollment) throw new EnrollmentError("La inscripcion no pertenece a este curso.");
    const exams = await Exam.findAll({ where: { courseId: req.course.id }, attributes: ["id"] });
    await sequelize.transaction(async transaction => {
        await ExamAssignment.destroy({ where: { userId: enrollment.userId, examId: { [Op.in]: exams.map(exam => exam.id) } }, transaction });
        await enrollment.destroy({ transaction });
    });
    notice(req, res, `/professor/courses/${req.course.id}/members`, "Inscripcion retirada. Los resultados se conservaron.");
}

async function inviteStudentExam(req, res) {
    await inviteExam(Number(req.body.userId), req.params.id);
    notice(req, res, `/professor/exams/${req.params.id}/access`, "Invitacion al examen enviada.");
}

async function removeExamAccess(req, res) {
    await ExamAssignment.destroy({ where: { examId: req.params.id, userId: req.body.userId } });
    notice(req, res, `/professor/exams/${req.params.id}/access`, "Acceso al examen retirado. Los resultados se conservaron.");
}

module.exports = { studentCourses, respondCourse, respondExam, joinExam, courseMembers, inviteCourse, removeMember, inviteStudentExam, removeExamAccess, notice, setMembersVisibility, studentMembers };