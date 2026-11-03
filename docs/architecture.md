# Arquitectura hexagonal

El codigo ejecutable vive en `src/`. El nucleo expresa las reglas y los casos de uso; los adaptadores conectan ese nucleo con Express/EJS, Sequelize/Turso, Electron y QTI. La inyeccion de dependencias es explicita y no usa un contenedor externo.

## Recorrido inicial

1. `src/bootstrap/system.js`: construye los repositorios e inyecta los puertos en cada caso de uso.
2. `src/bootstrap/server.js`: inicializa el esquema sin borrar datos y arranca el servidor.
3. `src/adapters/http/app.js`: configura Express, sesiones, archivos estaticos y rutas.
4. `src/adapters/http/routes/`: muestra los endpoints y los permisos de cada operacion.
5. `src/application/`: contiene los flujos que ejecutan esas operaciones.

Los comandos `pnpm run dev`, `pnpm run electron`, `pnpm run seed` y `pnpm test` conservan su comportamiento. El refactor no cambia tablas, relaciones, URLs, credenciales ni vistas. El seed normal sigue siendo destructivo; `--demo` conserva los datos existentes.

## Capas

| Carpeta | Responsabilidad | Dependencias permitidas |
| --- | --- | --- |
| `src/domain/` | Reglas puras: preguntas, calificacion, crucigramas, cuentas, tiempos, ranking y metricas | Dominio |
| `src/ports/` | Contratos de operaciones requeridas y validacion de adaptadores | Puertos |
| `src/application/` | Casos de uso, autorizacion, inscripciones y coordinacion de transacciones | Dominio, puertos y otros casos de uso |
| `src/adapters/http/` | Rutas, peticiones, sesiones, CSRF y presentacion EJS/JSON | Puertos y sistema compuesto |
| `src/adapters/persistence/sequelize/` | Consultas, modelos, asociaciones, migraciones y transacciones | Sequelize/Turso y contratos del nucleo |
| `src/adapters/crypto/` | bcrypt y generacion criptografica de tokens | Librerias de criptografia |
| `src/adapters/import/` | Conversion de paquetes ZIP/XML QTI a preguntas | Parsers y reglas de preguntas |
| `src/adapters/desktop/` | Ventana Electron, IPC y restricciones de escritorio | Electron y arranque del servidor |
| `src/adapters/cli/` | Carga de datos de demostracion | Adaptadores de persistencia y dominio |
| `src/bootstrap/` | Composicion y arranque | Todas las capas |

La direccion principal es:

```text
Express / Electron
       |
       v
Adaptadores de entrada
       |
       v
Casos de uso ----> Dominio
       |
       v
Puertos <---- Adaptadores de salida
                   |
                   v
           Sequelize / Turso / bcrypt / QTI
```

La aplicacion conoce lo que necesita del puerto, pero no importa su implementacion. El arranque elige los adaptadores concretos.

## Casos de uso

Los modulos exportan fabricas como `createAuthentication`, `createEnrollmentService` y `createStudentUseCases`. Las dependencias entran como argumentos; no se importan modelos, Express ni bcrypt dentro de esas fabricas.

- `authentication.js`: login y registro, con repositorio de usuarios y puerto de contrasenas.
- `authorization.js`: roles actuales, autoria, inscripciones y permisos de acceso.
- `enrollment.js`: reglas compartidas para inscribir, invitar y activar accesos.
- `enrollmentActions.js`: flujos de cursos, integrantes, invitaciones y codigos.
- `professor.js`: creacion/importacion de examenes, preguntas y correccion manual.
- `student.js`: paginacion, guardado, validacion, calificacion y entrega.
- `examAccess.js`: seguridad, inicio, presencia, notificaciones y ranking.
- `activity.js` y `leaderboard.js`: coordinacion de consultas con calculos del dominio.
- `admin.js`: cuentas, asignaciones, cursos y administracion de examenes.

## Puertos de salida

`src/ports/contracts.js` enumera las operaciones requeridas por cada modulo. `assertPort` detecta metodos faltantes al construir el caso de uso, no durante la peticion de un usuario.

El puerto `data` es especifico de cada funcionalidad. Usa nombres como `listAccessibleExams`, `findActiveEnrollment`, `findOwnedExam` y `createResult`, no consultas Sequelize genericas. Las firmas completas estan en el repositorio correspondiente y en su llamada desde el caso de uso.

