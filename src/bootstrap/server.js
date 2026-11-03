const { initializeDatabase } = require("../adapters/persistence/sequelize/schemaMigration");
const { app } = require("../adapters/http/app");
const PORT = process.env.PORT || 3000;

async function startServer(port = PORT) {
  await initializeDatabase();
  return app.listen(port, () => {
    console.log(`Servidor activo en http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("No se pudo iniciar la aplicacion:", error);
    process.exit(1);
  });
}

module.exports = { app, startServer };
