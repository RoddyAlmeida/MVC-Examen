const roles = { estudiante: "Estudiante", profesor: "Profesor", administrador: "Administrador" };

class AdminError extends Error { }

function validateAccount(body, creating = true) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role;
  if (!name || name.length > 120) throw new AdminError("Indica un nombre de hasta 120 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AdminError("Indica un correo valido.");
  if (!Object.hasOwn(roles, role)) throw new AdminError("Selecciona un rol valido.");
  const password = body.password;
  if ((creating || password) && (typeof password !== "string" || password.length < 8 || password.length > 72)) {
    throw new AdminError("La contrasena debe tener entre 8 y 72 caracteres.");
  }
  return { name, email, role };
}

module.exports = { roles, AdminError, validateAccount };