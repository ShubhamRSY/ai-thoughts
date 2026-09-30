/**
 * AiTo desktop shell (Windows / macOS).
 * Loads the live site + auto-updates the installed .exe from GitHub Releases.
 */
const { app, BrowserWindow, shell, session, dialog } = require("electron");
const path = require("path");
const { openExternalSafely, isSiteOrigin } = require("./safe-external");

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

  // New windows never open in-app; links go to the browser, and only for
  // https/http/mailto (safe-external.js — other schemes can run OS handlers).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(shell, url);
    return { action: "deny" };
  });

  // Only the site itself loads in the window — both for links (will-navigate)
  // and for server redirects (will-redirect), which otherwise let a
  // same-origin URL land the window on another site.
  const keepOnSite = (event, url) => {
    if (isSiteOrigin(url, SITE_URL)) return;
    event.preventDefault();
    openExternalSafely(shell, url);
  };
  mainWindow.webContents.on("will-navigate", (event) => keepOnSite(event, event.url));
  mainWindow.webContents.on("will-redirect", (event) => {
    if (event.isMainFrame) keepOnSite(event, event.url);
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
  // Camera/microphone (recording takes) only for the site itself — not for
  // any third-party iframe it embeds. Everything else is refused.
  const allowed = (permission, url) =>
    (permission === "media" || permission === "mediaKeySystem") && isSiteOrigin(url, SITE_URL);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed(permission, details.requestingUrl));
  });
  // Checks (not prompts): tighten only camera/mic; every other check keeps
  // Electron's default answer, as before this handler existed (e.g. the
  // clipboard write behind "copy link").
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    permission === "media" || permission === "mediaKeySystem" ? allowed(permission, requestingOrigin) : true
  );

  createWindow();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
