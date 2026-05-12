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
