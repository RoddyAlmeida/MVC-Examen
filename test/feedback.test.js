const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const { createNavigationFeedback } = require("../src/adapters/desktop/navigationFeedback");

function harness() {
    function element() {
        return {
            hidden: true, dataset: {}, attributes: {}, textContent: "", handlers: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            removeAttribute(name) { delete this.attributes[name]; },
            hasAttribute(name) { return name in this.attributes; },
            addEventListener(name, callback) { this.handlers[name] = callback; },
        };
    }
    class Form {
        constructor(action = "/login", method = "post") {
            Object.assign(this, element(), { action: `http://localhost:3000${action}`, method, enctype: "application/x-www-form-urlencoded", target: "" });
        }
    }
    const root = element();
    const message = element();
    const dismiss = element();
    const label = { textContent: "Entrar" };
    const button = Object.assign(element(), { value: "accept", disabled: false, formAction: "http://localhost:3000/student/exams", querySelector: () => label });
    const events = {};
    const windowEvents = {};
    const timers = new Map();
    let timerId = 0;
    let onNavigation;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/pageFeedback.js"), "utf8"), {
        document: {
            getElementById: id => ({ "page-feedback": root, "page-feedback-message": message, "page-feedback-dismiss": dismiss }[id]),
            addEventListener(name, callback) { events[name] = callback; },
        },
        window: { addEventListener(name, callback) { windowEvents[name] = callback; }, appFeedback: { onNavigation(callback) { onNavigation = callback; } } },
        HTMLFormElement: Form, URL, location: { href: "http://localhost:3000/login", origin: "http://localhost:3000", pathname: "/login", search: "" },
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); },
    });
    function submit(form = new Form(), options = {}) {
        const event = { target: form, submitter: button, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options };
        events.submit(event);
        return event;
    }
    return { Form, root, message, dismiss, button, label, events, windowEvents, timers, submit, navigation: state => onNavigation(state) };
}

test("every page entry point includes feedback and all EJS templates compile", () => {
    const ejs = require("ejs");
    const directory = path.join(__dirname, "../views");
    for (const filename of fs.readdirSync(directory, { recursive: true }).filter(filename => filename.endsWith(".ejs"))) {
        const source = fs.readFileSync(path.join(directory, filename), "utf8");
        assert.doesNotThrow(() => ejs.compile(source), filename);
        for (const match of source.matchAll(/include\s*\(\s*["']([^"']+)["']/g)) {
            assert.equal(match[1], match[1].trim(), `Whitespace in include: ${filename}`);
            const included = match[1].endsWith(".ejs") ? match[1] : `${match[1]}.ejs`;
            assert.ok(fs.existsSync(path.resolve(directory, path.dirname(filename), included)), `Missing include: ${filename} -> ${included}`);
        }
        if (source.includes("/js/themeToggle.js")) assert.ok(source.includes("page-feedback"), filename);
    }
});

test("login immediately announces loading without removing submitter values or disabling inputs", () => {
    const ui = harness();
    const form = new ui.Form();
    ui.submit(form);
    assert.equal(ui.message.textContent, "Iniciando sesión...");
    assert.equal(ui.root.dataset.state, "loading");
    assert.equal(form.attributes["aria-busy"], "true");
    assert.equal(ui.button.attributes["aria-busy"], "true");
    assert.equal(ui.button.disabled, false);
    assert.equal(ui.button.value, "accept");
    assert.equal(ui.label.textContent, "Iniciando sesión...");
    assert.equal(ui.submit(form).defaultPrevented, true);
});

test("canceled submissions, external destinations and dialog forms do not start a loading state", () => {
    const ui = harness();
    ui.submit(new ui.Form(), { defaultPrevented: true });
    const external = new ui.Form();
    external.action = "https://example.com";
    ui.submit(external);
    ui.submit(new ui.Form("/login", "dialog"));
    assert.equal(ui.root.hidden, true);
    assert.equal(ui.timers.size, 0);
});

test("slow operations stay pending without reporting failure or allowing duplicate submission", () => {
    const ui = harness();
    const form = new ui.Form("/student/courses/invitations/7/respond");
    ui.submit(form);
    [...ui.timers.values()][0]();
    assert.equal(ui.root.dataset.state, "slow");
    assert.match(ui.message.textContent, /sin volver a enviar/);
    assert.equal(ui.submit(form).defaultPrevented, true);
});

test("offline feedback keeps the outcome unconfirmed and is not overwritten by the slow timer", () => {
    const ui = harness();
    const form = new ui.Form();
    ui.submit(form);
    ui.windowEvents.offline();
    assert.match(ui.message.textContent, /Sin conexión/);
    assert.equal(ui.root.dataset.state, "slow");
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.submit(form).defaultPrevented, true);
});

