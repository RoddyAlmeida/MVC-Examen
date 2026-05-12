const { app, BrowserWindow, globalShortcut, shell, powerSaveBlocker, ipcMain } = require("electron");
const path = require("path");
const { startServer } = require("../app");

const EXAM_PORT = Number(process.env.PORT) || 3000;
const EXAM_URL = `http://localhost:${EXAM_PORT}/exam/start`;
let mainWindow;
let httpServer;
let powerSaveId;
let examLeaveTimer = null;
const LEAVE_TIMEOUT_MS = 2000;

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
    globalShortcut.register(shortcut, () => {});
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
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && ["Escape", "F11"].includes(input.key)) {
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
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      // Intentar forzar el foco si estamos en modo kiosk para dificultar el Alt+Tab
      if (mainWindow.isKiosk()) {
        mainWindow.focus();
      }

      mainWindow.webContents.send("security-event", { type: "left" });
      if (examLeaveTimer === null) {
        examLeaveTimer = setTimeout(function () {
          mainWindow.webContents.send("security-event", { type: "failed" });
          examLeaveTimer = null;
        }, LEAVE_TIMEOUT_MS);
      }
    }
  });

  mainWindow.on("focus", () => {
    mainWindow.webContents.send("security-event", { type: "returned" });
    if (examLeaveTimer !== null) {
      clearTimeout(examLeaveTimer);
      examLeaveTimer = null;
    }
  });

  ipcMain.on("close-exam-app", () => {
    app.exit(0);
  });

  ipcMain.on("enter-fullscreen", () => {
    if (mainWindow) {
      mainWindow.setFullScreen(true);
      mainWindow.setKiosk(true);
      // Forzar por encima de todo, incluso de la barra de tareas
      // El nivel 'screen-saver' es el más alto en macOS/Windows
      mainWindow.setAlwaysOnTop(true, "screen-saver");
      mainWindow.setSkipTaskbar(true);
      
      // Asegurar que recupere el foco
      mainWindow.focus();
    }
  });

  ipcMain.on("exit-fullscreen", () => {
    if (mainWindow) {
      mainWindow.setKiosk(false);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setSkipTaskbar(false);
      mainWindow.setFullScreen(false);
    }
  });

  mainWindow.loadURL(EXAM_URL);
}

async function bootstrapElectron() {
  httpServer = await startServer(EXAM_PORT);
  await app.whenReady();

  powerSaveId = powerSaveBlocker.start("prevent-display-sleep");
  registerBlockedShortcuts();
  createMainWindow();
}

bootstrapElectron().catch((error) => {
  console.error("No se pudo iniciar Electron:", error);
  app.exit(1);
});

app.on("will-quit", () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
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
  if (httpServer) {
    event.preventDefault();
    httpServer.close(() => {
      app.exit(0);
    });
  }
});
