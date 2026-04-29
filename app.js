const path = require("path");
const express = require("express");
const { sequelize } = require("./models");
const examRoutes = require("./routes/examRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/exam/start");
});

app.use("/exam", examRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", {
    title: "Pagina no encontrada",
  });
});

async function bootstrap() {
  await sequelize.sync();
  app.listen(PORT, () => {
    console.log(`Servidor activo en http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("No se pudo iniciar la aplicacion:", error);
  process.exit(1);
});
