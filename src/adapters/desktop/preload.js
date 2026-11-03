"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appFeedback", {
  onNavigation(callback) {
    let received = false;
    const listener = (_event, state) => { received = true; callback(state); };
    ipcRenderer.on("app-navigation", listener);
    ipcRenderer.invoke("app-navigation-state").then(state => {
      if (!received && state) callback(state);
    }).catch(() => {});
    return () => ipcRenderer.removeListener("app-navigation", listener);
  },
  retry() {
    ipcRenderer.send("app-navigation-retry");
  },
});

contextBridge.exposeInMainWorld("examSecurity", {
  onSecurityEvent(callback) {
    ipcRenderer.on("security-event", (_event, data) => callback(data));
  },
  closeApp() {
    ipcRenderer.send("close-exam-app");
  },
  enterFullscreen(mode = "locked") {
    ipcRenderer.send("enter-fullscreen", mode);
  },
  exitFullscreen() {
    ipcRenderer.send("exit-fullscreen");
  },
});