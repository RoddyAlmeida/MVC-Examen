const path = require("path");
const unzipper = require("unzipper");
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { normalizeQuestionInput } = require("../../domain/questions");

const MAX_PACKAGE_ENTRIES = 500;
const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const ITEM_RESOURCE_TYPE = "imsqti_item_xmlv3p0";
const TEST_RESOURCE_TYPE = "imsqti_test_xmlv3p0";
const SUPPORTED_INTERACTIONS = new Set([
  "qti-choice-interaction",
  "qti-text-entry-interaction",
  "qti-extended-text-interaction",
]);
const UNSUPPORTED_MEDIA_TAGS = new Set(["img", "audio", "video", "iframe", "object", "embed"]);

function isInteractionTag(tag) {
  return tag.startsWith("qti-") && tag.endsWith("-interaction");
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  textNodeName: "#text",
  trimValues: true,
  processEntities: true,
  parseTagValue: false,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textContent(value) {
  if (value === undefined || value === null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).filter(Boolean).join(" ");
  if (typeof value !== "object") return "";
  const directText = typeof value["#text"] === "string" ? value["#text"] : "";
  const nestedText = Object.entries(value)
    .filter(([key]) => !key.startsWith("@_") && key !== "#text")
    .map(([, child]) => textContent(child))
    .filter(Boolean)
    .join(" ");
  return [directText, nestedText].filter(Boolean).join(" ");
}

function collectInteractions(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item) => collectInteractions(item, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isInteractionTag(key)) {
      asArray(child).forEach((interaction) => found.push({ type: key, interaction }));
    } else {
      collectInteractions(child, found);
    }
  }
  return found;
}

function itemPrompt(value) {
  if (Array.isArray(value)) return value.map(itemPrompt).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return textContent(value);
  const parts = [];
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("@_") || key === "#text") continue;
    if (isInteractionTag(key)) {
      for (const interaction of asArray(child)) {
        if (interaction["qti-prompt"]) parts.push(textContent(interaction["qti-prompt"]));
        if (key === "qti-text-entry-interaction") parts.push("____");
      }
      continue;
    }
    const text = itemPrompt(child);
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function containsUnsupportedMedia(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsUnsupportedMedia);
  return Object.entries(value).some(([key, child]) => UNSUPPORTED_MEDIA_TAGS.has(key) || containsUnsupportedMedia(child));
}

function parseXml(xml, label) {
  if (Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES) throw new Error(`${label} supera el límite de tamaño permitido.`);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(`${label} contiene declaraciones XML no permitidas.`);
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`${label} no contiene XML válido.`);
  return parser.parse(xml);
}

function questionFromItem(xml, itemPath) {
  const document = parseXml(xml, `El recurso ${itemPath}`);
  const item = document["qti-assessment-item"];
  if (!item) throw new Error(`El recurso ${itemPath} no es un qti-assessment-item QTI 3.`);
  const body = item["qti-item-body"];
  if (!body) throw new Error(`El recurso ${itemPath} no tiene qti-item-body.`);
  if (containsUnsupportedMedia(body)) throw new Error(`El recurso ${itemPath} contiene imágenes o multimedia que esta aplicación no puede conservar.`);
  const interactions = collectInteractions(body);
  if (interactions.length !== 1) {
    throw new Error(`El recurso ${itemPath} debe tener una sola interacción compatible; se encontraron ${interactions.length}.`);
  }

  const { type: interactionType, interaction } = interactions[0];
  if (!SUPPORTED_INTERACTIONS.has(interactionType)) {
    throw new Error(`El recurso ${itemPath} usa ${interactionType}, una interacción QTI que aún no está soportada.`);
  }
  const responseId = interaction["@_response-identifier"];
  const declarations = asArray(item["qti-response-declaration"]);
  const declaration = declarations.find((candidate) => candidate["@_identifier"] === responseId);
  if (!declaration) throw new Error(`El recurso ${itemPath} no declara la respuesta ${responseId || "de la interacción"}.`);

  const correctValues = asArray(declaration["qti-correct-response"]?.["qti-value"]).map((value) => textContent(value));
  const prompt = itemPrompt(body) || String(item["@_title"] || "").trim();
  if (!prompt) throw new Error(`El recurso ${itemPath} no contiene un enunciado legible.`);

  let normalized;
  if (interactionType === "qti-choice-interaction") {
    if (declaration["@_cardinality"] !== "single" || (interaction["@_max-choices"] && interaction["@_max-choices"] !== "1")) {
      throw new Error(`El recurso ${itemPath} permite más de una selección; solo se admiten preguntas QTI de selección única.`);
    }
    const choices = asArray(interaction["qti-simple-choice"]).map((choice) => ({
      identifier: choice["@_identifier"],
      text: textContent(choice),
    }));
    const correctIndex = choices.findIndex((choice) => choice.identifier === correctValues[0]);
    if (choices.length < 2 || correctValues.length !== 1 || correctIndex < 0 || choices.some((choice) => !choice.text)) {
      throw new Error(`El recurso ${itemPath} no tiene opciones y una respuesta correcta únicas válidas.`);
    }
    const trueChoice = choices.find((choice) => /^(true|verdadero)$/i.test(choice.text));
    const falseChoice = choices.find((choice) => /^(false|falso)$/i.test(choice.text));
    if (choices.length === 2 && trueChoice && falseChoice) {
      normalized = normalizeQuestionInput({
        questionType: "true_false",
        prompt,
        correctBoolean: String(choices[correctIndex].identifier === trueChoice.identifier),
      });
    } else {
      normalized = normalizeQuestionInput({
        questionType: "multiple_choice",
        prompt,
        optionText: choices.map((choice) => choice.text),
        correctIndex: String(correctIndex),
      });
    }
  } else if (interactionType === "qti-text-entry-interaction") {
    const acceptedAnswers = [...new Set(correctValues.filter(Boolean))];
    if (!acceptedAnswers.length) throw new Error(`El recurso ${itemPath} no declara respuestas correctas para completar.`);
    normalized = normalizeQuestionInput({ questionType: "fill_text", prompt, acceptedAnswers: acceptedAnswers.join("\n") });
  } else if (interactionType === "qti-extended-text-interaction") {
    normalized = normalizeQuestionInput({ questionType: "concept", prompt });
  }

  return { ...normalized, sourceTitle: String(item["@_title"] || "").trim() };
}

