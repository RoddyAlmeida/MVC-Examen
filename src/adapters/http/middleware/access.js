const { authorization: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["requireAssignedExam", "requireTeachingStudent", "requireCourse", "loadCourses", "requireOwnedCourse", "requireExamAccess", "requireVisibleCourseMembers"]);
module.exports.requireRole = role => adapt(useCases.requireRole(role));
module.exports.requireOwnedExam = parameter => adapt(useCases.requireOwnedExam(parameter));
