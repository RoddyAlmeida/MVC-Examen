const express = require("express");
const multer = require("multer");
const professorController = require("../controllers/professorController");

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
router.get("/exams/import", professorController.renderImportExam);
router.post("/exams/import", handleQtiUpload, professorController.importExam);
router.get("/exams/create", professorController.renderCreateExam);
router.post("/exams/create", professorController.createExam);
router.get("/exams/:id/edit", professorController.renderEditExam);
router.post("/exams/:id/edit", professorController.editExam);
router.post("/exams/:id/delete", professorController.deleteExam);
router.get("/exams/:id/questions", professorController.manageQuestions);
router.get("/exams/:id/questions/create", professorController.renderCreateQuestion);
router.post("/exams/:id/questions/create", professorController.createQuestion);
router.get("/exams/:id/questions/:qid/edit", professorController.renderEditQuestion);
router.post("/exams/:id/questions/:qid/edit", professorController.editQuestion);
router.post("/exams/:id/questions/:qid/delete", professorController.deleteQuestion);
router.get("/students", professorController.listStudents);
router.get("/students/:id", professorController.viewStudent);
router.get("/students/:id/exam/:eid", professorController.viewStudentExam);
router.post("/students/:id/exam/:eid/review", professorController.reviewStudentExam);
router.post("/students/:id/edit", professorController.editStudent);
router.post("/students/:id/reset-exam/:eid", professorController.resetStudentExam);
router.post("/students/:id/delete", professorController.deleteStudent);

module.exports = router;
