const { admin: useCases } = require("../../../bootstrap/system");
const { adapt, createController } = require("../controller");

const controller = createController(useCases, ["dashboard", "listUsers", "userDetail", "listExams", "listCourses", "createCourse", "updateCourse", "deleteCourse", "forceEnrollment", "createUser", "updateUser", "deleteUser", "assignExam", "unassignExam", "createExam", "updateExam", "deleteExam"]);

function wantsUserJson(req) {
    return req.method === "POST" && /^\/users(?:\/[^/]+\/(?:update|delete))?$/.test(req.path)
        && req.accepts?.(["html", "json"]) === "json";
}

for (const name of ["createUser", "updateUser", "deleteUser"]) {
    controller[name] = adapt(useCases[name], {
        redirect(req, res, destination) {
            if (!wantsUserJson(req)) return res.redirect(destination);
            const notice = req.session.adminNotice;
            delete req.session.adminNotice;
            return res.json({ message: notice?.message || "Operación completada.", redirect: destination });
        },
    });
}

module.exports = { ...controller, wantsUserJson };
