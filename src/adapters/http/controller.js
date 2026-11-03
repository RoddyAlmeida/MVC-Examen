const { toRecord } = require("../persistence/sequelize/repositories/records");

function adapt(useCase, options = {}) {
  return (req, res, next) => {
    const session = Object.fromEntries(Object.entries(req.session || {}).filter(([key, value]) => key !== "cookie" && typeof value !== "function"));
    const context = {
      body: req.body || {}, query: req.query || {}, params: req.params || {},
      session, method: req.method, file: req.file,
      course: toRecord(req.course), courses: toRecord(req.courses), exam: toRecord(req.exam),
    };
    const output = {
      locals: { courses: toRecord(res.locals?.courses || []), startErrors: res.locals?.startErrors || [] }, headers: {},
      status(code) { this.code = code; return this; },
      render(view, data) { this.action = { kind: "render", view, data }; return this; },
      redirect(path) { this.action = { kind: "redirect", path }; return this; },
      json(data) { this.action = { kind: "json", data }; return this; },
      send(data) { this.action = { kind: "send", data }; return this; },
      sendStatus(code) { this.action = { kind: "sendStatus", code }; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      signOut(path) { this.action = { kind: "signOut", path }; return this; },
    };
    let forwarded = false;
    function synchronize() {
      if (req.session) {
        for (const key of Object.keys(req.session)) {
          if (key !== "cookie" && typeof req.session[key] !== "function" && !Object.hasOwn(session, key)) delete req.session[key];
        }
        Object.assign(req.session, session);
      }
      for (const key of ["course", "courses", "exam"]) {
        if (context[key] !== undefined) req[key] = context[key];
      }
      if (res.locals) Object.assign(res.locals, output.locals);
    }
    function present() {
      if (forwarded) return;
      synchronize();
      for (const [name, value] of Object.entries(output.headers)) res.set(name, value);
      if (output.code !== undefined) res.status(output.code);
      const action = output.action;
      if (!action) return;
      if (action.kind === "signOut") return req.session.destroy(() => res.redirect(action.path));
      if (action.kind === "render") return res.render(action.view, action.data);
      if (action.kind === "redirect") return options.redirect ? options.redirect(req, res, action.path) : res.redirect(action.path);
      if (action.kind === "sendStatus") return res.sendStatus(action.code);
      return res[action.kind](action.data);
    }
    try {
      const result = useCase(context, output, () => { synchronize(); forwarded = true; next(); });
      return result && typeof result.then === "function"
        ? result.then(present, error => { synchronize(); throw error; }) : present();
    } catch (error) {
      synchronize();
      throw error;
    }
  };
}

function createController(useCases, handlers) {
  return { ...useCases, ...Object.fromEntries(handlers.map(name => [name, adapt(useCases[name])])) };
}

module.exports = { adapt, createController };