Los resultados son registros JavaScript planos, incluyendo sus asociaciones. El nucleo no llama `record.update()`, `record.destroy()` ni otros metodos del ORM. Solicita `data.update(record, values, options)` o `data.destroy(record, options)`. El adaptador conserva internamente la relacion entre el registro plano y la entidad persistida.

`unitOfWork.run(work)` coordina las operaciones atomicas. El argumento `transaction` recibido por `work` es un contexto opaco: se transmite a las operaciones de persistencia, sin inspeccionarlo en el nucleo. Los literales SQL, incluido el incremento de revision de seguridad, se construyen solo dentro de los adaptadores.

Otros puertos son `users.findByEmail/create`, `passwords.hash/compare/byteLength`, `tokens.hex` e `importQuestions(buffer)`.

## Entrada y presentacion

`src/adapters/http/controller.js` convierte una peticion en un contexto de datos: `body`, `query`, `params`, identidad/estado de sesion y registros de curso/examen ya autorizados. No entrega los objetos reales `req`, `res`, la cookie ni los metodos de Express al caso de uso.

Los flujos que producen pantallas reciben un puerto de presentacion `output`. Este conserva los identificadores de vistas, destinos de navegacion y codigos existentes mediante `render`, `redirect`, `json`, `status`, `sendStatus`, `set` y `signOut`. Es un contrato orientado a la interfaz actual, no una nueva API REST. Solo el adaptador ejecuta esas instrucciones sobre Express.

Los cambios al estado de sesion se sincronizan incluso ante errores, para conservar los limites de intentos. Cuando un middleware llama `next`, entrega el contexto actualizado sin sobrescribir posteriormente lo que cambien los siguientes handlers.

La representacion HTML permanece en `views/`, y los recursos de interfaz en `public/`. No contienen reglas de persistencia.

## Ejemplo de sustitucion

Un caso de uso puede probarse sin HTTP ni base de datos:

```js
const { createAuthentication } = require("../src/application/authentication");

const accounts = new Map();
const authentication = createAuthentication({
  users: {
    async findByEmail(email) { return accounts.get(email); },
    async create(account) { accounts.set(account.email, account); },
  },
  passwords: {
    async hash(value) { return `test:${value}`; },
    async compare(value, hashed) { return hashed === `test:${value}`; },
  },
});
```

Este adaptador de contrasenas es exclusivamente para pruebas. La composicion normal usa bcrypt.

## Como ampliar el sistema

1. Agrega la regla pura al dominio si no necesita I/O.
2. Agrega o modifica un caso de uso en `src/application/`.
3. Declara en `src/ports/contracts.js` cualquier nueva operacion de persistencia requerida.
4. Implementa esa operacion en el repositorio del adaptador, devolviendo registros planos.
5. Conecta las nuevas dependencias en `src/bootstrap/system.js`.
6. Publica la operacion desde el adaptador HTTP y su ruta, conservando los guards y CSRF necesarios.
7. Prueba la regla y el caso de uso con adaptadores falsos; agrega una prueba HTTP si cambian permisos, sesiones o presentacion.

## Puntos de entrada

No hay carpetas MVC duplicadas en la raiz ni archivos de reexportacion. Todas las implementaciones e imports usan directamente `src/`.

| Comando | Implementacion |
| --- | --- |
| `pnpm run dev` / `pnpm start` | `src/bootstrap/server.js` |
| `pnpm run electron` | `src/adapters/desktop/main.js` |
| `pnpm run seed` | `src/adapters/cli/seed.js` |
| `pnpm test` | `test/` |

El preload vive junto al proceso principal, en `src/adapters/desktop/preload.js`. Los imports antiguos de las carpetas MVC ya no estan disponibles; usa las implementaciones del dominio, la aplicacion o los adaptadores segun corresponda. Se retiro tambien el circuito de examen antiguo que no estaba conectado al servidor.

## Verificacion

```bash
pnpm test
node --test test/architecture.test.js
```

Las pruebas de arquitectura cargan el nucleo con imports restringidos, verifican adaptadores falsos, contratos incompletos, registros planos y sincronizacion de sesiones. Las pruebas funcionales cubren permisos, migraciones, importacion, temporizador y ranking. La prueba de seed inicia el servidor con SQLite local y comprueba el login de los cinco perfiles, sus pantallas y el aislamiento de examenes.

Las pruebas no reinicializan la base remota de Turso. El control nativo de ventanas y atajos del sistema operativo sigue requiriendo una comprobacion manual en Electron.
