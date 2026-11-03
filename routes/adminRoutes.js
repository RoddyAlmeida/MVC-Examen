const express = require("express");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const controller = require("../controllers/adminController");

const router = express.Router();

router.use((req, res, next) => {
    if (!req.session.adminCsrf) req.session.adminCsrf = randomBytes(32).toString("hex");
    if (req.method !== "GET") {
        const token = req.body._csrf;
        const expected = Buffer.from(req.session.adminCsrf);
        if (typeof token !== "string" || Buffer.byteLength(token) !== expected.length || !timingSafeEqual(Buffer.from(token), expected)) {
            return res.status(403).render("errors/generic", { title: "Solicitud rechazada", message: "Recarga la pagina e intentalo de nuevo." });
        }
    }
    res.locals.csrf = req.session.adminCsrf;
    res.locals.notice = req.session.adminNotice || null;
    res.locals.roles = controller.roles;
    delete req.session.adminNotice;
    next();
});

router.get("/", (req, res) => res.redirect("/admin/dashboard"));
router.get("/dashboard", controller.dashboard);
router.get("/users", controller.listUsers);
router.get("/users/:id", controller.userDetail);
router.get("/exams", controller.listExams);
router.get("/courses", controller.listCourses);
router.post("/courses", controller.createCourse);
router.post("/courses/:id/update", controller.updateCourse);
router.post("/courses/:id/delete", controller.deleteCourse);
router.post("/users", controller.createUser);
router.post("/users/:id/update", controller.updateUser);
router.post("/users/:id/delete", controller.deleteUser);
router.post("/assignments", controller.assignExam);
router.post("/assignments/:id/delete", controller.unassignExam);
router.post("/exams", controller.createExam);
router.post("/exams/:id/update", controller.updateExam);
router.post("/exams/:id/delete", controller.deleteExam);

router.use((error, req, res, next) => {
    if (!(error instanceof controller.AdminError) && error.name !== "SequelizeUniqueConstraintError") return next(error);
    const courses = req.path.startsWith("/courses");
    req.session.adminNotice = {
        kind: "error", message: error.name === "SequelizeUniqueConstraintError"
            ? (courses ? "Este profesor ya tiene un curso asignado." : "Ya existe una cuenta con ese correo.") : error.message
    };
    res.redirect(courses ? "/admin/courses" : req.path.startsWith("/exams") ? "/admin/exams" : "/admin/users");
});

module.exports = router;