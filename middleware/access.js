const { User, Exam, Question, ExamAssignment, Course, CourseEnrollment } = require("../models");

function denied(res, message) {
  return res.status(403).render("errors/generic", { title: "Acceso denegado", message });
}

function requireRole(role) {
  return async (req, res, next) => {
    if (!req.session.userId) return res.redirect("/login");
    const user = await User.findByPk(req.session.userId, { attributes: ["id", "role", "name", "email"] });
    if (!user) {
      return req.session.destroy(() => res.redirect("/login"));
    }
    req.session.role = user.role;
    req.session.userName = user.name || user.email;
    if (user.role !== role) return denied(res, "Tu cuenta no tiene permisos para acceder a esta pagina.");
    next();
  };
}

async function requireAssignedExam(req, res, next) {
  const assignment = await ExamAssignment.findOne({ where: { userId: req.session.userId, examId: req.params.id, status: "active" } });
  if (!assignment) return denied(res, "Este examen no esta asignado a tu cuenta.");
  const exam = await Exam.findByPk(req.params.id);
  if (!exam?.courseId || !await CourseEnrollment.findOne({ where: { userId: req.session.userId, courseId: exam.courseId, status: "active" } })) {
    return denied(res, "Debes estar inscrito en el curso de este examen.");
  }
  req.exam = exam;
  next();
}

async function requireOwnedCourse(req, res, next) {
  const course = await Course.findOne({ where: { id: req.params.id, professorId: req.session.userId } });
  if (!course) return denied(res, "Este curso no esta asignado a tu cuenta.");
  req.course = course;
  next();
}

async function requireVisibleCourseMembers(req, res, next) {
  const enrollment = await CourseEnrollment.findOne({
    where: { userId: req.session.userId, courseId: req.params.id, status: "active" },
    include: [{ model: Course, as: "course", required: true }],
  });
  if (!enrollment) return denied(res, "Debes estar inscrito en este curso para ver sus integrantes.");
  if (!enrollment.course.membersVisible) return denied(res, "El profesor ha desactivado la lista de integrantes para estudiantes.");
  req.course = enrollment.course;
  next();
}

function requireExamAccess(req, res, next) {
  const grant = req.session.examAccess?.[req.exam.id];
  if (!grant || grant.revision !== req.exam.securityRevision || grant.expiresAt < Date.now()) {
    if (req.method === "GET") return res.redirect(`/student/exams/${req.exam.id}/start`);
    return denied(res, "Inicia el examen y verifica su contrasena antes de continuar.");
  }
  next();
}

function requireOwnedExam(parameter = "id") {
  return async (req, res, next) => {
    const exam = await Exam.findOne({
      where: { id: req.params[parameter], creatorId: req.session.userId },
      include: [{ model: Course, as: "course", where: { professorId: req.session.userId }, required: true }],
    });
    if (!exam) return denied(res, "Solo puedes gestionar los examenes que has creado.");
    req.course = exam.course;
    req.exam = exam;
    if (req.params.qid && !await Question.findOne({ where: { id: req.params.qid, examId: exam.id } })) {
      return denied(res, "La pregunta no pertenece a este examen.");
    }
    next();
  };
}

async function loadCourses(req, res, next) {
  req.courses = await Course.findAll({ where: { professorId: req.session.userId }, order: [["name", "ASC"]] });
  if (!req.courses.length) return denied(res, "Necesitas un curso asignado por el administrador para crear o importar examenes.");
  res.locals.courses = req.courses;
  next();
}

async function requireCourse(req, res, next) {
  if (!req.courses) {
    req.courses = await Course.findAll({ where: { professorId: req.session.userId }, order: [["name", "ASC"]] });
  }
  if (!req.courses.length) return denied(res, "Necesitas un curso asignado por el administrador para crear o importar examenes.");
  res.locals.courses = req.courses;
  const selectedId = req.method === "POST" ? req.body.courseId : req.query?.courseId;
  req.course = selectedId ? req.courses.find(course => course.id === Number(selectedId)) : null;
  if (selectedId && !req.course) return denied(res, "El curso seleccionado no esta asignado a tu cuenta.");
  if (req.method === "POST" && !req.course) return denied(res, "Selecciona uno de tus cursos para crear o importar el examen.");
  if (!selectedId && req.courses.length === 1) req.course = req.courses[0];
  next();
}

async function requireTeachingStudent(req, res, next) {
  const enrollment = await CourseEnrollment.findOne({
    where: { userId: req.params.id, status: "active" },
    include: [{ model: Course, as: "course", where: { professorId: req.session.userId }, required: true }],
  });
  if (!enrollment) return denied(res, "Este estudiante no esta inscrito en tus cursos.");
  next();
}

module.exports = { requireRole, requireAssignedExam, requireOwnedExam, requireTeachingStudent, requireCourse, loadCourses, requireOwnedCourse, requireExamAccess, requireVisibleCourseMembers };