test("history restoration clears stale loading indicators and restores button labels", () => {
    const ui = harness();
    const form = new ui.Form();
    ui.submit(form);
    ui.windowEvents.pageshow();
    assert.equal(ui.root.hidden, true);
    assert.equal(ui.label.textContent, "Entrar");
    assert.equal(ui.button.attributes["aria-busy"], undefined);
    assert.equal(ui.timers.size, 0);
    assert.equal(ui.submit(form).defaultPrevented, false);
});

test("Electron navigation failures stop the spinner and announce an unconfirmed outcome", () => {
    const ui = harness();
    ui.navigation({ status: "loading" });
    assert.equal(ui.message.textContent, "Cargando...");
    ui.navigation({ status: "error" });
    assert.equal(ui.root.dataset.state, "error");
    assert.match(ui.message.textContent, /no está confirmada/);
    assert.equal(ui.dismiss.hidden, false);
    assert.equal(ui.timers.size, 0);
    ui.navigation({ status: "ready" });
    assert.equal(ui.root.hidden, true);
});

test("navigation feedback ignores hashes, modified clicks and prevented navigation", () => {
    const ui = harness();
    const link = { href: "http://localhost:3000/login#help", target: "", hasAttribute: () => false };
    const event = { button: 0, target: { closest: () => link } };
    ui.events.click(event);
    assert.equal(ui.root.hidden, true);
    link.href = "http://localhost:3000/student/exams";
    ui.events.click({ ...event, ctrlKey: true });
    ui.events.click({ ...event, defaultPrevented: true });
    assert.equal(ui.root.hidden, true);
    ui.events.click(event);
    assert.equal(ui.root.dataset.state, "loading");
});

function desktop(startBackend = async () => { }) {
    const ipcMain = new EventEmitter();
    const handlers = {};
    ipcMain.handle = (name, handler) => { handlers[name] = handler; };
    const webContents = new EventEmitter();
    const states = [];
    const loads = [];
    let url = "about:blank";
    webContents.getURL = () => url;
    webContents.send = (_channel, state) => states.push(state);
    const window = {
        webContents, isDestroyed: () => false,
        async loadFile(filename) { url = pathToFileURL(filename).href; loads.push({ file: filename }); webContents.emit("did-finish-load"); },
        async loadURL(destination, options) {
            loads.push({ url: destination, options });
            url = destination;
            webContents.emit("did-start-navigation", {}, url, false, true);
            webContents.emit("did-navigate", {}, url, 200);
            webContents.emit("did-finish-load");
        },
    };
    const feedback = createNavigationFeedback({ window, ipcMain, appUrl: "http://localhost:3000/login", startBackend });
    return { window, webContents, ipcMain, handlers, states, loads, feedback };
}

test("Electron shows a local startup page before waiting for its backend and allows startup recovery", async () => {
    let attempts = 0;
    const ui = desktop(async () => { if (++attempts === 1) throw new Error("Database unavailable"); });
    await ui.feedback.connect();
    assert.ok(ui.loads[0].file.endsWith("status.html"));
    assert.equal(ui.states.at(-1).status, "error");
    assert.equal(ui.states.at(-1).stage, "startup");
    assert.equal(ui.handlers["app-navigation-state"]({ sender: {} }), null);
    ui.ipcMain.emit("app-navigation-retry", { sender: {} });
    assert.equal(attempts, 1);
    ui.ipcMain.emit("app-navigation-retry", { sender: ui.webContents });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(attempts, 2);
    assert.equal(ui.loads.at(-1).url, "http://localhost:3000/login");
    assert.equal(ui.states.at(-1).status, "ready");
});

