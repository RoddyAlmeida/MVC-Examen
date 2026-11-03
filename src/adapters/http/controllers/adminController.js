const { admin: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["dashboard", "listUsers", "userDetail", "listExams", "listCourses", "createCourse", "updateCourse", "deleteCourse", "forceEnrollment", "createUser", "updateUser", "deleteUser", "assignExam", "unassignExam", "createExam", "updateExam", "deleteExam"]);
