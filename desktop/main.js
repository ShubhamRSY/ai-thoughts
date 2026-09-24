/**
 * AiTo desktop shell (Windows / macOS).
 * Loads the live site + auto-updates the installed .exe from GitHub Releases.
 */
const { app, BrowserWindow, shell, session, dialog } = require("electron");
const path = require("path");

const SITE_URL = process.env.AITO_SITE_URL || "https://aito.social";
const START_PATH = "/app";

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 860,
    minWidth: 360,
    minHeight: 640,
    backgroundColor: "#f2f0eb",
    title: "AiTo",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`${SITE_URL.replace(/\/$/, "")}${START_PATH}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      const allowed = new URL(SITE_URL);
      if (target.origin !== allowed.origin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Classic desktop auto-update:
 * 1) App checks GitHub Releases for a newer version
 * 2) Downloads in the background
 * 3) Asks user to restart → installs and relaunches
 *
 * Only runs in packaged builds (not `npm start` / electron .).
 */
function setupAutoUpdater() {
  // Store builds update through the Microsoft Store only (Store policy).
  if (!app.isPackaged || process.windowsStore) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    console.error("electron-updater missing:", err);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("Update available:", info.version);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const result = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "AiTo update ready",
      message: `Version ${info.version} is ready.`,
      detail: "Restart to install the update. Takes a few seconds.",
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
  });

  // Check on launch, then every 6 hours while the app stays open
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("Update check failed:", err);
  });
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    6 * 60 * 60 * 1000
  );
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "mediaKeySystem") {
      callback(true);
      return;
    }
    callback(false);
  });

  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
