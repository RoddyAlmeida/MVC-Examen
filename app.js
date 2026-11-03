const path = require("path");
const express = require("express");
const session = require("express-session");
const { initializeDatabase } = require("./services/schemaMigration");
const { requireRole } = require("./middleware/access");
const authController = require("./controllers/authController");
const professorRoutes = require("./routes/professorRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("view cache");

app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: "examen-secret-key-mvc-2026",
  resave: false,
  saveUninitialized: true,
  cookie: { sameSite: "lax" },
}));

app.get("/", (req, res) => {
  if (req.session.role === "administrador") return res.redirect("/admin/dashboard");
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
app.use("/admin", requireRole("administrador"), adminRoutes);

app.use((req, res) => {
  res.status(404).render("errors/404", {
    title: "Pagina no encontrada",
  });
});

app.use((error, req, res, next) => {
  console.error("Request failed:", error.name);
  if (res.headersSent) return next(error);
  res.status(500).render("errors/generic", { title: "Error del servidor", message: "No se pudo completar la operacion. Intentalo de nuevo." });
});

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
