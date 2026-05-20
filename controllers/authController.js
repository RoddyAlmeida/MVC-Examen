const bcrypt = require("bcryptjs");
const { User } = require("../models");

function renderLogin(req, res) {
  res.render("login", { title: "Iniciar sesión", error: null, registered: req.query.registered === "1" });
}

function renderRegister(req, res) {
  res.render("register", { title: "Crear cuenta", error: null });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render("login", { title: "Iniciar sesión", error: "Correo y contraseña son obligatorios.", registered: false });
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.render("login", { title: "Iniciar sesión", error: "Correo o contraseña incorrectos.", registered: false });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.render("login", { title: "Iniciar sesión", error: "Correo o contraseña incorrectos.", registered: false });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.userName = user.name || user.email;

  if (user.role === "profesor") {
    res.redirect("/professor/dashboard");
  } else {
    res.redirect("/student/exams");
  }
}

async function register(req, res) {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.render("register", { title: "Crear cuenta", error: "Correo y contraseña son obligatorios." });
  }
  if (password.length < 4) {
    return res.render("register", { title: "Crear cuenta", error: "La contraseña debe tener al menos 4 caracteres." });
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return res.render("register", { title: "Crear cuenta", error: "Ya existe una cuenta con ese correo." });
  }

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ email, password: hashed, role: "estudiante", name: name || null });

  res.redirect("/login?registered=1");
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

module.exports = { renderLogin, renderRegister, login, register, logout };
