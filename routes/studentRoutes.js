const express = require("express");
const studentController = require("../controllers/studentController");

const router = express.Router();

router.get("/exams", studentController.listExams);
router.get("/exams/:id/start", studentController.renderStart);
router.get("/exams/:id/take", studentController.renderExam);
router.post("/exams/:id/take", studentController.submitExam);

module.exports = router;
