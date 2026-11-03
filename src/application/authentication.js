const { assertPort, contracts } = require("../ports");

function createAuthentication({ users, passwords }) {
  assertPort("users", users, contracts.users);
  assertPort("passwords", passwords, contracts.passwords);
  function credentials(input) {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!email || !input.password) return { error: "missing_credentials" };
    return { email, password: input.password };
  }

  return {
    async login(input) {
      const values = credentials(input);
      if (values.error) return values;
      let user;
      try {
        user = await users.findByEmail(values.email);
      } catch (cause) {
        return { error: "unavailable", cause };
      }
      if (!user || !await passwords.compare(values.password, user.password)) {
        return { error: "invalid_credentials" };
      }
      return { user: { id: user.id, role: user.role, name: user.name || user.email } };
    },

    async register(input) {
      const values = credentials(input);
      if (values.error) return values;
      if (values.password.length < 4) return { error: "short_password" };
      if (await users.findByEmail(values.email)) return { error: "duplicate_email" };
      await users.create({
        email: values.email,
        password: await passwords.hash(values.password),
        role: "estudiante",
        name: input.name || null,
      });
      return { registered: true };
    },
  };
}

module.exports = { createAuthentication };