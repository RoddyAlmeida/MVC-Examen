const express = require("express");
const examController = require("../controllers/examController");

const router = express.Router();

router.get("/start", examController.renderStart);
router.get("/take", examController.renderExam);
router.post("/take", examController.submitExam);

module.exports = router;