test("native recovery returns to the last safe local URL using GET without replaying POST data", async () => {
    const ui = desktop();
    await ui.feedback.connect();
    ui.webContents.emit("did-navigate", {}, "http://localhost:3000/student/exams", 200);
    ui.webContents.emit("did-navigate", {}, "https://example.com", 200);
    ui.webContents.emit("did-fail-load", {}, -102, "Connection refused", "http://localhost:3000/student/exams/join", true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.states.at(-1).status, "error");
    assert.ok(ui.loads.at(-1).file.endsWith("status.html"));
    ui.ipcMain.emit("app-navigation-retry", { sender: ui.webContents });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.loads.at(-1).url, "http://localhost:3000/student/exams");
    assert.equal(ui.loads.at(-1).options, undefined);
    assert.equal(ui.states.at(-1).status, "ready");
    const loadCount = ui.loads.length;
    ui.ipcMain.emit("app-navigation-retry", { sender: ui.webContents });
    assert.equal(ui.loads.length, loadCount);
});

test("native feedback ignores canceled loads, subframes, external resources and hash navigation", async () => {
    const ui = desktop();
    await ui.feedback.connect();
    const count = ui.states.length;
    ui.webContents.emit("did-start-navigation", {}, "http://localhost:3000/login#help", true, true);
    ui.webContents.emit("did-fail-load", {}, -3, "Aborted", "http://localhost:3000/login", true);
    ui.webContents.emit("did-fail-load", {}, -102, "Unavailable", "http://localhost:3000/frame", false);
    ui.webContents.emit("did-fail-load", {}, -102, "Unavailable", "https://fonts.googleapis.com", true);
    assert.equal(ui.states.length, count);
});

test("Chromium error-page events cannot clear the native recovery screen before a successful navigation", async () => {
    const ui = desktop();
    await ui.feedback.connect();
    ui.webContents.emit("did-fail-load", {}, -106, "Offline", "http://localhost:3000/login", true);
    await new Promise(resolve => setImmediate(resolve));
    const currentUrl = ui.webContents.getURL;
    ui.webContents.getURL = () => "http://localhost:3000/login";
    ui.webContents.emit("did-start-navigation", {}, "http://localhost:3000/login", false, true);
    ui.webContents.emit("did-finish-load");
    assert.equal(ui.states.at(-1).status, "error");
    ui.webContents.getURL = currentUrl;
    ui.ipcMain.emit("app-navigation-retry", { sender: ui.webContents });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.states.at(-1).status, "ready");
});

test("preload exposes only feedback actions and does not overwrite new navigation with stale state", async () => {
    const bridges = {};
    const ipcRenderer = new EventEmitter();
    const sent = [];
    let snapshot;
    ipcRenderer.invoke = () => new Promise(resolve => { snapshot = resolve; });
    ipcRenderer.send = channel => sent.push(channel);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/adapters/desktop/preload.js"), "utf8"), {
        require(name) {
            assert.equal(name, "electron");
            return { contextBridge: { exposeInMainWorld(name, api) { bridges[name] = api; } }, ipcRenderer };
        },
    });
    assert.deepEqual(Object.keys(bridges.appFeedback), ["onNavigation", "retry"]);
    const states = [];
    const unsubscribe = bridges.appFeedback.onNavigation(state => states.push(state.status));
    ipcRenderer.emit("app-navigation", {}, { status: "ready" });
    snapshot({ status: "loading" });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(states, ["ready"]);
    unsubscribe();
    assert.equal(ipcRenderer.listenerCount("app-navigation"), 0);
    bridges.appFeedback.retry();
    assert.deepEqual(sent, ["app-navigation-retry"]);
});

test("notification refresh announces loading and failure and clears its warning after recovery", async () => {
    const badge = { dataset: {}, attributes: {}, textContent: "", setAttribute(name, value) { this.attributes[name] = value; } };
    let refresh;
    let reply;
    const pending = new Promise(resolve => { reply = resolve; });
    let fail = true;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/js/notifications.js"), "utf8"), {
        document: { hidden: false, querySelectorAll: () => [badge], addEventListener() { } },
        setInterval(callback) { refresh = callback; },
        fetch: async () => {
            if (fail) { await pending; throw new Error("Offline"); }
            return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ unread: 3 }) };
        },
    });
    assert.equal(badge.dataset.requestState, "loading");
    reply();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(badge.dataset.requestState, "error");
    assert.match(badge.title, /No se pudieron actualizar/);
    fail = false;
    await refresh();
    assert.equal(badge.dataset.requestState, "ready");
    assert.equal(badge.textContent, "(3)");
});