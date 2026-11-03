const path = require("node:path");
const { pathToFileURL } = require("node:url");

function createNavigationFeedback({ window, ipcMain, appUrl, startBackend }) {
    const statusFile = path.join(__dirname, "status.html");
    const statusUrl = pathToFileURL(statusFile).href;
    let state = { status: "loading", stage: "startup" };
    let lastUrl = appUrl;
    let backendStarted = false;
    let connecting = false;
    let recovering = false;

    function publish(next) {
        state = next;
        if (!window.isDestroyed()) window.webContents.send("app-navigation", state);
    }

    function localUrl(url) {
        try { return new URL(url).origin === new URL(appUrl).origin; }
        catch (_error) { return false; }
    }

    async function showFailure(stage) {
        recovering = true;
        publish({ status: "error", stage });
        if (!window.isDestroyed() && window.webContents.getURL() !== statusUrl) await window.loadFile(statusFile);
    }

    async function connect() {
        if (connecting || window.isDestroyed()) return;
        connecting = true;
        try {
            publish({ status: "loading", stage: backendStarted ? "navigation" : "startup" });
            if (!backendStarted) {
                if (window.webContents.getURL() !== statusUrl) await window.loadFile(statusFile);
                await startBackend();
                backendStarted = true;
            }
            await window.loadURL(lastUrl);
        } catch (error) {
            if (error.code !== "ERR_ABORTED" && error.errno !== -3 && state.status !== "error") {
                await showFailure(backendStarted ? "navigation" : "startup");
            }
        } finally {
            connecting = false;
        }
    }

    window.webContents.on("did-start-navigation", (_event, url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace && localUrl(url) && !recovering) publish({ status: "loading", stage: "navigation" });
    });
    window.webContents.on("did-navigate", (_event, url, responseCode) => {
        if (localUrl(url) && responseCode >= 200 && responseCode < 400) {
            lastUrl = url;
            recovering = false;
        }
    });
    window.webContents.on("did-finish-load", () => {
        if (window.webContents.getURL() === statusUrl || recovering) publish(state);
        else publish({ status: "ready", stage: "navigation" });
    });
    window.webContents.on("did-fail-load", (_event, code, _description, url, mainFrame) => {
        if (!mainFrame || code === -3 || url && !localUrl(url)) return;
        showFailure("navigation").catch(() => {
            publish({ status: "error", stage: "navigation" });
        });
    });
    ipcMain.handle("app-navigation-state", event => event.sender === window.webContents ? state : null);
    ipcMain.on("app-navigation-retry", event => {
        if (event.sender === window.webContents && window.webContents.getURL() === statusUrl) connect();
    });
    return { connect };
}

module.exports = { createNavigationFeedback };