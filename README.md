# 🎓 Sistema de Examen en Línea MVC

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Sequelize](https://img.shields.io/badge/Sequelize-52B0E7?style=for-the-badge&logo=sequelize&logoColor=white)

Aplicación de exámenes con arquitectura MVC, interfaz EJS y cliente de escritorio en Electron. El proyecto está orientado a accesibilidad y a un flujo simple de ejecución local o empaquetada para Windows.

## Características

- Interfaz de examen con navegación por teclado, roles semánticos y mensajes accesibles.
- Cliente Electron que abre la aplicación local en una ventana controlada.
- Integración con Sequelize y base de datos remota vía Turso configurada mediante `.env`.
- Scripts separados para desarrollo web, Electron, carga de datos y build de instalador.
- Hasta 100 preguntas por examen: opción múltiple con cualquier número de opciones, verdadero/falso, completar escrito o arrastrando, conceptos con revisión manual y crucigramas generados desde pistas.
- Importación de paquetes de evaluación QTI 3 (1EdTech) con una lista explícita de interacciones soportadas.

## Stack

- Backend: Node.js + Express
- Vistas: EJS
- Persistencia: Sequelize + `@libsql/sqlite3`
- Escritorio: Electron

## Requisitos

- Node.js 20 o superior
- `pnpm`
- Un archivo `.env` en la raíz del proyecto con las variables de Turso

## Configuración

1. Copia `.env.example` a `.env`.
2. Completa `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
3. Instala dependencias con `pnpm install`.

## Ejecución

### Iniciar la app web

```bash
pnpm run dev
```

### Iniciar Electron

```bash
pnpm run electron
```

### Cargar datos de ejemplo

```bash
pnpm run seed
```

**Aviso:** el seed sincroniza la base de datos con `force: true`; elimina las tablas existentes antes de crear los datos de ejemplo.

Para crear solamente las cuentas de prueba sin borrar datos ni modificar cuentas existentes:

```bash
pnpm run seed -- --users-only
```

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Profesor | <profesor@pucese.edu.ec> | profesor123 |
| Estudiante | <estudiante@pucese.edu.ec> | estudiante123 |

El login y el registro normalizan el correo a minúsculas y eliminan espacios exteriores. Estas cuentas son solo para pruebas; no las uses en producción.

### Importar un examen

Desde el panel del profesor, selecciona **Importar examen QTI** y carga un paquete `.zip` de hasta 10 MB. Debe ser un paquete QTI 3 con `imsmanifest.xml` en la raíz y recursos `imsqti_item_xmlv3p0`. Si incluye un recurso de evaluación QTI, se respeta el orden de sus referencias a los ítems. La importación se guarda en una transacción.

QTI (Question & Test Interoperability) es el estándar de 1EdTech para intercambiar ítems y pruebas entre herramientas de autoría y plataformas de evaluación. Esta app implementa un subconjunto, no afirma conformidad/certificación completa:

- `choiceInteraction` de selección única, incluida verdadero/falso cuando las opciones están etiquetadas como True/False o Verdadero/Falso.
- `textEntryInteraction` con respuestas correctas declaradas.
- `extendedTextInteraction`, que queda pendiente de corrección manual.

Se rechazan selección múltiple, interacciones no implementadas e ítems con imágenes o multimedia para evitar perder contenido silenciosamente. El crucigrama de esta app no tiene una interacción QTI portátil equivalente y no se importa. Consulta la [guía oficial QTI 3](https://www.imsglobal.org/spec/qti/v3p0/guide) y los [paquetes de ejemplo de 1EdTech](https://github.com/1EdTech/qti-examples/tree/master/qtiv3-examples/packaging) para crear o exportar el archivo desde una herramienta compatible.

## Build de Windows

Para generar el instalador `.exe`:

```bash
pnpm run build:win
```

Si el instalador abre pero no muestra contenido, revisa que el archivo `.env` exista en la raíz y que las credenciales de Turso sean válidas antes de compilar.

## Estructura

```text
├── app.js
├── config/
├── controllers/
├── electron/
├── models/
├── public/
├── routes/
├── scripts/
└── views/
```

## Atajos

- `Alt + L`: Limpiar respuestas seleccionadas.
- `Alt + I`: Volver a la pantalla de inicio.
- `Ctrl + Enter`: Enviar examen actual.
