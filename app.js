const path = require("path");
const express = require("express");
const session = require("express-session");
const { sequelize } = require("./models");
const authController = require("./controllers/authController");
const professorRoutes = require("./routes/professorRoutes");
const studentRoutes = require("./routes/studentRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("view cache");

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: "examen-secret-key-mvc-2026",
  resave: false,
  saveUninitialized: true,
  cookie: { sameSite: "lax" },
}));

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role === role) return next();
    res.redirect("/login");
  };
}

app.get("/", (req, res) => {
  if (req.session.role === "profesor") return res.redirect("/professor/dashboard");
  if (req.session.role === "estudiante") return res.redirect("/student/exams");
  res.redirect("/login");
});

app.get("/login", authController.renderLogin);
app.post("/login", authController.login);
app.get("/register", authController.renderRegister);
app.post("/register", authController.register);
app.get("/logout", authController.logout);

// Make session available to all views
app.use((req, res, next) => {
  res.locals.req = req;
  next();
});

app.use("/professor", requireRole("profesor"), professorRoutes);
app.use("/student", requireRole("estudiante"), studentRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", {
    title: "Pagina no encontrada",
  });
});

async function startServer(port = PORT) {
  await sequelize.sync();
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
