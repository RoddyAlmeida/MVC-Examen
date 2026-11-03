const { assertPort, contracts } = require("../ports");
const { EnrollmentError } = require("../domain/enrollment");

function createEnrollmentService({ data }) {
  assertPort("enrollment", data, contracts.enrollment);
  async function activeEnrollment(userId, courseId) {
    if (!courseId || !await data.findActiveEnrollment(userId, courseId)) {
      throw new EnrollmentError("Debes estar inscrito en el curso para acceder a este examen.");
    }
  }

  async function studentByEmail(email) {
    const student = await data.findStudentByEmail(email);
    if (!student) throw new EnrollmentError("No existe un estudiante con ese correo.");
    return student;
  }

  async function enrollStudent(userId, courseId, status) {
    const student = await data.findStudentById(userId);
    if (!student || student.role !== "estudiante") throw new EnrollmentError("Solo puedes inscribir estudiantes.");
    if (!await data.findCourseById(courseId)) throw new EnrollmentError("El curso no existe.");
    const [enrollment] = await data.findOrCreateEnrollment(student, courseId, status);
    if (enrollment.status !== "active" && enrollment.status !== status) await data.update(enrollment, { status });
    return enrollment;
  }

  async function inviteExam(userId, examId) {
    const exam = await data.findExamById(examId);
    if (!exam) throw new EnrollmentError("El examen no existe.");
    const student = await data.findStudentById(userId);
    if (!student || student.role !== "estudiante") throw new EnrollmentError("Solo puedes invitar estudiantes.");
    await activeEnrollment(student.id, exam.courseId);
    const [assignment] = await data.findOrCreateInvitation(student, exam);
    if (assignment.status === "rejected") await data.update(assignment, { status: "invited" });
    return assignment;
  }

  async function activateAssignment(userId, exam) {
    await activeEnrollment(userId, exam.courseId);
    const [assignment] = await data.findOrCreateActiveAssignment(userId, exam);
    if (assignment.status !== "active") await data.update(assignment, { status: "active" });
    return assignment;
  }

  return { EnrollmentError, activeEnrollment, studentByEmail, enrollStudent, inviteExam, activateAssignment };
}

module.exports = { createEnrollmentService };
