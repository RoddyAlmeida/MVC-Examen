const { sequelize, Exam, Question } = require("../models");

async function seed() {
  await sequelize.sync({ force: true });

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

seed().catch(async (error) => {
  console.error("Error durante el seed:", error);
  await sequelize.close();
  process.exit(1);
});
