const test = require("node:test");
const assert = require("node:assert/strict");
const yazl = require("yazl");
const {
    gradeQuestion,
    normalizeQuestionInput,
} = require("../src/domain/questions");
const { buildCrosswordLayout } = require("../src/domain/crossword");
const { parseQtiPackage, questionFromItem } = require("../src/adapters/import/qti");

function questionFrom(type, configuration) {
    return { content: { type, configuration: JSON.stringify(configuration) } };
}

function qtiItem({ title = "Item", prompt = "Question", interaction, responseDeclaration }) {
    return `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="item" title="${title}" time-dependent="false"><qti-response-declaration identifier="RESPONSE" ${responseDeclaration}><qti-correct-response><qti-value>${interaction.correct}</qti-value></qti-correct-response></qti-response-declaration><qti-item-body><p>${prompt}</p>${interaction.xml}</qti-item-body></qti-assessment-item>`;
}

function createQtiZip(files) {
    return new Promise((resolve, reject) => {
        const zip = new yazl.ZipFile();
        const chunks = [];
        zip.outputStream.on("data", (chunk) => chunks.push(chunk));
        zip.outputStream.on("error", reject);
        zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
        for (const [filePath, content] of Object.entries(files)) zip.addBuffer(Buffer.from(content), filePath);
        zip.end();
    });
}

test("multiple choice supports more than three options", () => {
    const normalized = normalizeQuestionInput({
        questionType: "multiple_choice",
        prompt: "Choose",
        optionText: ["A", "B", "C", "D", "E"],
        correctIndex: "4",
    });
    assert.equal(normalized.configuration.options.length, 5);
    assert.equal(gradeQuestion(questionFrom(normalized.type, normalized.configuration), "4"), true);
});

test("true/false grades boolean responses", () => {
    const question = questionFrom("true_false", { correctAnswer: false });
    assert.equal(gradeQuestion(question, "false"), true);
    assert.equal(gradeQuestion(question, "true"), false);
});

test("written completion accepts normalized alternatives", () => {
    const question = questionFrom("fill_text", { acceptedAnswers: ["Árbol", "Planta"] });
    assert.equal(gradeQuestion(question, " arbol "), true);
    assert.equal(gradeQuestion(question, "piedra"), false);
});

test("drag completion grades its configured answer", () => {
    const question = questionFrom("fill_drag", { answer: "Quito", options: ["Lima", "Quito"] });
    assert.equal(gradeQuestion(question, "quito"), true);
});

test("concept answers are left for manual review", () => {
    assert.equal(gradeQuestion(questionFrom("concept", {}), "respuesta libre"), null);
});

test("crossword generation crosses matching words and grades all entries", () => {
    const entries = [{ clue: "One", answer: "CASA" }, { clue: "Two", answer: "SALA" }];
    const layout = buildCrosswordLayout(entries);
    assert.equal(layout.words[0].direction, "horizontal");
    assert.equal(layout.words[1].direction, "vertical");
    assert.ok(layout.words[0].cells.some((firstCell) => layout.words[1].cells.some((secondCell) => firstCell.row === secondCell.row && firstCell.col === secondCell.col)));
    const question = questionFrom("crossword", { entries });
    assert.equal(gradeQuestion(question, ["casa", "sala"]), true);
    assert.equal(gradeQuestion(question, ["casa", "cama"]), false);
});

test("QTI 3 choice imports options and the declared correct response", () => {
    const xml = qtiItem({
        prompt: "Choose the correct answer.",
        interaction: {
            correct: "D",
            xml: '<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="A">Alpha</qti-simple-choice><qti-simple-choice identifier="B">Beta</qti-simple-choice><qti-simple-choice identifier="C">Gamma</qti-simple-choice><qti-simple-choice identifier="D">Delta</qti-simple-choice></qti-choice-interaction>',
        },
        responseDeclaration: 'cardinality="single" base-type="identifier"',
    });
    const question = questionFromItem(xml, "item.xml");
    assert.equal(question.type, "multiple_choice");
    assert.equal(question.configuration.options.length, 4);
    assert.equal(question.configuration.correctIndex, 3);
});

test("QTI 3 true/false choices map to the native boolean type", () => {
    const xml = qtiItem({
        interaction: {
            correct: "T",
            xml: '<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="T">True</qti-simple-choice><qti-simple-choice identifier="F">False</qti-simple-choice></qti-choice-interaction>',
        },
        responseDeclaration: 'cardinality="single" base-type="identifier"',
    });
    const question = questionFromItem(xml, "truth.xml");
    assert.equal(question.type, "true_false");
    assert.equal(question.configuration.correctAnswer, true);
});

test("QTI 3 text entry and extended text map to supported app types", () => {
    const textEntry = `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="entry" title="Entry" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string"><qti-correct-response><qti-value>York</qti-value><qti-value>New York</qti-value></qti-correct-response></qti-response-declaration><qti-item-body><p>The city is <qti-text-entry-interaction response-identifier="RESPONSE"/>.</p></qti-item-body></qti-assessment-item>`;
    const entryQuestion = questionFromItem(textEntry, "entry.xml");
    assert.equal(entryQuestion.type, "fill_text");
    assert.deepEqual(entryQuestion.configuration.acceptedAnswers, ["York", "New York"]);
    assert.match(entryQuestion.prompt, /____/);

    const extendedText = `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="essay" title="Essay" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string"/><qti-item-body><p>Explain the concept.</p><qti-extended-text-interaction response-identifier="RESPONSE"/></qti-item-body></qti-assessment-item>`;
    assert.equal(questionFromItem(extendedText, "essay.xml").type, "concept");
});

