const express = require("express");
const professorController = require("../controllers/professorController");

const router = express.Router();

router.get("/dashboard", professorController.dashboard);
router.get("/exams/create", professorController.renderCreateExam);
router.post("/exams/create", professorController.createExam);
router.get("/exams/:id/edit", professorController.renderEditExam);
router.post("/exams/:id/edit", professorController.editExam);
router.post("/exams/:id/delete", professorController.deleteExam);
router.get("/exams/:id/questions", professorController.manageQuestions);
router.post("/exams/:id/questions/create", professorController.createQuestion);
router.post("/exams/:id/questions/:qid/edit", professorController.editQuestion);
router.post("/exams/:id/questions/:qid/delete", professorController.deleteQuestion);
router.get("/students", professorController.listStudents);
router.get("/students/:id", professorController.viewStudent);
router.get("/students/:id/exam/:eid", professorController.viewStudentExam);
router.post("/students/:id/edit", professorController.editStudent);
router.post("/students/:id/reset-exam/:eid", professorController.resetStudentExam);
router.post("/students/:id/delete", professorController.deleteStudent);

module.exports = router;
