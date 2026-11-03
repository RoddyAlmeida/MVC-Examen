const bcrypt = require("bcryptjs");
const { sequelize, Exam, Question, QuestionContent, User, ExamAssignment, Course, CourseEnrollment } = require("../persistence/sequelize/models/index");
const { initializeDatabase } = require("../persistence/sequelize/schemaMigration");
const { normalizeQuestionInput, legacyQuestionFields } = require("../../domain/questions");

const demoCourses = [
  {
    name: "Lengua y Literatura",
    questions: [
      { questionType: "multiple_choice", prompt: "Que palabra es un sustantivo?", optionText: ["Correr", "Rapidamente", "Azul", "Aunque", "Libro"], correctIndex: "4" },
      { questionType: "true_false", prompt: "El sujeto indica de quien se habla en una oracion.", correctBoolean: "true" },
      { questionType: "true_false", prompt: "Todos los poemas tienen rima consonante.", correctBoolean: "false" },
      { questionType: "fill_text", prompt: "Completa: una comparacion sin usar 'como' es una ____.", acceptedAnswers: "metafora" },
      { questionType: "fill_drag", prompt: "Completa la oracion con la clase de palabra adecuada.", fillTemplate: "En 'La casa blanca', la palabra 'blanca' es un {{blank}}.", dragAnswer: "adjetivo", dragOptions: "verbo\nadjetivo\nsustantivo" },
      { questionType: "concept", prompt: "Explica la diferencia entre metafora y simil. Escribe un ejemplo de cada uno." },
      { questionType: "crossword", prompt: "Completa el crucigrama de literatura.", crosswordEntries: "Obra literaria escrita en versos | POEMA\nCoincidencia de sonidos al final de versos | RIMA\nRelato extenso en prosa | NOVELA" },
    ],
  },
  {
    name: "Matematicas",
    questions: [
      { questionType: "multiple_choice", prompt: "Cuanto es 3 al cuadrado?", optionText: ["3", "6", "8", "9", "12"], correctIndex: "3" },
      { questionType: "true_false", prompt: "Un triangulo tiene tres lados.", correctBoolean: "true" },
      { questionType: "true_false", prompt: "El numero 1 es primo.", correctBoolean: "false" },
      { questionType: "fill_text", prompt: "Resuelve: 2x + 3 = 11. El valor de x es ____.", acceptedAnswers: "4\ncuatro" },
      { questionType: "fill_drag", prompt: "Completa la formula del area de un rectangulo.", fillTemplate: "El area de un rectangulo es base por {{blank}}.", dragAnswer: "altura", dragOptions: "perimetro\naltura\ndiagonal" },
      { questionType: "concept", prompt: "Explica la diferencia entre area y perimetro. Calcula ambos para un rectangulo de 5 cm por 3 cm." },
      { questionType: "crossword", prompt: "Completa el crucigrama de operaciones y geometria.", crosswordEntries: "Operacion que une cantidades | SUMA\nMedida de una superficie | AREA\nSegmento que une el centro y la circunferencia | RADIO" },
    ],
  },
  {
    name: "Fisica",
    questions: [
      { questionType: "multiple_choice", prompt: "Cual es la unidad de fuerza en el Sistema Internacional?", optionText: ["Metro", "Segundo", "Kilogramo", "Julio", "Newton"], correctIndex: "4" },
      { questionType: "true_false", prompt: "La rapidez media se calcula dividiendo la distancia recorrida entre el tiempo empleado.", correctBoolean: "true" },
      { questionType: "true_false", prompt: "La masa y el peso son la misma magnitud fisica.", correctBoolean: "false" },
      { questionType: "fill_text", prompt: "Un movil recorre 100 m en 20 s. Su rapidez media en m/s es ____.", acceptedAnswers: "5\n5 m/s\ncinco" },
      { questionType: "fill_drag", prompt: "Completa la segunda ley de Newton.", fillTemplate: "La fuerza neta es igual a la masa por la {{blank}}.", dragAnswer: "aceleracion", dragOptions: "velocidad\naceleracion\ndistancia" },
      { questionType: "concept", prompt: "Explica la diferencia entre masa y peso y que ocurre con cada uno al viajar de la Tierra a la Luna." },
      { questionType: "crossword", prompt: "Completa el crucigrama de magnitudes fisicas.", crosswordEntries: "Cantidad de materia de un cuerpo | MASA\nFuerza gravitatoria sobre un cuerpo | PESO\nUnidad de tiempo del Sistema Internacional | SEGUNDO" },
    ],
  },
];
const templateInputs = demoCourses[0].questions;

async function seedUsers() {
  const accounts = [
    { email: "profesor@example.com", password: "profesor123", role: "profesor", name: "Profesor" },
    { email: "estudiante@example.com", password: "estudiante123", role: "estudiante", name: "Estudiante de Lengua y Literatura" },
    { email: "estudiante2@example.com", password: "estudiante123", role: "estudiante", name: "Estudiante de Matematicas" },
    { email: "estudiante3@example.com", password: "estudiante123", role: "estudiante", name: "Estudiante de Fisica" },
    { email: "administrador@example.com", password: "administrador123", role: "administrador", name: "Administrador" },
  ];

  const users = { estudiantes: [] };
  for (const account of accounts) {
    const password = await bcrypt.hash(account.password, 10);
    const [user] = await User.findCreateFind({
      where: { email: account.email },
      defaults: { ...account, password },
    });
    if (user.role !== account.role) throw new Error(`La cuenta ${account.email} ya existe con otro rol.`);
    if (account.role === "estudiante") users.estudiantes.push(user);
    if (!users[account.role]) users[account.role] = user;
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
  const exams = [];
  for (const [index, demoCourse] of demoCourses.entries()) {
    const student = users.estudiantes[index];
    const [course] = await Course.findCreateFind({
      where: { professorId: users.profesor.id, name: demoCourse.name },
    });
    const [exam] = await Exam.findCreateFind({
      where: { title: `Examen de ejemplo: ${demoCourse.name}`, creatorId: users.profesor.id, courseId: course.id },
      defaults: { instructions: "Responde las siete preguntas. La respuesta de conceptos requiere revision del profesor." },
    });
    for (const input of demoCourse.questions) {
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
    await CourseEnrollment.findCreateFind({ where: { userId: student.id, courseId: course.id }, defaults: { status: "active" } });
    await ExamAssignment.findCreateFind({ where: { userId: student.id, examId: exam.id }, defaults: { status: "active" } });
    exams.push(exam);
  }
  return exams;
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

module.exports = { seed, seedUsers, seedTemplate, templateInputs, demoCourses, migrateDemoEmails };
