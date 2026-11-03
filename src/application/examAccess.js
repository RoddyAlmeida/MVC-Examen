const { assertPort, contracts } = require("../ports");

function createExamAccessUseCases({ data, enrollment, enrollmentActions, activity: activityService, leaderboard: leaderboardService, student, passwords, tokens }) {
  assertPort("examAccess", data, contracts.examAccess);
  const { EnrollmentError } = enrollment;
  const { notice } = enrollmentActions;
  const { startAttempt, activityView } = activityService;
  const { getExamLeaderboard } = leaderboardService;
  const eventTypes = { blur: "Cambio de ventana", hidden: "Examen oculto", fullscreen_exit: "Salida de pantalla completa", navigation: "Salida del examen" };

  async function accessPage(context, output) {
    const members = await data.listActiveMembers(context);
    const assignments = await data.listExamAssignments(context);
    output.render("professor/exam-access", { title: context.exam.title, exam: context.exam, course: context.course, members, assignments });
  }

  async function saveSecurity(context, output) {
    const mode = context.body.securityMode;
    if (!["none", "locked", "monitored"].includes(mode)) throw new EnrollmentError("Selecciona un modo de seguridad valido.");
    const values = { securityMode: mode };
    if (context.body.password) {
      if (typeof context.body.password !== "string" || context.body.password.length < 8 || passwords.byteLength(context.body.password) > 72) throw new EnrollmentError("La contrasena debe tener al menos 8 caracteres y hasta 72 bytes.");
      values.passwordHash = await passwords.hash(context.body.password, 10);
    }
    if (context.body.removePassword === "on") values.passwordHash = null;
    await data.updateSecurity(context.exam, values);
    notice(context, output, `/professor/exams/${context.exam.id}/access`, "Seguridad actualizada. Los estudiantes deberan volver a iniciar el examen.");
  }

  async function generateCode(context, output) {
    if (!["generate", "disable"].includes(context.body.action)) throw new EnrollmentError("Selecciona generar o desactivar el codigo.");
    await data.update(context.exam, { joinCode: context.body.action === "generate" ? tokens.hex(6).toUpperCase() : null });
    notice(context, output, `/professor/exams/${context.exam.id}/access`, context.body.action === "generate" ? "Codigo generado. El codigo anterior ya no funciona." : "Codigo desactivado.");
  }

  async function beginExam(context, output) {
    const exam = context.exam;
    if (await data.findExistingResult(context, exam)) return output.redirect("/student/exams");
    if (!await data.countQuestions(exam)) return output.status(400).render("errors/generic", { title: "Examen vacio", message: "Este examen todavia no tiene preguntas." });
    const now = Date.now();
    if (!context.session.passwordAttempts) context.session.passwordAttempts = {};
    let attempts = context.session.passwordAttempts[exam.id];
    if (!attempts || attempts.until <= now) attempts = { count: 0, until: now + 60000 };
    context.session.passwordAttempts[exam.id] = attempts;
    if (attempts.count >= 5) return output.status(429).render("errors/generic", { title: "Demasiados intentos", message: "Espera un minuto para volver a verificar la contrasena." });
    if (exam.passwordHash && (typeof context.body.password !== "string" || passwords.byteLength(context.body.password) > 72 || !await passwords.compare(context.body.password, exam.passwordHash))) {
      attempts.count += 1;
      output.locals.startErrors = ["La contrasena del examen no es correcta."];
      return student.renderStart(context, output.status(403));
    }
    delete context.session.passwordAttempts[exam.id];
    const grant = { revision: exam.securityRevision, token: tokens.hex(32), expiresAt: now + 12 * 60 * 60 * 1000 };
    await startAttempt(context.session.userId, exam.id, grant.token);
    if (!context.session.examAccess) context.session.examAccess = {};
    context.session.examAccess[exam.id] = grant;
    output.redirect(`/student/exams/${exam.id}/take`);
  }

  async function heartbeat(context, output) {
    const grant = context.session.examAccess[context.exam.id];
    if (context.body.token !== grant.token || !["heartbeat", "leave"].includes(context.body.action)) return output.sendStatus(400);
    const [updated] = await data.updatePresence({ lastSeenAt: new Date(), connected: context.body.action === "heartbeat" }, context, grant);
    output.sendStatus(updated ? 204 : 409);
  }

  async function activity(context, output) {
    const attempts = await data.listActiveAttempts(context);
    const now = Date.now();
    output.set("Cache-Control", "no-store");
    output.json({ updatedAt: new Date(now).toISOString(), attempts: attempts.map(attempt => activityView(attempt, now)) });
  }

  async function leaderboard(context, output) {
    output.set("Cache-Control", "no-store");
    if (!context.exam.leaderboardEnabled) {
      return output.status(403).render("errors/generic", { title: "Ranking no disponible", message: "El profesor ha desactivado el ranking de este examen." });
    }
    const rows = await getExamLeaderboard(context.exam);
    const professor = context.session.role === "profesor";
    output.render("exams/leaderboard", {
      title: `Ranking - ${context.exam.title}`,
      exam: context.exam,
      rows,
      currentUserId: context.session.userId,
      backUrl: professor ? `/professor/dashboard?courseId=${context.exam.courseId}` : "/student/exams",
      refreshUrl: `${professor ? "/professor" : "/student"}/exams/${context.exam.id}/leaderboard`,
    });
  }

  async function securityEvent(context, output) {
    const grant = context.session.examAccess[context.exam.id];
    if (context.exam.securityMode === "none") return output.sendStatus(204);
    if (context.body.token !== grant.token || !Object.hasOwn(eventTypes, context.body.type) || !/^[a-f0-9-]{36}$/i.test(String(context.body.eventId || ""))) return output.sendStatus(400);
    const now = Date.now();
    const window = context.session.securityEventWindow || { count: 0, until: now + 60000 };
    if (window.until <= now) { window.count = 0; window.until = now + 60000; }
    context.session.securityEventWindow = window;
    if (++window.count > 30) return output.sendStatus(429);
    await data.recordSecurityEvent(context);
    output.sendStatus(204);
  }



  async function notifications(context, output) {
    const events = await data.listNotifications(context);
    output.render("professor/notifications", { title: "Notificaciones", events, eventTypes });
  }

  async function notificationCount(context, output) {
    const unread = await data.countUnreadNotifications(context);
    output.json({ unread });
  }

  async function readNotification(context, output) {
    const event = await data.findOwnedNotification(context);
    if (!event) throw new EnrollmentError("La notificacion no pertenece a tus cursos.");
    await data.update(event, { readAt: new Date() });
    output.redirect("/professor/notifications");
  }

  return { accessPage, saveSecurity, generateCode, beginExam, securityEvent, notifications, notificationCount, readNotification, eventTypes, heartbeat, activity, leaderboard };
}

module.exports = { createExamAccessUseCases };
