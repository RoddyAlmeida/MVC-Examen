function renderLogin(req, res) {
  res.render("login", { title: "Inicio de sesión" });
}

function loginAs(req, res) {
  const { role } = req.params;
  if (!["profesor", "estudiante"].includes(role)) {
    return res.redirect("/login");
  }
  req.session.role = role;
  if (role === "profesor") {
    res.redirect("/professor/dashboard");
  } else {
    res.redirect("/student/exams");
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.redirect("/login");
  });
}

module.exports = { renderLogin, loginAs, logout };
