"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examSecurity", {
  onSecurityEvent(callback) {
    ipcRenderer.on("security-event", (_event, data) => callback(data));
  },
  closeApp() {
    ipcRenderer.send("close-exam-app");
  },
  enterFullscreen() {
    ipcRenderer.send("enter-fullscreen");
  },
  exitFullscreen() {
    ipcRenderer.send("exit-fullscreen");
  },
});
