const { assertPort, contracts } = require("../ports");

function createAuthorization({ data }) {
  assertPort("authorization", data, contracts.authorization);
  function denied(output, message) {
    return output.status(403).render("errors/generic", { title: "Acceso denegado", message });
  }

  function requireRole(role) {
    return async (context, output, next) => {
      if (!context.session.userId) return output.redirect("/login");
      const user = await data.findCurrentUser(context);
      if (!user) {
        return output.signOut("/login");
      }
      context.session.role = user.role;
      context.session.userName = user.name || user.email;
      if (user.role !== role) return denied(output, "Tu cuenta no tiene permisos para acceder a esta pagina.");
      next();
    };
  }

  async function requireAssignedExam(context, output, next) {
    const assignment = await data.findActiveAssignment(context);
    if (!assignment) return denied(output, "Este examen no esta asignado a tu cuenta.");
    const exam = await data.findAssignedExam(context);
    if (!exam?.courseId || !await data.findActiveExamEnrollment(context, exam)) {
      return denied(output, "Debes estar inscrito en el curso de este examen.");
    }
    context.exam = exam;
    next();
  }

  async function requireOwnedCourse(context, output, next) {
    const course = await data.findOwnedCourse(context);
    if (!course) return denied(output, "Este curso no esta asignado a tu cuenta.");
    context.course = course;
    next();
  }

  async function requireVisibleCourseMembers(context, output, next) {
    const enrollment = await data.findVisibleCourseEnrollment(context);
    if (!enrollment) return denied(output, "Debes estar inscrito en este curso para ver sus integrantes.");
    if (!enrollment.course.membersVisible) return denied(output, "El profesor ha desactivado la lista de integrantes para estudiantes.");
    context.course = enrollment.course;
    next();
  }

  function requireExamAccess(context, output, next) {
    const grant = context.session.examAccess?.[context.exam.id];
    if (!grant || grant.revision !== context.exam.securityRevision || grant.expiresAt < Date.now()) {
      if (context.method === "GET") return output.redirect(`/student/exams/${context.exam.id}/start`);
      return denied(output, "Inicia el examen y verifica su contrasena antes de continuar.");
    }
    next();
  }

  function requireOwnedExam(parameter = "id") {
    return async (context, output, next) => {
      const exam = await data.findOwnedExam(context, parameter);
      if (!exam) return denied(output, "Solo puedes gestionar los examenes que has creado.");
      context.course = exam.course;
      context.exam = exam;
      if (context.params.qid && !await data.findOwnedQuestion(context, exam)) {
        return denied(output, "La pregunta no pertenece a este examen.");
      }
      next();
    };
  }

  async function loadCourses(context, output, next) {
    context.courses = await data.listOwnedCourses(context);
    if (!context.courses.length) return denied(output, "Necesitas un curso asignado por el administrador para crear o importar examenes.");
    output.locals.courses = context.courses;
    next();
  }

  async function requireCourse(context, output, next) {
    if (!context.courses) {
      context.courses = await data.listOwnedCourses(context);
    }
    if (!context.courses.length) return denied(output, "Necesitas un curso asignado por el administrador para crear o importar examenes.");
    output.locals.courses = context.courses;
    const selectedId = context.method === "POST" ? context.body.courseId : context.query?.courseId;
    context.course = selectedId ? context.courses.find(course => course.id === Number(selectedId)) : null;
    if (selectedId && !context.course) return denied(output, "El curso seleccionado no esta asignado a tu cuenta.");
    if (context.method === "POST" && !context.course) return denied(output, "Selecciona uno de tus cursos para crear o importar el examen.");
    if (!selectedId && context.courses.length === 1) context.course = context.courses[0];
    next();
  }

  async function requireTeachingStudent(context, output, next) {
    const enrollment = await data.findTeachingEnrollment(context);
    if (!enrollment) return denied(output, "Este estudiante no esta inscrito en tus cursos.");
    next();
  }

  return { requireRole, requireAssignedExam, requireOwnedExam, requireTeachingStudent, requireCourse, loadCourses, requireOwnedCourse, requireExamAccess, requireVisibleCourseMembers };
}

module.exports = { createAuthorization };
