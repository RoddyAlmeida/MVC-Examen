const express = require("express");
const studentController = require("../controllers/studentController");
const { requireAssignedExam } = require("../middleware/access");

const router = express.Router();

router.get("/exams", studentController.listExams);
router.get("/exams/:id/start", requireAssignedExam, studentController.renderStart);
router.get("/exams/:id/take", requireAssignedExam, studentController.renderExam);
router.post("/exams/:id/take", requireAssignedExam, studentController.submitExam);

module.exports = router;
