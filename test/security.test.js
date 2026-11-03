const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Electron restricts only locked exams and never invalidates or quits a monitored exam", async () => {
    const app = new EventEmitter();
    app.whenReady = async () => {};
    app.quit = () => {};
    app.exit = () => assert.fail("An exam exit terminated the application");
    let window;
    let registered = 0;
    let unregistered = 0;
    const events = [];
    const ipcMain = new EventEmitter();
    ipcMain.handle = () => {};
    class BrowserWindow extends EventEmitter {
        constructor(options) {
            assert.equal(options.webPreferences.preload, path.join(__dirname, "../src/adapters/desktop/preload.js"));
            assert.ok(fs.existsSync(options.webPreferences.preload));
            super(); window = this;
            this.webContents = new EventEmitter();
            Object.assign(this.webContents, {
                getURL: () => "http://localhost:3000/student/exams/9/take",
                setWindowOpenHandler() {},
                send(channel, data) { if (channel === "security-event") events.push({ channel, data }); },
                async executeJavaScript() { return false; },
            });
        }
        setMenuBarVisibility() {}
        setKiosk(value) { this.kiosk = value; }
        setAlwaysOnTop(value) { this.alwaysOnTop = value; }
        setSkipTaskbar(value) { this.skipTaskbar = value; }
        setFullScreen(value) { this.fullscreen = value; }
        isKiosk() { return this.kiosk; }
        isDestroyed() { return false; }
        isVisible() { return true; }
        focus() {}
        show() {}
        loadURL() {}
        loadFile() {}
    }
    const electron = {
        app, BrowserWindow, ipcMain,
        globalShortcut: { register() { registered += 1; }, unregisterAll() { unregistered += 1; } },
        shell: { beep() {} },
        powerSaveBlocker: { start() { return 1; }, isStarted() { return true; }, stop() {} },
    };
    const context = vm.createContext({
        __dirname: path.join(__dirname, "../src/adapters/desktop"), process: { env: {}, platform: "darwin" }, console,
        URL,
        require(name) {
            if (name === "electron") return electron;
            if (name === "path") return path;
            if (name === "./navigationFeedback") return require("../src/adapters/desktop/navigationFeedback");
            if (name === "../../bootstrap/server") return { async startServer() { return { close(callback) { callback(); } }; } };
            throw new Error(`Unexpected require: ${name}`);
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/adapters/desktop/main.js"), "utf8"), context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(registered, 0);
    window.emit("blur");
    assert.equal(events.length, 0);
    ipcMain.emit("enter-fullscreen", { sender: window.webContents }, "monitored");
    assert.equal(window.kiosk, false);
    assert.equal(window.alwaysOnTop, false);
    window.emit("blur");
    assert.equal(events.at(-1).data.type, "left");
    let prevented = false;
    window.emit("close", { preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    ipcMain.emit("enter-fullscreen", { sender: window.webContents }, "locked");
    assert.equal(window.kiosk, true);
    assert.equal(window.fullscreen, true);
    assert.ok(registered > 0);
    window.emit("close", { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    ipcMain.emit("exit-fullscreen");
    assert.equal(window.kiosk, false);
    assert.equal(window.fullscreen, false);
    assert.ok(unregistered > 0);
    assert.equal(events.some(event => event.data.type === "failed"), false);
});

test("browser supervision reports focus changes without blocking or fabricating a grade", () => {
    const windowEvents = new Map();
    const documentEvents = new Map();
    const reports = [];
    const session = { dataset: { examId: "9", securityMode: "monitored", securityToken: "token", csrfToken: "csrf" } };
    const context = vm.createContext({
        document: { hidden: false, querySelector() { return session; }, getElementById() { return null; }, addEventListener(type, handler) { documentEvents.set(type, handler); } },
        window: { addEventListener(type, handler) { windowEvents.set(type, handler); } },
        navigator: { sendBeacon(endpoint, body) { reports.push({ endpoint, body }); return true; } },
        crypto: { randomUUID() { return "11111111-1111-4111-8111-111111111111"; } },
        URLSearchParams, URL, location: { origin: "http://localhost:3000", pathname: "/student/exams/9/take" },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/js/examSecurity.js"), "utf8"), context);
    windowEvents.get("blur")();
    windowEvents.get("blur")();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].body.get("type"), "blur");
    assert.equal(reports[0].body.get("token"), "token");
    assert.equal(reports[0].body.get("_csrf"), "csrf");
    windowEvents.get("focus")();
    windowEvents.get("blur")();
    assert.equal(reports.length, 2);
    windowEvents.get("pagehide")();
    assert.equal(reports.at(-1).body.get("type"), "navigation");
    assert.equal(session.inert, undefined);
});

test("background notification checks do not consume action confirmations", () => {
    const { prepareActions } = require("../src/adapters/http/middleware/requestSecurity");
    const notice = { kind: "success", message: "Invitacion enviada" };
    const req = { method: "GET", path: "/notifications/count", session: { actionNotice: notice } };
    const res = { locals: {} };
    prepareActions(req, res, () => {});
    assert.equal(req.session.actionNotice, notice);
    req.path = "/exams/9/activity";
    prepareActions(req, res, () => {});
    assert.equal(req.session.actionNotice, notice);
    req.path = "/dashboard";
    prepareActions(req, res, () => {});
    assert.equal(res.locals.actionNotice, notice);
    assert.equal(req.session.actionNotice, undefined);
});