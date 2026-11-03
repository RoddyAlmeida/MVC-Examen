const { professor: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["dashboard", "renderImportExam", "importExam", "renderCreateExam", "createExam", "renderEditExam", "editExam", "deleteExam", "manageQuestions", "renderCreateQuestion", "createQuestion", "renderEditQuestion", "editQuestion", "deleteQuestion", "listStudents", "viewStudent", "viewStudentExam", "reviewStudentExam", "resetStudentExam"]);