test("QTI 3 package follows test item order and imports atomically as one exam", async () => {
    const firstItem = qtiItem({
        title: "First resource",
        prompt: "First question",
        interaction: { correct: "A", xml: '<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="A">Yes</qti-simple-choice><qti-simple-choice identifier="B">No</qti-simple-choice></qti-choice-interaction>' },
        responseDeclaration: 'cardinality="single" base-type="identifier"',
    });
    const secondItem = qtiItem({
        title: "Second resource",
        prompt: "Second question",
        interaction: { correct: "A", xml: '<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="A">True</qti-simple-choice><qti-simple-choice identifier="B">False</qti-simple-choice></qti-choice-interaction>' },
        responseDeclaration: 'cardinality="single" base-type="identifier"',
    });
    const manifest = `<manifest xmlns="http://www.imsglobal.org/xsd/qti/qtiv3p0/imscp_v1p1"><metadata><schema>QTI Package</schema><schemaversion>3.0.0</schemaversion><lom><general><title><string>Package title</string></title></general></lom></metadata><resources><resource identifier="a" type="imsqti_item_xmlv3p0" href="items/a.xml"><file href="items/a.xml"/></resource><resource identifier="b" type="imsqti_item_xmlv3p0" href="items/b.xml"><file href="items/b.xml"/></resource><resource identifier="test" type="imsqti_test_xmlv3p0" href="test.xml"><file href="test.xml"/></resource></resources></manifest>`;
    const testXml = `<qti-assessment-test xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="test" title="QTI final"><qti-test-part identifier="part" navigation-mode="nonlinear" submission-mode="individual"><qti-assessment-section identifier="section" title="Section" visible="true"><qti-assessment-item-ref identifier="b" href="items/b.xml"/><qti-assessment-item-ref identifier="a" href="items/a.xml"/></qti-assessment-section></qti-test-part></qti-assessment-test>`;
    const packageBuffer = await createQtiZip({
        "imsmanifest.xml": manifest,
        "items/a.xml": firstItem,
        "items/b.xml": secondItem,
        "test.xml": testXml,
    });
    const imported = await parseQtiPackage(packageBuffer);
    assert.equal(imported.title, "QTI final");
    assert.deepEqual(imported.questions.map((question) => question.prompt), ["Second question", "First question"]);
});

test("QTI controller imports into the professor assigned course", async (context) => {
    const { sequelize, Exam, Question, QuestionContent } = require("../src/adapters/persistence/sequelize/models/index");
    const controller = require("../src/adapters/http/controllers/professorController");
    const xml = qtiItem({
        prompt: "Choose",
        interaction: { correct: "A", xml: '<qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="A">Yes</qti-simple-choice><qti-simple-choice identifier="B">No</qti-simple-choice></qti-choice-interaction>' },
        responseDeclaration: 'cardinality="single" base-type="identifier"',
    });
    const buffer = await createQtiZip({
        "imsmanifest.xml": '<manifest><resources><resource identifier="item" type="imsqti_item_xmlv3p0" href="item.xml"><file href="item.xml"/></resource></resources></manifest>',
        "item.xml": xml,
    });
    const transaction = {};
    context.mock.method(sequelize, "transaction", async callback => callback(transaction));
    context.mock.method(Exam, "create", async (values, options) => {
        assert.equal(values.courseId, 3);
        assert.equal(values.creatorId, 7);
        assert.equal(options.transaction, transaction);
        return { id: 9 };
    });
    context.mock.method(Question, "create", async (values, options) => {
        assert.equal(values.examId, 9);
        assert.equal(options.transaction, transaction);
        return { id: 10 };
    });
    context.mock.method(QuestionContent, "create", async (values, options) => {
        assert.equal(values.questionId, 10);
        assert.equal(options.transaction, transaction);
    });
    await controller.importExam({ session: { userId: 7 }, course: { id: 3 }, file: { originalname: "qti.zip", buffer } }, {
        redirect(path) { assert.equal(path, "/professor/exams/9/questions"); },
        status() { assert.fail("Import failed"); },
    });
});

test("QTI import rejects unsupported interactions and multimedia", () => {
    const customInteraction = `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="custom" title="Custom" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="string"/><qti-item-body><p>Prompt</p><qti-gap-match-interaction response-identifier="RESPONSE"/></qti-item-body></qti-assessment-item>`;
    assert.throws(() => questionFromItem(customInteraction, "custom.xml"), /no está soportada/);

    const media = `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="media" title="Media" time-dependent="false"><qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>A</qti-value></qti-correct-response></qti-response-declaration><qti-item-body><img src="image.png" alt="image"/><qti-choice-interaction response-identifier="RESPONSE" max-choices="1"><qti-simple-choice identifier="A">Yes</qti-simple-choice><qti-simple-choice identifier="B">No</qti-simple-choice></qti-choice-interaction></qti-item-body></qti-assessment-item>`;
    assert.throws(() => questionFromItem(media, "media.xml"), /no puede conservar/);
});
