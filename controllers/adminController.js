const bcrypt = require("bcryptjs");
const { sequelize, User, Exam, Question, QuestionContent, Result, ExamAssignment, Course } = require("../models");
const { calculateMetrics, pendingReview } = require("../services/adminMetrics");

const roles = { estudiante: "Estudiante", profesor: "Profesor", administrador: "Administrador" };

class AdminError extends Error { }

function validateAccount(body, creating = true) {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = body.role;
    if (!name || name.length > 120) throw new AdminError("Indica un nombre de hasta 120 caracteres.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AdminError("Indica un correo valido.");
    if (!Object.hasOwn(roles, role)) throw new AdminError("Selecciona un rol valido.");
    const password = body.password;
    if ((creating || password) && (typeof password !== "string" || password.length < 8 || password.length > 72)) {
        throw new AdminError("La contrasena debe tener entre 8 y 72 caracteres.");
    }
    return { name, email, role };
}

async function loadData() {
    const [users, exams, assignments, results, courses] = await Promise.all([
        User.findAll({ attributes: { exclude: ["password"] }, order: [["name", "ASC"]] }),
        Exam.findAll({
            include: [{ model: User, as: "creator", attributes: ["id", "name", "email"] },
            { model: Course, as: "course" },
            { model: Question, as: "questions", attributes: ["id"] }], order: [["createdAt", "DESC"]]
        }),
        ExamAssignment.findAll({
            include: [{ model: Exam, as: "exam" },
            { model: User, as: "student", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]]
        }),
        Result.findAll({
            include: [{ model: Exam, as: "exam" },
            { model: User, as: "user", attributes: ["id", "name", "email"] }], order: [["createdAt", "DESC"]]
        }),
        Course.findAll({
            include: [{ model: User, as: "professor", attributes: ["id", "name", "email"] },
            { model: Exam, as: "exams", attributes: ["id"] }], order: [["name", "ASC"]]
        }),
    ]);
    return { users, exams, assignments, results, courses, roles, pendingReview };
}

async function listCourses(req, res) {
    const courses = await Course.findAll({
        include: [{ model: User, as: "professor", attributes: ["id", "name", "email"] },
        { model: Exam, as: "exams", attributes: ["id"] }], order: [["name", "ASC"]],
    });
    const professors = await User.findAll({ where: { role: "profesor" }, attributes: ["id", "name", "email"], order: [["name", "ASC"]] });
    res.render("admin/courses", { title: "Cursos", active: "courses", courses, professors });
}

async function courseData(body, courseId = null) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 200) throw new AdminError("Indica un nombre de curso de hasta 200 caracteres.");
    let professorId = null;
    if (body.professorId) {
        const professor = await findUser(body.professorId);
        if (professor.role !== "profesor") throw new AdminError("El curso solo puede asignarse a un profesor.");
        professorId = professor.id;
    } else if (!courseId) {
        throw new AdminError("Selecciona un profesor para el nuevo curso.");
    }
    return { name, professorId };
}

async function createCourse(req, res) {
    await Course.create(await courseData(req.body));
    notice(req, res, "/admin/courses", "Curso creado y asignado.");
}

async function updateCourse(req, res) {
    const course = await Course.findByPk(req.params.id);
    if (!course) throw new AdminError("El curso no existe.");
    const data = await courseData(req.body, course.id);
    await sequelize.transaction(async (transaction) => {
        await course.update(data, { transaction });
        await Exam.update({ creatorId: data.professorId }, { where: { courseId: course.id }, transaction });
    });
    notice(req, res, "/admin/courses", "Curso actualizado.");
}

async function deleteCourse(req, res) {
    const course = await Course.findByPk(req.params.id);
    if (!course) throw new AdminError("El curso no existe.");
    if (await Exam.count({ where: { courseId: course.id } })) throw new AdminError("No puedes eliminar un curso que tiene examenes.");
    await course.destroy();
    notice(req, res, "/admin/courses", "Curso eliminado.");
}

async function dashboard(req, res) {
    const data = await loadData();
    res.render("admin/dashboard", { ...data, title: "Resumen", active: "dashboard", metrics: calculateMetrics(data) });
}

async function listUsers(req, res) {
    const data = await loadData();
    const query = String(req.query.q || "").trim().toLowerCase();
    const role = Object.hasOwn(roles, req.query.role) ? req.query.role : "";
    const users = data.users.filter((user) => (!role || user.role === role) && `${user.name} ${user.email}`.toLowerCase().includes(query));
    res.render("admin/users", { ...data, users, title: "Usuarios", active: "users", query, role });
}

async function userDetail(req, res) {
    const data = await loadData();
    const user = data.users.find((item) => item.id === Number(req.params.id));
    if (!user) return res.status(404).render("errors/generic", { title: "Usuario no encontrado", message: "La cuenta no existe." });
    res.render("admin/user-detail", { ...data, user, title: user.name || user.email, active: "users" });
}

