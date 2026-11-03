const bcrypt = require("bcryptjs");
const { sequelize, Exam, Question, QuestionContent, User, ExamAssignment, Course } = require("../models");
const { initializeDatabase } = require("../services/schemaMigration");
const { normalizeQuestionInput, legacyQuestionFields } = require("../services/questionService");

const templateInputs = [
  { questionType: "multiple_choice", prompt: "Que opcion facilita el uso de una interfaz?", optionText: ["Ocultar etiquetas", "Depender solo del color", "Eliminar el foco", "Usar mensajes ambiguos", "Mostrar etiquetas claras"], correctIndex: "4" },
  { questionType: "true_false", prompt: "Una etiqueta clara mejora la accesibilidad.", correctBoolean: "true" },
  { questionType: "true_false", prompt: "El color debe ser el unico medio de transmitir un error.", correctBoolean: "false" },
  { questionType: "fill_text", prompt: "Completa: la tecla que permite avanzar entre controles es ____.", acceptedAnswers: "Tab\nTabulador" },
  { questionType: "fill_drag", prompt: "Completa la frase con la opcion adecuada.", fillTemplate: "El {{blank}} visible permite identificar el control seleccionado.", dragAnswer: "foco", dragOptions: "foco\ncolor\nsonido" },
  { questionType: "concept", prompt: "Explica el concepto de accesibilidad y propone dos mejoras para un formulario." },
  { questionType: "crossword", prompt: "Completa el crucigrama siguiendo las pistas.", crosswordEntries: "Lugar donde vive una familia | CASA\nHabitacion para recibir visitas | SALA\nRepresentacion de un territorio | MAPA" },
];

async function seedUsers() {
  const accounts = [
    { email: "profesor@example.com", password: "profesor123", role: "profesor", name: "Profesor" },
    { email: "estudiante@example.com", password: "estudiante123", role: "estudiante", name: "Estudiante" },
    { email: "administrador@example.com", password: "administrador123", role: "administrador", name: "Administrador" },
  ];

  const users = {};
  for (const account of accounts) {
    const password = await bcrypt.hash(account.password, 10);
    const [user] = await User.findCreateFind({
      where: { email: account.email },
      defaults: { ...account, password },
    });
    if (user.role !== account.role) throw new Error(`La cuenta ${account.email} ya existe con otro rol.`);
    users[account.role] = user;
  }
  return users;
}

async function migrateDemoEmails() {
  for (const role of ["profesor", "estudiante"]) {
    const previous = await User.findOne({ where: { email: `${role}@pucese.edu.ec` } });
    if (!previous) continue;
    const email = `${role}@example.com`;
    if (await User.findOne({ where: { email } })) throw new Error(`No se pudo migrar la cuenta de prueba: ${email} ya existe.`);
    await previous.update({ email });
  }
}

async function seedTemplate(users) {
  const [course] = await Course.findCreateFind({
    where: { professorId: users.profesor.id },
    defaults: { name: "Accesibilidad e interfaces" },
  });
  const [exam] = await Exam.findCreateFind({
    where: { title: "Plantilla de todos los tipos de pregunta", creatorId: users.profesor.id },
    defaults: { courseId: course.id, instructions: "Responde todas las preguntas. La respuesta de conceptos requiere revision del profesor." },
  });
  if (exam.courseId !== course.id) await exam.update({ courseId: course.id });

  for (const input of templateInputs) {
    const normalized = normalizeQuestionInput(input);
    const [question] = await Question.findCreateFind({
      where: { examId: exam.id, prompt: normalized.prompt },
      defaults: legacyQuestionFields(normalized.type, normalized.configuration),
    });
    await QuestionContent.findCreateFind({
      where: { questionId: question.id },
      defaults: { type: normalized.type, configuration: JSON.stringify(normalized.configuration) },
    });
  }
  await ExamAssignment.findCreateFind({ where: { userId: users.estudiante.id, examId: exam.id } });
  return exam;
}

async function seed() {
  const usersOnly = process.argv.includes("--users-only");
  const preserveData = usersOnly || process.argv.includes("--demo");
  if (preserveData) {
    await initializeDatabase();
    await migrateDemoEmails();
  } else {
    await sequelize.sync({ force: true });
  }
  const users = await seedUsers();
  if (!usersOnly) await seedTemplate(users);
  console.log("Datos iniciales cargados.");
  await sequelize.close();
}

if (require.main === module) {
  seed().catch(async (error) => {
    console.error("Error durante el seed:", error);
    await sequelize.close();
    process.exit(1);
  });
}

module.exports = { seedUsers, seedTemplate, templateInputs, migrateDemoEmails };
