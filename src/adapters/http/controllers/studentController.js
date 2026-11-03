const { student: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["listExams", "renderStart", "renderExam", "submitExam"]);
