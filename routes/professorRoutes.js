const express = require("express");
const multer = require("multer");
const professorController = require("../controllers/professorController");
const { requireOwnedExam, requireTeachingStudent, requireCourse } = require("../middleware/access");

const router = express.Router();
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
            formData: {},
        });
    });
}

router.get("/dashboard", professorController.dashboard);
router.get("/exams/import", requireCourse, professorController.renderImportExam);
router.post("/exams/import", requireCourse, handleQtiUpload, professorController.importExam);
router.get("/exams/create", requireCourse, professorController.renderCreateExam);
router.post("/exams/create", requireCourse, professorController.createExam);
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

module.exports = router;
