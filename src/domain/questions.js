const QUESTION_TYPES = new Set([
  "multiple_choice",
  "true_false",
  "fill_text",
  "fill_drag",
  "concept",
  "crossword",
]);

function lines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAnswer(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeQuestionInput(body) {
  const type = body.questionType || "multiple_choice";
  const prompt = String(body.prompt || "").trim();
  if (!QUESTION_TYPES.has(type)) throw new Error("Selecciona un tipo de pregunta válido.");
  if (!prompt) throw new Error("El enunciado es obligatorio.");

  let configuration = {};
  if (type === "multiple_choice") {
    const options = (Array.isArray(body.optionText) ? body.optionText : [body.optionText])
      .map((text) => String(text || "").trim())
      .filter(Boolean);
    const correctIndex = Number(body.correctIndex);
    if (options.length < 2) throw new Error("La opción múltiple necesita al menos dos opciones.");
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      throw new Error("Marca cuál es la respuesta correcta.");
    }
    configuration = { options, correctIndex };
  } else if (type === "true_false") {
    if (!["true", "false"].includes(body.correctBoolean)) {
      throw new Error("Selecciona Verdadero o Falso como respuesta correcta.");
    }
    configuration = { correctAnswer: body.correctBoolean === "true" };
  } else if (type === "fill_text") {
    const acceptedAnswers = lines(body.acceptedAnswers);
    if (!acceptedAnswers.length) throw new Error("Añade al menos una respuesta aceptada.");
    configuration = { acceptedAnswers };
  } else if (type === "fill_drag") {
    const template = String(body.fillTemplate || "").trim();
    const answer = String(body.dragAnswer || "").trim();
    const options = lines(body.dragOptions);
    if (!template.includes("{{blank}}")) throw new Error("La frase debe incluir {{blank}} donde va la respuesta.");
    if (!answer) throw new Error("Indica la respuesta que completa la frase.");
    if (!options.some((option) => normalizeAnswer(option) === normalizeAnswer(answer))) options.unshift(answer);
    configuration = { template, answer, options };
  } else if (type === "crossword") {
    const entries = lines(body.crosswordEntries).map((line) => {
      const separator = line.indexOf("|");
      return separator < 0
        ? null
        : { clue: line.slice(0, separator).trim(), answer: line.slice(separator + 1).trim() };
    });
    if (entries.length < 2 || entries.some((entry) => !entry || !entry.clue || !/^[\p{L}\p{N}]{2,25}$/u.test(entry.answer))) {
      throw new Error("Añade al menos dos pistas en formato pista | respuesta (de 2 a 25 letras o números por respuesta).");
    }
    if (entries.length > 15) throw new Error("Cada crucigrama admite hasta 15 palabras.");
    configuration = { entries };
  }

  return { type, prompt, configuration };
}

function getQuestionDefinition(question) {
  if (question.content) {
    try {
      return {
        type: question.content.type,
        configuration: JSON.parse(question.content.configuration || "{}"),
      };
    } catch (_error) {
      return { type: "multiple_choice", configuration: { options: [], correctIndex: 0 } };
    }
  }

  const options = [question.optionA, question.optionB, question.optionC].filter(Boolean);
  return {
    type: "multiple_choice",
    configuration: {
      options: options.map((text, index) => ({ text, correct: "ABC"[index] === question.correctOption })),
      correctIndex: Math.max(0, "ABC".indexOf(question.correctOption)),
    },
  };
}

function legacyQuestionFields(type, configuration) {
  if (type === "multiple_choice") {
    const options = configuration.options;
    return {
      optionA: options[0] || "",
      optionB: options[1] || "",
      optionC: options[2] || "",
      correctOption: "ABC"[configuration.correctIndex] || "A",
    };
  }
  if (type === "true_false") {
    return {
      optionA: "Verdadero",
      optionB: "Falso",
      optionC: "",
      correctOption: configuration.correctAnswer ? "A" : "B",
    };
  }
  const fallback = type === "fill_text"
    ? configuration.acceptedAnswers[0]
    : type === "fill_drag"
      ? configuration.answer
      : "Respuesta de desarrollo";
  return { optionA: fallback || "", optionB: "", optionC: "", correctOption: "A" };
}

function gradeQuestion(question, answer) {
  const { type, configuration } = getQuestionDefinition(question);
  if (type === "concept") return null;
  if (type === "multiple_choice") return Number(answer) === Number(configuration.correctIndex);
  if (type === "true_false") return String(answer) === String(configuration.correctAnswer);
  if (type === "fill_text") {
    return configuration.acceptedAnswers.some((accepted) => normalizeAnswer(answer) === normalizeAnswer(accepted));
  }
  if (type === "fill_drag") return normalizeAnswer(answer) === normalizeAnswer(configuration.answer);
  if (type === "crossword") {
    return configuration.entries.every((entry, index) => normalizeAnswer(answer?.[index]) === normalizeAnswer(entry.answer));
  }
  return false;
}

module.exports = {
  QUESTION_TYPES,
  getQuestionDefinition,
  gradeQuestion,
  legacyQuestionFields,
  normalizeAnswer,
  normalizeQuestionInput,
};
