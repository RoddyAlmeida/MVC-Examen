const { calculateMetrics, pendingReview } = require("../domain/adminMetrics");
const { roles, AdminError, validateAccount } = require("../domain/accounts");
const { assertPort, contracts } = require("../ports");

function createAdminUseCases({ data, unitOfWork, enrollment, passwords }) {
  assertPort("admin", data, contracts.admin);
  const { enrollStudent, inviteExam } = enrollment;
  async function loadData() {
    const [users, exams, assignments, results, courses] = await Promise.all([
      data.listUsers(),
      data.listExams(),
      data.listAssignments(),
      data.listResults(),
      data.listCourses(),
    ]);
    return { users, exams, assignments, results, courses, roles, pendingReview };
  }

  async function listCourses(context, output) {
    const courses = await data.listCourses();
    const professors = await data.listProfessors();
    const students = await data.listStudents();
    const enrollments = await data.listEnrollments();
    output.render("admin/courses", { title: "Cursos", active: "courses", courses, professors, students, enrollments });
  }

  async function forceEnrollment(context, output) {
    await enrollStudent(Number(context.body.userId), Number(context.body.courseId), "active");
    notice(context, output, "/admin/courses", "Estudiante inscrito sin requerir aceptacion.");
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

  async function createCourse(context, output) {
    await data.createCourse(await courseData(context.body));
    notice(context, output, "/admin/courses", "Curso creado y asignado.");
  }

  async function updateCourse(context, output) {
    const course = await data.findCourseById(context);
    if (!course) throw new AdminError("El curso no existe.");
    const values = await courseData(context.body, course.id);
    await unitOfWork.run(async (transaction) => {
      await data.update(course, values, { transaction });
      await data.transferCourseExams({ creatorId: values.professorId }, course, transaction);
    });
    notice(context, output, "/admin/courses", "Curso actualizado.");
  }

  async function deleteCourse(context, output) {
    const course = await data.findCourseById(context);
    if (!course) throw new AdminError("El curso no existe.");
    if (await data.countCourseExams(course)) throw new AdminError("No puedes eliminar un curso que tiene examenes.");
    await data.destroy(course);
    notice(context, output, "/admin/courses", "Curso eliminado.");
  }

  async function dashboard(context, output) {
    const data = await loadData();
    output.render("admin/dashboard", { ...data, title: "Resumen", active: "dashboard", metrics: calculateMetrics(data) });
  }

  async function listUsers(context, output) {
    const data = await loadData();
    const query = String(context.query.q || "").trim().toLowerCase();
    const role = Object.hasOwn(roles, context.query.role) ? context.query.role : "";
    const users = data.users.filter((user) => (!role || user.role === role) && `${user.name} ${user.email}`.toLowerCase().includes(query));
    output.render("admin/users", { ...data, users, title: "Usuarios", active: "users", query, role });
  }

  async function userDetail(context, output) {
    const data = await loadData();
    const user = data.users.find((item) => item.id === Number(context.params.id));
    if (!user) return output.status(404).render("errors/generic", { title: "Usuario no encontrado", message: "La cuenta no existe." });
    output.render("admin/user-detail", { ...data, user, title: user.name || user.email, active: "users" });
  }

  async function listExams(context, output) {
    const data = await loadData();
    const query = String(context.query.q || "").trim().toLowerCase();
    const exams = data.exams.filter((exam) => `${exam.title} ${exam.creator?.name || ""} ${exam.course?.name || ""}`.toLowerCase().includes(query));
    output.render("admin/exams", { ...data, exams, title: "Examenes", active: "exams", query });
  }

  async function createUser(context, output) {
    const account = validateAccount(context.body);
    const password = await passwords.hash(context.body.password, 10);
    const user = await data.createUser({ ...account, password });
    notice(context, output, `/admin/users/${user.id}`, "Usuario creado.");
  }

  async function findUser(id) {
    const user = await data.findUserById(id);
    if (!user) throw new AdminError("El usuario no existe.");
    return user;
  }

  async function protectAdministrator(user, session, nextRole) {
    if (user.role !== "administrador" || nextRole === "administrador") return;
    if (user.id === session.userId) throw new AdminError("No puedes eliminar tu cuenta ni quitarte el rol de administrador.");
    if (await data.countAdministrators() <= 1) throw new AdminError("Debe existir al menos un administrador.");
  }

  async function updateUser(context, output) {
    const user = await findUser(context.params.id);
    const account = validateAccount(context.body, false);
    await protectAdministrator(user, context.session, account.role);
    if (context.body.password) account.password = await passwords.hash(context.body.password, 10);
    await data.update(user, account);
    if (account.role !== "estudiante") {
      await data.removeStudentAssignments(user);
      await data.removeStudentEnrollments(user);
    }
    if (account.role !== "profesor") {
      await data.detachProfessorCourses({ professorId: null }, user);
      await data.detachProfessorExams({ creatorId: null }, user);
    }
    notice(context, output, `/admin/users/${user.id}`, "Cuenta actualizada.");
  }

  async function deleteUser(context, output) {
    const user = await findUser(context.params.id);
    await protectAdministrator(user, context.session, null);
    await data.removeStudentAssignments(user);
    await data.removeStudentResults(user);
    await data.detachProfessorCourses({ professorId: null }, user);
    await data.detachProfessorExams({ creatorId: null }, user);
    await data.destroy(user);
    notice(context, output, "/admin/users", "Usuario eliminado. Sus examenes creados se conservaron sin autor.");
  }

  async function assignExam(context, output) {
    await inviteExam(Number(context.body.userId), Number(context.body.examId));
    notice(context, output, `/admin/users/${Number(context.body.userId)}`, "Invitacion al examen enviada.");
  }

  async function unassignExam(context, output) {
    const assignment = await data.findAssignmentById(context);
    if (!assignment) throw new AdminError("La asignacion no existe.");
    const userId = assignment.userId;
    await data.destroy(assignment);
    notice(context, output, `/admin/users/${userId}`, "Asignacion retirada. Los resultados se conservaron.");
  }

  async function examData(body) {
    const title = String(body.title || "").trim();
    const instructions = String(body.instructions || "").trim();
    if (!title || title.length > 200 || !instructions) throw new AdminError("Indica un titulo de hasta 200 caracteres y las instrucciones.");
    const course = await data.findCourseForExam(body);
    if (!course || !course.professorId) throw new AdminError("Selecciona un curso con profesor asignado.");
    const professor = await findUser(course.professorId);
    if (professor.role !== "profesor") throw new AdminError("El docente del curso debe tener el rol profesor.");
    return { title, instructions, courseId: course.id, creatorId: professor.id };
  }

  async function createExam(context, output) {
    await data.createExam(await examData(context.body));
    notice(context, output, "/admin/exams", "Examen creado.");
  }

  async function updateExam(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) throw new AdminError("El examen no existe.");
    await data.update(exam, await examData(context.body));
    notice(context, output, "/admin/exams", "Examen actualizado.");
  }

  async function deleteExam(context, output) {
    const exam = await data.findExamById(context);
    if (!exam) throw new AdminError("El examen no existe.");
    const questions = await data.listExamQuestionIds(exam);
    for (const question of questions) await data.removeQuestionContent(question);
    await data.removeExamResults(exam);
    await data.removeExamAssignments(exam);
    await data.removeExamQuestions(exam);
    await data.destroy(exam);
    notice(context, output, "/admin/exams", "Examen eliminado junto con sus preguntas, asignaciones y resultados.");
  }

  function notice(context, output, path, message) {
    context.session.adminNotice = { kind: "success", message };
    output.redirect(path);
  }

  return {
    roles, AdminError, validateAccount, protectAdministrator, dashboard, listUsers, userDetail, listExams,
    listCourses, createCourse, updateCourse, deleteCourse, forceEnrollment,
    createUser, updateUser, deleteUser, assignExam, unassignExam, createExam, updateExam, deleteExam
  };
}

module.exports = { createAdminUseCases };
