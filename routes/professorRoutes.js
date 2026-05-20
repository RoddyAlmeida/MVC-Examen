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

module.exports = router;
