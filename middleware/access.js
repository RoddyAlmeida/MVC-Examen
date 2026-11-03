const { User, Exam, Question, ExamAssignment } = require("../models");

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
  const assignment = await ExamAssignment.findOne({ where: { userId: req.session.userId, examId: req.params.id } });
  if (!assignment) return denied(res, "Este examen no esta asignado a tu cuenta.");
  next();
}

function requireOwnedExam(parameter = "id") {
  return async (req, res, next) => {
    const exam = await Exam.findOne({ where: { id: req.params[parameter], creatorId: req.session.userId } });
    if (!exam) return denied(res, "Solo puedes gestionar los examenes que has creado.");
    if (req.params.qid && !await Question.findOne({ where: { id: req.params.qid, examId: exam.id } })) {
      return denied(res, "La pregunta no pertenece a este examen.");
    }
    next();
  };
}

async function requireTeachingStudent(req, res, next) {
  const assignment = await ExamAssignment.findOne({
    where: { userId: req.params.id },
    include: [{ model: Exam, as: "exam", where: { creatorId: req.session.userId }, required: true }],
  });
  if (!assignment) return denied(res, "Este estudiante no tiene examenes tuyos asignados.");
  next();
}

module.exports = { requireRole, requireAssignedExam, requireOwnedExam, requireTeachingStudent };