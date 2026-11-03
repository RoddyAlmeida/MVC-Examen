const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createAuthentication } = require("../src/application/authentication");
const { createEnrollmentService } = require("../src/application/enrollment");
const { contracts } = require("../src/ports");

test("commands use direct source entry points without root compatibility bridges", () => {
  const root = path.join(__dirname, "..");
  const manifest = require("../package.json");
  assert.equal(manifest.main, "src/adapters/desktop/main.js");
  assert.equal(manifest.scripts.dev, "node src/bootstrap/server.js");
  assert.equal(manifest.scripts.start, "node src/bootstrap/server.js");
  assert.equal(manifest.scripts.seed, "node src/adapters/cli/seed.js");
  for (const file of [manifest.main, "src/bootstrap/server.js", "src/adapters/cli/seed.js", "src/adapters/desktop/preload.js"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `Missing entry point: ${file}`);
  }
  assert.equal(fs.existsSync(path.join(root, "app.js")), false);
  for (const directory of ["controllers", "models", "routes", "services", "middleware", "config", "scripts", "electron"]) {
    const location = path.join(root, directory);
    if (fs.existsSync(location)) assert.equal(fs.readdirSync(location).filter(file => file.endsWith(".js")).length, 0, `Obsolete bridge in ${directory}`);
  }
});

test("domain, application and ports load without frameworks, database or external adapters", () => {
  const sourceRoot = path.join(__dirname, "../src");
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const layer = path.relative(sourceRoot, file).split(path.sep)[0];
    assert.ok(["domain", "application", "ports"].includes(layer), `Forbidden dependency: ${file}`);
    const module = { exports: {} };
    modules.set(file, module);
    vm.runInNewContext(fs.readFileSync(file, "utf8"), {
      module,
      require(request) {
        assert.ok(request.startsWith("."), `External dependency in ${file}: ${request}`);
        const resolved = require.resolve(path.resolve(path.dirname(file), request));
        const dependencyLayer = path.relative(sourceRoot, resolved).split(path.sep)[0];
        const allowed = layer === "domain" ? ["domain"] : layer === "ports" ? ["ports"] : ["domain", "application", "ports"];
        assert.ok(allowed.includes(dependencyLayer), `${layer} must not depend on ${dependencyLayer}`);
        return load(resolved);
      },
    }, { filename: file });
    return module.exports;
  }
  for (const layer of ["domain", "application", "ports"]) {
    for (const file of fs.readdirSync(path.join(sourceRoot, layer))) {
      if (file.endsWith(".js")) load(path.join(sourceRoot, layer, file));
    }
  }
});

test("authentication use cases run with in-memory users and a replaceable password adapter", async () => {
  const accounts = new Map();
  const authentication = createAuthentication({
    users: {
      async findByEmail(email) { return accounts.get(email); },
      async create(account) { accounts.set(account.email, { ...account, id: 7 }); },
    },
    passwords: {
      async hash(value) { return `hashed:${value}`; },
      async compare(value, hashed) { return hashed === `hashed:${value}`; },
    },
  });
  assert.deepEqual(await authentication.register({ email: " Student@Example.com ", password: "test123", name: "Student" }), { registered: true });
  assert.equal(accounts.get("student@example.com").password, "hashed:test123");
  assert.deepEqual(await authentication.login({ email: "student@example.com", password: "test123" }), { user: { id: 7, role: "estudiante", name: "Student" } });
  assert.equal((await authentication.login({ email: "student@example.com", password: "wrong" })).error, "invalid_credentials");
  assert.equal((await authentication.register({ email: "student@example.com", password: "test123" })).error, "duplicate_email");
});

test("enrollment policies use plain records and never grant access without active membership", async () => {
  let membership = null;
  let assignment = null;
  let writes = 0;
  const data = Object.fromEntries(contracts.enrollment.map(name => [name, async () => assert.fail(`Unexpected operation: ${name}`)]));
  data.findActiveEnrollment = async (userId, courseId) => {
    assert.equal(userId, 7);
    assert.equal(courseId, 3);
    return membership;
  };
  data.findOrCreateActiveAssignment = async (userId, exam) => {
    assert.equal(exam.id, 9);
    assert.equal(userId, 7);
    writes += 1;
    assignment = { userId, examId: exam.id, status: "invited" };
    return [assignment, true];
  };
  data.update = async (record, values) => Object.assign(record, values);
  const enrollment = createEnrollmentService({ data });
  await assert.rejects(enrollment.activateAssignment(7, { id: 9, courseId: 3 }), /inscrito en el curso/);
  assert.equal(writes, 0);
  membership = { userId: 7, courseId: 3, status: "active" };
  await enrollment.activateAssignment(7, { id: 9, courseId: 3 });
  assert.equal(assignment.status, "active");
});

test("missing persistence operations fail at composition rather than during an HTTP request", () => {
  assert.throws(() => createEnrollmentService({ data: {} }), /puerto enrollment requiere/);
});

test("HTTP adaptation preserves session changes after failures and does not undo downstream middleware", async () => {
  const { adapt } = require("../src/adapters/http/controller");
  const req = { session: { userId: 7, cookie: {} } };
  const res = { locals: {} };
  await assert.rejects(adapt(async context => {
    context.session.codeAttempts = { count: 1 };
    throw new Error("Invalid code");
  })(req, res), /Invalid code/);
  assert.equal(req.session.codeAttempts.count, 1);
  await adapt(async (context, output, next) => {
    context.session.role = "estudiante";
    next();
  })(req, res, () => { req.session.examAnswersByExam = { 9: { question_1: "0" } }; });
  assert.equal(req.session.role, "estudiante");
  assert.equal(req.session.examAnswersByExam[9].question_1, "0");
});

test("persistence returns plain nested records while retaining update and delete ownership in its adapter", async () => {
  const { toRecord, update, destroy } = require("../src/adapters/persistence/sequelize/repositories/records");
  let deleted = false;
  const child = { get() { return { id: 2, type: "concept" }; }, async update() {} };
  const entity = {
    values: { id: 1, prompt: "Question", content: child },
    get() { return this.values; },
    async update(values) { Object.assign(this.values, values); return this; },
    async destroy() { deleted = true; },
  };
  const record = toRecord(entity);
  assert.deepEqual(record, { id: 1, prompt: "Question", content: { id: 2, type: "concept" } });
  assert.equal(record.update, undefined);
  assert.equal(record.content.update, undefined);
  await update(record, { prompt: "Updated" });
  assert.equal(record.prompt, "Updated");
  await destroy(record);
  assert.equal(deleted, true);
});