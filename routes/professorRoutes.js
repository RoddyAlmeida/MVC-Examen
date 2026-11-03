const express = require("express");
const multer = require("multer");
const professorController = require("../controllers/professorController");
const enrollmentController = require("../controllers/enrollmentController");
const examAccessController = require("../controllers/examAccessController");
const { prepareActions, protectActions, actionErrors } = require("../middleware/requestSecurity");
const { requireOwnedExam, requireTeachingStudent, requireCourse, loadCourses, requireOwnedCourse } = require("../middleware/access");

const router = express.Router();
router.use(prepareActions);
router.use((req, res, next) => req.path === "/exams/import" && req.method === "POST" ? next() : protectActions(req, res, next));
const uploadQtiPackage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single("qtiPackage");

function handleQtiUpload(req, res, next) {
    uploadQtiPackage(req, res, (error) => {
        if (!error) return next();
        const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
            ? "El paquete QTI no puede superar 10 MB."
            : error.message;
        return res.status(400).render("professor/exam-import", {
            title: "Importar examen",
            errors: [{ msg: message }],
            formData: req.body || {},
            courses: req.courses,
        });
    });
}

router.get("/dashboard", professorController.dashboard);
router.get("/exams/import", requireCourse, professorController.renderImportExam);
router.post("/exams/import", loadCourses, handleQtiUpload, protectActions, requireCourse, professorController.importExam);
router.get("/exams/create", requireCourse, professorController.renderCreateExam);
router.post("/exams/create", requireCourse, professorController.createExam);
router.get("/courses/:id/members", requireOwnedCourse, enrollmentController.courseMembers);
router.post("/courses/:id/members/visibility", requireOwnedCourse, enrollmentController.setMembersVisibility);
router.post("/courses/:id/invitations", requireOwnedCourse, enrollmentController.inviteCourse);
router.post("/courses/:id/members/:enrollmentId/delete", requireOwnedCourse, enrollmentController.removeMember);
router.get("/exams/:id/access", requireOwnedExam(), examAccessController.accessPage);
router.get("/exams/:id/activity", requireOwnedExam(), examAccessController.activity);
router.post("/exams/:id/invitations", requireOwnedExam(), enrollmentController.inviteStudentExam);
router.post("/exams/:id/assignments/delete", requireOwnedExam(), enrollmentController.removeExamAccess);
router.post("/exams/:id/security", requireOwnedExam(), examAccessController.saveSecurity);
router.post("/exams/:id/code", requireOwnedExam(), examAccessController.generateCode);
router.get("/notifications", examAccessController.notifications);
router.get("/notifications/count", examAccessController.notificationCount);
router.post("/notifications/:id/read", examAccessController.readNotification);
router.get("/exams/:id/edit", requireOwnedExam(), professorController.renderEditExam);
router.post("/exams/:id/edit", requireOwnedExam(), professorController.editExam);
router.post("/exams/:id/delete", requireOwnedExam(), professorController.deleteExam);
router.get("/exams/:id/questions", requireOwnedExam(), professorController.manageQuestions);
router.get("/exams/:id/questions/create", requireOwnedExam(), professorController.renderCreateQuestion);
router.post("/exams/:id/questions/create", requireOwnedExam(), professorController.createQuestion);
router.get("/exams/:id/questions/:qid/edit", requireOwnedExam(), professorController.renderEditQuestion);
router.post("/exams/:id/questions/:qid/edit", requireOwnedExam(), professorController.editQuestion);
router.post("/exams/:id/questions/:qid/delete", requireOwnedExam(), professorController.deleteQuestion);
router.get("/students", professorController.listStudents);
router.get("/students/:id", requireTeachingStudent, professorController.viewStudent);
router.get("/students/:id/exam/:eid", requireOwnedExam("eid"), professorController.viewStudentExam);
router.post("/students/:id/exam/:eid/review", requireOwnedExam("eid"), professorController.reviewStudentExam);
router.post("/students/:id/reset-exam/:eid", requireOwnedExam("eid"), professorController.resetStudentExam);
router.use(actionErrors);

module.exports = router;
