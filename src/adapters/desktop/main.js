const { app, BrowserWindow, globalShortcut, shell, powerSaveBlocker, ipcMain } = require("electron");
const path = require("path");
const { startServer } = require("../../bootstrap/server");

const EXAM_PORT = Number(process.env.PORT) || 3000;
const EXAM_URL = `http://localhost:${EXAM_PORT}/login`;
let mainWindow;
let httpServer;
let powerSaveId;
let examMode = "none";

function setExamMode(mode) {
  examMode = mode;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const locked = mode === "locked";
  mainWindow.setKiosk(locked);
  mainWindow.setAlwaysOnTop(locked, "screen-saver");
  mainWindow.setSkipTaskbar(locked);
  mainWindow.setFullScreen(locked);
  if (locked) { registerBlockedShortcuts(); mainWindow.focus(); }
  else globalShortcut.unregisterAll();
}

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === `http://localhost:${EXAM_PORT}`;
  } catch (_error) {
    return false;
  }
}

function registerBlockedShortcuts() {
  const shortcuts = [
    // DevTools
    "CommandOrControl+Shift+I",
    "F12",
    // Reload
    "CommandOrControl+R",
    "F5",
    // Back navigation
    "Alt+Left",
    // Fullscreen toggle (belt + suspenders junto con kiosk mode)
    "F11",
    // Windows system keys
    "Super+D",
    "Super+M",
    "Super+Tab",
    "Super+Space",
  ];

  shortcuts.forEach((shortcut) => {
    globalShortcut.register(shortcut, () => { });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    fullscreen: false,
    kiosk: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      return { action: "allow" };
    }

    shell.beep();
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      shell.beep();
      return;
    }
    if (examMode === "locked" && new URL(url).pathname !== new URL(mainWindow.webContents.getURL()).pathname) {
      event.preventDefault();
      mainWindow.webContents.send("security-event", { type: "left" });
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (examMode === "locked" && input.type === "keyDown" && ["Escape", "F11"].includes(input.key)) {
      event.preventDefault();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("leave-full-screen", () => {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isKiosk()) {
      mainWindow.setFullScreen(true);
    }
  });

  mainWindow.on("blur", () => {
    if (examMode !== "none" && mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      // Intentar forzar el foco si estamos en modo kiosk para dificultar el Alt+Tab
      if (mainWindow.isKiosk()) {
        mainWindow.focus();
      }

      mainWindow.webContents.send("security-event", { type: "left" });
    }
  });

  mainWindow.on("focus", () => {
    if (examMode !== "none") mainWindow.webContents.send("security-event", { type: "returned" });
  });

  mainWindow.on("close", event => { if (examMode === "locked") { event.preventDefault(); shell.beep(); } });
  mainWindow.webContents.on("did-finish-load", async () => {
    const active = await mainWindow.webContents.executeJavaScript('Boolean(document.querySelector("[data-exam-session]"))');
    if (!active) setExamMode("none");
  });

  ipcMain.on("close-exam-app", () => {
    if (examMode !== "locked") app.quit();
  });

  ipcMain.on("enter-fullscreen", (event, mode) => {
    if (event.sender === mainWindow.webContents && ["locked", "monitored"].includes(mode) && /\/student\/exams\/\d+\/take$/.test(new URL(event.sender.getURL()).pathname)) setExamMode(mode);
  });

  ipcMain.on("exit-fullscreen", () => {
    setExamMode("none");
  });

  mainWindow.loadURL(EXAM_URL);
}

async function bootstrapElectron() {
  await app.whenReady();
  httpServer = await startServer(EXAM_PORT);

  powerSaveId = powerSaveBlocker.start("prevent-display-sleep");
  createMainWindow();
}

bootstrapElectron().catch((error) => {
  console.error("No se pudo iniciar Electron:", error);
  app.exit(1);
});

app.on("will-quit", () => {
  try { globalShortcut.unregisterAll(); } catch (_) { }
  if (powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (examMode === "locked") { event.preventDefault(); shell.beep(); return; }
  if (httpServer) {
    event.preventDefault();
    httpServer.close(() => {
      app.exit(0);
    });
  }
});
