const models = require("../adapters/persistence/sequelize/models");
const passwords = require("../adapters/crypto/passwords");
const tokens = require("../adapters/crypto/tokens");
const { parseQtiPackage: importQuestions } = require("../adapters/import/qti");
const { createAuthentication } = require("../application/authentication");
const { createEnrollmentService } = require("../application/enrollment");
const { createExamActivity } = require("../application/activity");
const { createLeaderboard } = require("../application/leaderboard");
const { createStudentUseCases } = require("../application/student");
const { createProfessorUseCases } = require("../application/professor");
const { createAdminUseCases } = require("../application/admin");
const { createEnrollmentActions } = require("../application/enrollmentActions");
const { createExamAccessUseCases } = require("../application/examAccess");
const { createAuthorization } = require("../application/authorization");
const { createUnitOfWork } = require("../adapters/persistence/sequelize/unitOfWork");

function createSystem({ persistence = models, passwordAdapter = passwords, tokenAdapter = tokens, questionImporter = importQuestions } = {}) {
  const unitOfWork = createUnitOfWork(persistence.sequelize);
  const repositories = {
    admin: require("../adapters/persistence/sequelize/repositories/admin").createRepository(persistence),
    professor: require("../adapters/persistence/sequelize/repositories/professor").createRepository(persistence),
    student: require("../adapters/persistence/sequelize/repositories/student").createRepository(persistence),
    enrollmentActions: require("../adapters/persistence/sequelize/repositories/enrollmentActions").createRepository(persistence),
    examAccess: require("../adapters/persistence/sequelize/repositories/examAccess").createRepository(persistence),
    authorization: require("../adapters/persistence/sequelize/repositories/authorization").createRepository(persistence),
    enrollment: require("../adapters/persistence/sequelize/repositories/enrollment").createRepository(persistence),
    activity: require("../adapters/persistence/sequelize/repositories/activity").createRepository(persistence),
    leaderboard: require("../adapters/persistence/sequelize/repositories/leaderboard").createRepository(persistence),
  };
  const shared = { unitOfWork, passwords: passwordAdapter, tokens: tokenAdapter, importQuestions: questionImporter };
  const enrollment = createEnrollmentService({ ...shared, data: repositories.enrollment });
  const activity = createExamActivity({ ...shared, data: repositories.activity });
  const leaderboard = createLeaderboard({ ...shared, data: repositories.leaderboard });
  const student = createStudentUseCases({ ...shared, data: repositories.student, activity });
  const professor = createProfessorUseCases({ ...shared, data: repositories.professor });
  const admin = createAdminUseCases({ ...shared, data: repositories.admin, enrollment });
  const enrollmentActions = createEnrollmentActions({ ...shared, data: repositories.enrollmentActions, enrollment });
  const examAccess = createExamAccessUseCases({ ...shared, data: repositories.examAccess, enrollment, enrollmentActions, activity, leaderboard, student });
  const authorization = createAuthorization({ ...shared, data: repositories.authorization });
  const users = require("../adapters/persistence/sequelize/repositories/authentication").createRepository(persistence);
  const authentication = createAuthentication({ users, passwords: passwordAdapter });
  return { authentication, enrollment, activity, leaderboard, student, professor, admin, enrollmentActions, examAccess, authorization };
}

module.exports = { ...createSystem(), createSystem };