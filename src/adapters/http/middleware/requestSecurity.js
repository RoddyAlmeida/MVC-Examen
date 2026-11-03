const { randomBytes, timingSafeEqual } = require("node:crypto");

function prepareActions(req, res, next) {
  if (!req.session.actionCsrf) req.session.actionCsrf = randomBytes(32).toString("hex");
  res.locals.csrfToken = req.session.actionCsrf;
  res.locals.actionNotice = req.session.actionNotice || null;
  if (req.method === "GET" && req.path !== "/notifications/count" && !/^\/exams\/\d+\/activity$/.test(req.path)) delete req.session.actionNotice;
  next();
}

function protectActions(req, res, next) {
  if (!["GET", "HEAD"].includes(req.method)) {
    const token = req.body?._csrf || req.get("x-csrf-token");
    const expected = Buffer.from(req.session.actionCsrf);
    if (typeof token !== "string" || Buffer.byteLength(token) !== expected.length || !timingSafeEqual(Buffer.from(token), expected)) {
      return res.status(403).render("errors/generic", { title: "Solicitud rechazada", message: "Recarga la pagina e intentalo de nuevo." });
    }
  }
  next();
}

function actionErrors(error, req, res, next) {
  if (error.name !== "EnrollmentError") return next(error);
  req.session.actionNotice = { kind: "error", message: error.message };
  const path = req.baseUrl === "/professor" ? "/professor/dashboard" : "/student/courses";
  res.redirect(path);
}

module.exports = { prepareActions, protectActions, actionErrors };