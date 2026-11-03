const { authentication } = require("../../../bootstrap/system");

function renderLogin(req, res) {
  res.render("login", { title: "Iniciar sesión", error: null, registered: req.query.registered === "1" });
}

function renderRegister(req, res) {
  res.render("register", { title: "Crear cuenta", error: null });
}

async function login(req, res) {
  const result = await authentication.login(req.body);
  if (result.error === "missing_credentials") {
    return res.render("login", { title: "Iniciar sesión", error: "Correo y contraseña son obligatorios.", registered: false });
  }

  if (result.error === "unavailable") {
    const error = result.cause;
    const status = error.parent?.original?.status || error.parent?.status;
    console.error("Login database lookup failed:", status ? `HTTP ${status}` : error.message);
    return res.status(503).render("login", {
      title: "Iniciar sesión",
      error: "No se pudo consultar la base de datos. Revisa la conexión con Turso e inténtalo de nuevo.",
      registered: false,
    });
  }
  if (result.error === "invalid_credentials") {
    return res.render("login", { title: "Iniciar sesión", error: "Correo o contraseña incorrectos.", registered: false });
  }

  const user = result.user;
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.userName = user.name;

  if (user.role === "administrador") {
    res.redirect("/admin/dashboard");
  } else if (user.role === "profesor") {
    res.redirect("/professor/dashboard");
  } else {
    res.redirect("/student/exams");
  }
}

async function register(req, res) {
  const result = await authentication.register(req.body);
  if (result.error === "missing_credentials") {
    return res.render("register", { title: "Crear cuenta", error: "Correo y contraseña son obligatorios." });
  }
  if (result.error === "short_password") {
    return res.render("register", { title: "Crear cuenta", error: "La contraseña debe tener al menos 4 caracteres." });
  }

  if (result.error === "duplicate_email") {
    return res.render("register", { title: "Crear cuenta", error: "Ya existe una cuenta con ese correo." });
  }

  res.redirect("/login?registered=1");
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

module.exports = { renderLogin, renderRegister, login, register, logout };
