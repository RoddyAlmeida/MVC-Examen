const path = require("path");
const express = require("express");
const session = require("express-session");
const { requireRole } = require("./middleware/access");
const authController = require("./controllers/authController");
const professorRoutes = require("./routes/professorRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");

function createApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../../..", "views"));
  app.disable("view cache");

  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(path.join(__dirname, "../../..", "public")));
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
  app.use((req, res, next) => { res.locals.req = req; next(); });
  app.use("/professor", requireRole("profesor"), professorRoutes);
  app.use("/student", requireRole("estudiante"), studentRoutes);
  app.use("/admin", requireRole("administrador"), adminRoutes);

  app.use((req, res) => {
    res.status(404).render("errors/404", { title: "Pagina no encontrada" });
  });
  app.use((error, req, res, next) => {
    console.error("Request failed:", error.name);
    if (res.headersSent) return next(error);
    const submissionFailed = req.method === "POST" && /^\/student\/exams\/\d+\/take$/.test(req.path);
    res.status(500).render("errors/generic", {
      title: "Error del servidor",
      message: submissionFailed ? "La solicitud terminó con un error y no podemos confirmar que se haya guardado." : "No se pudo completar la operación. Puedes volver a tu espacio y comprobar su estado.",
      submissionFailed,
    });
  });
  return app;
}

module.exports = { app: createApp(), createApp };