const { assertPort, contracts } = require("../ports");

function createEnrollmentActions({ data, unitOfWork, enrollment }) {
  assertPort("enrollmentActions", data, contracts.enrollmentActions);
  const { EnrollmentError, studentByEmail, enrollStudent, inviteExam, activateAssignment } = enrollment;
  function notice(context, output, path, message) {
    context.session.actionNotice = { kind: "success", message };
    output.redirect(path);
  }

  async function studentCourses(context, output) {
    const enrollments = await data.listStudentCourses(context);
    output.render("student/courses", { title: "Mis cursos", enrollments });
  }

  async function respondCourse(context, output) {
    const enrollment = await data.findPendingCourseInvitation(context);
    if (!enrollment) throw new EnrollmentError("La invitacion al curso no esta pendiente o no te pertenece.");
    if (!["accept", "reject"].includes(context.body.action)) throw new EnrollmentError("Selecciona aceptar o rechazar.");
    await data.update(enrollment, { status: context.body.action === "accept" ? "active" : "rejected" });
    notice(context, output, "/student/courses", context.body.action === "accept" ? "Inscripcion al curso aceptada." : "Invitacion rechazada.");
  }

  async function respondExam(context, output) {
    const assignment = await data.findPendingExamInvitation(context);
    if (!assignment) throw new EnrollmentError("La invitacion al examen no esta pendiente o no te pertenece.");
    if (!["accept", "reject"].includes(context.body.action)) throw new EnrollmentError("Selecciona aceptar o rechazar.");
    if (context.body.action === "accept") await activateAssignment(context.session.userId, assignment.exam);
    else await data.update(assignment, { status: "rejected" });
    notice(context, output, "/student/exams", context.body.action === "accept" ? "Invitacion al examen aceptada." : "Invitacion rechazada.");
  }

  async function joinExam(context, output) {
    const now = Date.now();
    const attempts = context.session.codeAttempts || { count: 0, until: now + 60000 };
    if (attempts.until <= now) { attempts.count = 0; attempts.until = now + 60000; }
    context.session.codeAttempts = attempts;
    if (++attempts.count > 10) return output.status(429).render("errors/generic", { title: "Demasiados intentos", message: "Espera un minuto antes de probar otro codigo." });
    const code = String(context.body.code || "").trim().toUpperCase();
    const exam = /^[A-F0-9]{12}$/.test(code) ? await data.findExamByCode(code) : null;
    if (!exam) throw new EnrollmentError("El codigo no es valido o ha sido desactivado.");
    await activateAssignment(context.session.userId, exam);
    notice(context, output, "/student/exams", "Te has unido al examen.");
  }

  async function courseMembers(context, output) {
    const enrollments = await data.listCourseMembers(context);
    const professor = await data.findProfessorContact(context);
    output.render("professor/course-members", { title: context.course.name, course: context.course, enrollments, professor });
  }

  async function setMembersVisibility(context, output) {
    await data.update(context.course, { membersVisible: context.body.membersVisible === "on" });
    notice(context, output, `/professor/courses/${context.course.id}/members`, "Visibilidad de integrantes actualizada.");
  }

  async function studentMembers(context, output) {
    const enrollments = await data.listVisibleMembers(context);
    const professor = await data.findProfessorName(context);
    output.render("student/course-members", { title: context.course.name, course: context.course, enrollments, professor });
  }

  async function inviteCourse(context, output) {
    const student = await studentByEmail(context.body.email);
    await enrollStudent(student.id, context.course.id, "invited");
    notice(context, output, `/professor/courses/${context.course.id}/members`, "Invitacion al curso enviada.");
  }

  async function removeMember(context, output) {
    const enrollment = await data.findCourseEnrollment(context);
    if (!enrollment) throw new EnrollmentError("La inscripcion no pertenece a este curso.");
    const exams = await data.listCourseExamIds(context);
    await unitOfWork.run(async transaction => {
      await data.removeCourseExamAssignments(enrollment, exams, transaction);
      await data.destroy(enrollment, { transaction });
    });
    notice(context, output, `/professor/courses/${context.course.id}/members`, "Inscripcion retirada. Los resultados se conservaron.");
  }

  async function inviteStudentExam(context, output) {
    await inviteExam(Number(context.body.userId), context.params.id);
    notice(context, output, `/professor/exams/${context.params.id}/access`, "Invitacion al examen enviada.");
  }

  async function removeExamAccess(context, output) {
    await data.removeExamAssignment(context);
    notice(context, output, `/professor/exams/${context.params.id}/access`, "Acceso al examen retirado. Los resultados se conservaron.");
  }

  return { studentCourses, respondCourse, respondExam, joinExam, courseMembers, inviteCourse, removeMember, inviteStudentExam, removeExamAccess, notice, setMembersVisibility, studentMembers };
}

module.exports = { createEnrollmentActions };
