const { enrollmentActions: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["studentCourses", "respondCourse", "respondExam", "joinExam", "courseMembers", "inviteCourse", "removeMember", "inviteStudentExam", "removeExamAccess", "setMembersVisibility", "studentMembers"]);