function collectItemRefs(value, refs = []) {
  if (!value || typeof value !== "object") return refs;
  if (Array.isArray(value)) {
    value.forEach((item) => collectItemRefs(item, refs));
    return refs;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "qti-assessment-item-ref") {
      asArray(child).forEach((ref) => refs.push(ref["@_href"]));
    } else {
      collectItemRefs(child, refs);
    }
  }
  return refs;
}

function safePackagePath(value) {
  if (!value || value.includes("\\") || value.startsWith("/")) return null;
  const normalized = path.posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

async function parseQtiPackage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw new Error("Selecciona un paquete QTI 3 en formato .zip.");
  let directory;
  try {
    directory = await unzipper.Open.buffer(buffer);
  } catch (_error) {
    throw new Error("El archivo no es un paquete ZIP válido.");
  }
  if (directory.files.length > MAX_PACKAGE_ENTRIES) throw new Error("El paquete QTI contiene demasiados archivos.");
  const totalUncompressed = directory.files.reduce((sum, entry) => sum + (entry.uncompressedSize || 0), 0);
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("El contenido descomprimido del paquete supera el límite de 25 MB.");

  const files = new Map();
  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;
    const packagePath = safePackagePath(entry.path);
    if (!packagePath) throw new Error("El paquete incluye una ruta de archivo no permitida.");
    if (files.has(packagePath)) throw new Error(`El paquete repite el recurso ${packagePath}.`);
    files.set(packagePath, entry);
  }
  const manifestEntry = files.get("imsmanifest.xml");
  if (!manifestEntry) throw new Error("El paquete QTI no contiene imsmanifest.xml en su raíz.");
  const manifest = parseXml(await manifestEntry.buffer().then((data) => data.toString("utf8")), "imsmanifest.xml").manifest;
  if (!manifest) throw new Error("imsmanifest.xml no contiene una raíz manifest válida.");

  const resources = asArray(manifest.resources?.resource);
  const itemResources = resources.filter((resource) => resource["@_type"] === ITEM_RESOURCE_TYPE);
  if (!itemResources.length) throw new Error("No se encontraron recursos de pregunta QTI 3 (imsqti_item_xmlv3p0). QTI 2.x aún no está soportado.");
  if (itemResources.length > 100) throw new Error("El paquete contiene más de 100 preguntas.");

  const resourceByHref = new Map();
  for (const resource of itemResources) {
    const href = safePackagePath(resource["@_href"]);
    if (!href || !files.has(href)) throw new Error(`No se encontró el recurso QTI indicado: ${resource["@_href"] || "sin href"}.`);
    resourceByHref.set(href, resource);
  }

  let title = textContent(manifest.metadata?.lom?.general?.title?.string).trim();
  let instructions = "Lee cada pregunta y responde según se indica.";
  const testResource = resources.find((resource) => resource["@_type"] === TEST_RESOURCE_TYPE);
  let orderedHrefs = [];
  if (testResource?.["@_href"]) {
    const testHref = safePackagePath(testResource["@_href"]);
    const testEntry = testHref && files.get(testHref);
    if (testEntry) {
      const testDoc = parseXml(await testEntry.buffer().then((data) => data.toString("utf8")), `El recurso ${testHref}`);
      const assessmentTest = testDoc["qti-assessment-test"];
      if (assessmentTest) {
        title = String(assessmentTest["@_title"] || title).trim();
        const testDirectory = path.posix.dirname(testHref);
        orderedHrefs = collectItemRefs(assessmentTest)
          .map((href) => safePackagePath(path.posix.join(testDirectory, href)))
          .filter(Boolean);
      }
    }
  }

  const itemHrefs = orderedHrefs.length
    ? [...orderedHrefs.filter((href) => resourceByHref.has(href)), ...[...resourceByHref.keys()].filter((href) => !orderedHrefs.includes(href))]
    : [...resourceByHref.keys()];
  const questions = [];
  for (const href of itemHrefs) {
    const resource = resourceByHref.get(href);
    const itemXml = await files.get(href).buffer();
    const question = questionFromItem(itemXml.toString("utf8"), href);
    if (!title) title = question.sourceTitle;
    questions.push(question);
  }
  if (!title) title = "Examen QTI importado";
  return { title, instructions, questions };
}

module.exports = { parseQtiPackage, questionFromItem };
