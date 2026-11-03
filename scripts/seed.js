const bcrypt = require("bcryptjs");
const { sequelize, Exam, Question, User } = require("../models");

async function seedUsers() {
  const accounts = [
    { email: "profesor@pucese.edu.ec", password: "profesor123", role: "profesor", name: "Profesor" },
    { email: "estudiante@pucese.edu.ec", password: "estudiante123", role: "estudiante", name: "Estudiante" },
  ];

  for (const account of accounts) {
    const password = await bcrypt.hash(account.password, 10);
    await User.findCreateFind({
      where: { email: account.email },
      defaults: { ...account, password },
    });
  }
}

async function seed() {
  const usersOnly = process.argv.includes("--users-only");
  await sequelize.sync({ force: !usersOnly });
  await seedUsers();

  if (usersOnly) {
    console.log("Cuentas de prueba disponibles. Las cuentas existentes no se modificaron.");
    await sequelize.close();
    return;
  }

  const exam = await Exam.create({
    title: "Examen de Introduccion a HCI",
    instructions:
      "Lee cada pregunta y selecciona una respuesta. Se prioriza una experiencia clara y accesible.",
  });

  await Question.bulkCreate([
    {
      examId: exam.id,
      prompt: "Que principio reduce la sobrecarga de memoria en la pantalla?",
      optionA: "Mostrar 30 opciones por bloque",
      optionB: "Limitar elementos visibles y jerarquizar",
      optionC: "Ocultar etiquetas y usar abreviaturas",
      correctOption: "B",
    },
    {
      examId: exam.id,
      prompt: "Que practica mejora accesibilidad para lectores de pantalla?",
      optionA: "Etiquetas claras y nombres descriptivos",
      optionB: "Solo iconos sin texto alternativo",
      optionC: "Mensajes unicamente por color",
      correctOption: "A",
    },
    {
      examId: exam.id,
      prompt: "Como se garantiza independencia del color?",
      optionA: "Usar rojo y verde exclusivamente",
      optionB: "Agregar iconos y texto explicativo",
      optionC: "Quitar mensajes de error",
      correctOption: "B",
    },
    {
      examId: exam.id,
      prompt: "Que valida la tecnica Think Aloud?",
      optionA: "Rendimiento del servidor",
      optionB: "Dificultades de navegacion del usuario",
      optionC: "Version de Node instalada",
      correctOption: "B",
    },
    {
      examId: exam.id,
      prompt: "Cual opcion apoya flexibilidad de entrada?",
      optionA: "Control total por teclado y mouse",
      optionB: "Solo atajos ocultos",
      optionC: "Desactivar foco visible",
      correctOption: "A",
    },
  ]);

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

module.exports = { seedUsers };
