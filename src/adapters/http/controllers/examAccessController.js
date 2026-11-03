const { examAccess: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

module.exports = createController(useCases, ["accessPage", "saveSecurity", "generateCode", "beginExam", "securityEvent", "notifications", "notificationCount", "readNotification", "heartbeat", "activity", "leaderboard"]);
