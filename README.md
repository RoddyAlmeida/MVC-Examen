# Sistema de Examen en Linea MVC (Node.js)

Proyecto base para la practica de usabilidad y accesibilidad en una arquitectura MVC.

## Stack
- Node.js + Express
- EJS (capa de vista)
- Sequelize + SQLite (capa de modelo)

## Ejecucion
1. Instalar dependencias:
   - `npm install`
2. Cargar datos de ejemplo:
   - `npm run seed`
3. Iniciar aplicacion:
   - `npm run dev`
4. Abrir:
   - `http://localhost:3000`

## Estructura MVC
- `models/`: entidades `Exam` y `Question`
- `controllers/`: logica del flujo del examen
- `routes/`: endpoints del modulo de examen
- `views/`: interfaz accesible con EJS

## Criterios de usabilidad y accesibilidad implementados
- Maximo 5 preguntas por pantalla (ergonomia cognitiva)
- Mensajes de error con texto + icono (no solo color)
- Controles navegables por teclado y foco visible
- Etiquetas claras para lector de pantalla (`aria-label`, `role`, `aria-live`)
- Lectura guiada en espanol para preguntas/opciones, enfocada en navegacion por teclado
- La lectura se detiene al enviar el examen o cambiar de pagina
- Atajos de productividad: `Alt+L` (limpiar), `Alt+I` (inicio), `Ctrl+Enter` (enviar)

## Documentacion para entrega
- `docs/uml.md`
- `docs/informe-ux.md`
- `docs/evaluacion-heuristica.md`
- `docs/think-aloud.md`
