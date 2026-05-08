"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examSecurity", {
  onSecurityEvent(callback) {
    ipcRenderer.on("security-event", (_event, data) => callback(data));
  },
  closeApp() {
    ipcRenderer.send("close-exam-app");
  },
});
