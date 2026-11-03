const express = require("express");
const studentController = require("../controllers/studentController");
const enrollmentController = require("../controllers/enrollmentController");
const examAccessController = require("../controllers/examAccessController");
const { prepareActions, protectActions, actionErrors } = require("../middleware/requestSecurity");
const { requireAssignedExam, requireExamAccess, requireVisibleCourseMembers } = require("../middleware/access");

const router = express.Router();
router.use(prepareActions, protectActions);

router.get("/courses", enrollmentController.studentCourses);
router.get("/courses/:id/members", requireVisibleCourseMembers, enrollmentController.studentMembers);
router.post("/courses/invitations/:id/respond", enrollmentController.respondCourse);
router.post("/exams/invitations/:id/respond", enrollmentController.respondExam);
router.post("/exams/join", enrollmentController.joinExam);
router.get("/exams", studentController.listExams);
router.get("/exams/:id/start", requireAssignedExam, studentController.renderStart);
router.post("/exams/:id/begin", requireAssignedExam, examAccessController.beginExam);
router.get("/exams/:id/take", requireAssignedExam, requireExamAccess, studentController.renderExam);
router.post("/exams/:id/take", requireAssignedExam, requireExamAccess, studentController.submitExam);
router.post("/exams/:id/security-events", requireAssignedExam, requireExamAccess, examAccessController.securityEvent);
router.post("/exams/:id/heartbeat", requireAssignedExam, requireExamAccess, examAccessController.heartbeat);
router.use(actionErrors);

module.exports = router;
