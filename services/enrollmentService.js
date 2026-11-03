const { User, Exam, Course, CourseEnrollment, ExamAssignment } = require("../models");

class EnrollmentError extends Error {
    constructor(message) { super(message); this.name = "EnrollmentError"; }
}

async function activeEnrollment(userId, courseId) {
    if (!courseId || !await CourseEnrollment.findOne({ where: { userId, courseId, status: "active" } })) {
        throw new EnrollmentError("Debes estar inscrito en el curso para acceder a este examen.");
    }
}

async function studentByEmail(email) {
    const student = await User.findOne({ where: { email: String(email || "").trim().toLowerCase(), role: "estudiante" } });
    if (!student) throw new EnrollmentError("No existe un estudiante con ese correo.");
    return student;
}

async function enrollStudent(userId, courseId, status) {
    const student = await User.findByPk(userId);
    if (!student || student.role !== "estudiante") throw new EnrollmentError("Solo puedes inscribir estudiantes.");
    if (!await Course.findByPk(courseId)) throw new EnrollmentError("El curso no existe.");
    const [enrollment] = await CourseEnrollment.findCreateFind({ where: { userId: student.id, courseId: Number(courseId) }, defaults: { status } });
    if (enrollment.status !== "active" && enrollment.status !== status) await enrollment.update({ status });
    return enrollment;
}

async function inviteExam(userId, examId) {
    const exam = await Exam.findByPk(examId);
    if (!exam) throw new EnrollmentError("El examen no existe.");
    const student = await User.findByPk(userId);
    if (!student || student.role !== "estudiante") throw new EnrollmentError("Solo puedes invitar estudiantes.");
    await activeEnrollment(student.id, exam.courseId);
    const [assignment] = await ExamAssignment.findCreateFind({ where: { userId: student.id, examId: exam.id }, defaults: { status: "invited" } });
    if (assignment.status === "rejected") await assignment.update({ status: "invited" });
    return assignment;
}

async function activateAssignment(userId, exam) {
    await activeEnrollment(userId, exam.courseId);
    const [assignment] = await ExamAssignment.findCreateFind({ where: { userId, examId: exam.id }, defaults: { status: "active" } });
    if (assignment.status !== "active") await assignment.update({ status: "active" });
    return assignment;
}

module.exports = { EnrollmentError, activeEnrollment, studentByEmail, enrollStudent, inviteExam, activateAssignment };