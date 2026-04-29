# Diagrama UML (texto base)

## Clases principales

### Exam
- id: integer
- title: string
- instructions: text

### Question
- id: integer
- examId: integer
- prompt: string
- optionA: string
- optionB: string
- optionC: string
- correctOption: enum(A, B, C)

## Relaciones
- `Exam 1..* Question`

## Mapeo MVC
- Modelo: `Exam`, `Question` y acceso SQLite con Sequelize
- Vista: plantillas EJS en `views/exams`
- Controlador: `controllers/examController.js`
