# Sistema de Examen en Linea MVC (Node.js)

Proyecto base para la practica de usabilidad y accesibilidad en una arquitectura MVC.

## Stack
- Node.js + Express
- EJS (capa de vista)
- Sequelize + SQLite (capa de modelo)

## Ejecucion
1. Version de Node recomendada: **20.x o 22.x LTS** (ver bloque siguiente si usas una version muy nueva, p. ej. 25.x).
2. Instalar dependencias:
   - `npm install`
3. Cargar datos de ejemplo:
   - `npm run seed`
4. Iniciar aplicacion:
   - `npm run dev`
5. Abrir:
   - `http://localhost:3000`

### SQLite y errores tipo "Could not locate the bindings file"
No hace falta `.env`: la base SQLite es un archivo en `data/exam.sqlite` (solo se crea al ejecutar `npm run seed`).

Si al correr `npm run seed` aparece ese error sobre `sqlite3`/bindings, suele ser porque **`sqlite3` es binario nativo** y tu version de Node no tiene binario precompilado compatible.

Opciones (elige una):
- **Mas simple:** usar **Node 20 LTS o 22 LTS** (`nvm install 22` y `nvm use 22`), luego borrar `node_modules`, `npm install`, `npm run seed`.
- **Recompilar desde codigo fuente:** en la carpeta del proyecto, despues de `npm install`:
  - `npm rebuild sqlite3 --build-from-source`
  En macOS necesitas Xcode Command Line Tools (`xcode-select --install`).

Este proyecto declara soporte estable en `package.json` bajo `"engines"` (Node 18-22).

### Produccion sin Node en el equipo
Ejecutar igualmente en servidor o contenedor con imagen oficial `node:22-alpine`, instalar deps y lanzar (`npm ci`, `npm run seed`, `npm run dev`).

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