async function listExams(req, res) {
    const data = await loadData();
    const query = String(req.query.q || "").trim().toLowerCase();
    const exams = data.exams.filter((exam) => `${exam.title} ${exam.creator?.name || ""} ${exam.course?.name || ""}`.toLowerCase().includes(query));
    res.render("admin/exams", { ...data, exams, title: "Examenes", active: "exams", query });
}

async function createUser(req, res) {
    const account = validateAccount(req.body);
    const password = await bcrypt.hash(req.body.password, 10);
    const user = await User.create({ ...account, password });
    notice(req, res, `/admin/users/${user.id}`, "Usuario creado.");
}

async function findUser(id) {
    const user = await User.findByPk(id);
    if (!user) throw new AdminError("El usuario no existe.");
    return user;
}

async function protectAdministrator(user, session, nextRole) {
    if (user.role !== "administrador" || nextRole === "administrador") return;
    if (user.id === session.userId) throw new AdminError("No puedes eliminar tu cuenta ni quitarte el rol de administrador.");
    if (await User.count({ where: { role: "administrador" } }) <= 1) throw new AdminError("Debe existir al menos un administrador.");
}

async function updateUser(req, res) {
    const user = await findUser(req.params.id);
    const account = validateAccount(req.body, false);
    await protectAdministrator(user, req.session, account.role);
    if (req.body.password) account.password = await bcrypt.hash(req.body.password, 10);
    await user.update(account);
    if (account.role !== "estudiante") await ExamAssignment.destroy({ where: { userId: user.id } });
    if (account.role !== "profesor") {
        await Course.update({ professorId: null }, { where: { professorId: user.id } });
        await Exam.update({ creatorId: null }, { where: { creatorId: user.id } });
    }
    notice(req, res, `/admin/users/${user.id}`, "Cuenta actualizada.");
}

async function deleteUser(req, res) {
    const user = await findUser(req.params.id);
    await protectAdministrator(user, req.session, null);
    await ExamAssignment.destroy({ where: { userId: user.id } });
    await Result.destroy({ where: { userId: user.id } });
    await Course.update({ professorId: null }, { where: { professorId: user.id } });
    await Exam.update({ creatorId: null }, { where: { creatorId: user.id } });
    await user.destroy();
    notice(req, res, "/admin/users", "Usuario eliminado. Sus examenes creados se conservaron sin autor.");
}

async function assignExam(req, res) {
    const student = await findUser(req.body.userId);
    if (student.role !== "estudiante") throw new AdminError("Solo se pueden asignar examenes a estudiantes.");
    const exam = await Exam.findByPk(req.body.examId);
    if (!exam) throw new AdminError("El examen no existe.");
    await ExamAssignment.findCreateFind({ where: { userId: student.id, examId: exam.id } });
    notice(req, res, `/admin/users/${student.id}`, "Examen asignado.");
}

async function unassignExam(req, res) {
    const assignment = await ExamAssignment.findByPk(req.params.id);
    if (!assignment) throw new AdminError("La asignacion no existe.");
    const userId = assignment.userId;
    await assignment.destroy();
    notice(req, res, `/admin/users/${userId}`, "Asignacion retirada. Los resultados se conservaron.");
}

async function examData(body) {
    const title = String(body.title || "").trim();
    const instructions = String(body.instructions || "").trim();
    if (!title || title.length > 200 || !instructions) throw new AdminError("Indica un titulo de hasta 200 caracteres y las instrucciones.");
    const course = await Course.findByPk(body.courseId || 0);
    if (!course || !course.professorId) throw new AdminError("Selecciona un curso con profesor asignado.");
    const professor = await findUser(course.professorId);
    if (professor.role !== "profesor") throw new AdminError("El docente del curso debe tener el rol profesor.");
    return { title, instructions, courseId: course.id, creatorId: professor.id };
}

async function createExam(req, res) {
    await Exam.create(await examData(req.body));
    notice(req, res, "/admin/exams", "Examen creado.");
}

async function updateExam(req, res) {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw new AdminError("El examen no existe.");
    await exam.update(await examData(req.body));
    notice(req, res, "/admin/exams", "Examen actualizado.");
}

async function deleteExam(req, res) {
    const exam = await Exam.findByPk(req.params.id);
    if (!exam) throw new AdminError("El examen no existe.");
    const questions = await Question.findAll({ where: { examId: exam.id }, attributes: ["id"] });
    for (const question of questions) await QuestionContent.destroy({ where: { questionId: question.id } });
    await Result.destroy({ where: { examId: exam.id } });
    await ExamAssignment.destroy({ where: { examId: exam.id } });
    await Question.destroy({ where: { examId: exam.id } });
    await exam.destroy();
    notice(req, res, "/admin/exams", "Examen eliminado junto con sus preguntas, asignaciones y resultados.");
}

function notice(req, res, path, message) {
    req.session.adminNotice = { kind: "success", message };
    res.redirect(path);
}

module.exports = {
    roles, AdminError, validateAccount, protectAdministrator, dashboard, listUsers, userDetail, listExams,
    listCourses, createCourse, updateCourse, deleteCourse,
    createUser, updateUser, deleteUser, assignExam, unassignExam, createExam, updateExam, deleteExam
};