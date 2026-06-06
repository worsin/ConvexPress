import path from "node:path";
import { appendFileSync, writeFileSync } from "node:fs";
import { registerAllIpcHandlers } from "./ipc/index.js";
import { initAppUpdater } from "./ipc/app-updater.js";
import { initUpdaterEvents } from "./ipc/updater.js";
import { createTray } from "./tray.js";
import { JsonStore } from "./utils/json-store.js";
import { setQuitting } from "./utils/app-state.js";
import { safeError, safeLog } from "./utils/safe-log.js";
import { isDev } from "./utils/platform.js";
import { windowManager } from "./window-manager.js";
import { readManifest } from "./version.js";

const {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  session,
} = require("electron") as typeof import("electron");

// ---------- IMPORTANT: Set app name and userData BEFORE anything reads them ----------
app.setName("ConvexPress");

if (isDev()) {
  app.setPath("userData", path.join(app.getPath("userData"), "-dev"));
}

// ---------- File Logger (for debugging packaged builds) ----------
const LOG_FILE = path.join(app.getPath("userData"), "convexpress-debug.log");

function fileLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    /* ignore */
  }
  safeLog(msg);
}

// Clear log on startup
try {
  writeFileSync(
    LOG_FILE,
    `=== ConvexPress started ${new Date().toISOString()} ===\n`
  );
} catch {
  /* ignore */
}

// ---------- Fix PATH for macOS .app bundles ----------
const fixPath = require("fix-path");
fixPath();

// Safety net: ensure common tool directories are present on macOS
if (process.platform === "darwin") {
  const home = process.env.HOME ?? "";
  const ensure = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    `${home}/.bun/bin`,
    `${home}/.volta/bin`,
    `${home}/.local/bin`,
    `${home}/.cargo/bin`,
  ];
  const parts = (process.env.PATH ?? "").split(":");
  const missing = ensure.filter((p) => !parts.includes(p));
  if (missing.length) {
    process.env.PATH = [...missing, ...parts].join(":");
  }
}

// ---------- Config Store ----------
const store = new JsonStore({ name: "convexpress-config" });

// ---------- Global Error Handling ----------

process.on("uncaughtException", (error) => {
  safeError("[Main] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  safeError("[Main] Unhandled rejection:", reason);
});

// ---------- Setup State Check ----------

/**
 * Check whether initial setup has been completed.
 * ConvexPress bundles the SPA at build time, so we only need to verify
 * that the user has configured a Convex URL and marked setup as complete.
 */
function isSetupComplete(): boolean {
  const setupComplete = store.get("setupComplete") as boolean | undefined;
  const convexUrl = store.get("convexUrl") as string | undefined;

  return !!(setupComplete && convexUrl);
}

function removeDeprecatedSecretsFromConfig(): void {
  if (store.get("adminKey") !== undefined) {
    store.delete("adminKey");
    fileLog("[Main] Removed deprecated deploy key from desktop config");
  }
}

// ---------- Launch Helpers ----------

function launchApp(): void {
  createTray(windowManager);

  const mainWindow = windowManager.createMainWindow();

  // Forward OS theme changes to the main window
  nativeTheme.on("updated", () => {
    const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("theme:os-changed", theme);
    }
  });

  // Initialize app-content updater (git-based, primary system)
  // Only when packaged and a version manifest exists (indicates git-managed install)
  if (app.isPackaged && !isDev()) {
    const installPath = path.dirname(app.getAppPath());
    const manifest = readManifest(installPath);
    if (manifest) {
      fileLog(`[Main] App-content updater initialized at ${installPath}`);
      initAppUpdater(installPath);
    } else {
      fileLog("[Main] No version manifest found — app-content updater skipped");
    }
  }

  // Initialize shell updater (electron-updater for DMG/EXE auto-updates)
  initUpdaterEvents().catch((err) => {
    fileLog(`[Main] Shell auto-updater init failed: ${err}`);
  });
}

// ---------- Single Instance Lock ----------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Focus whichever setup/app window is active when a second instance opens.
    const win = windowManager.getMainWindow() ?? windowManager.getWizardWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// ---------- App Lifecycle ----------

app.whenReady().then(async () => {
  fileLog("[Main] App ready");
  removeDeprecatedSecretsFromConfig();

  // ---------- Content-Security-Policy Headers ----------
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev()
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
          "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https://*.convex.cloud https://*.convex.site https://convex.cloud https://secure.gravatar.com",
          "media-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https://*.convex.cloud https://*.convex.site",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
        ].join("; ")
      : [
          "default-src 'self' file: blob:",
          "script-src 'self' file: 'unsafe-inline'",
          "style-src 'self' file: 'unsafe-inline'",
          "connect-src 'self' https://*.convex.cloud https://*.convex.dev https://*.convex.site wss://*.convex.cloud wss://*.convex.dev https://convex.cloud https://convex.dev",
          "img-src 'self' file: data: blob: https://*.convex.cloud https://*.convex.site https://convex.cloud https://secure.gravatar.com",
          "media-src 'self' file: data: blob: https://*.convex.cloud https://*.convex.site",
          "font-src 'self' file: data:",
          "frame-ancestors 'none'",
        ].join("; ");

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // ---------- Register IPC Handlers ----------
  registerAllIpcHandlers();

  // ---------- Handle Wizard -> App Transition ----------
  let appLaunched = false;

  ipcMain.handle("app:reload-from-setup", () => {
    if (appLaunched) return;
    appLaunched = true;
    fileLog("[Main] Setup complete — launching app");

    // Destroy all existing windows (wizard)
    for (const win of BrowserWindow.getAllWindows()) {
      win.destroy();
    }

    launchApp();
  });

  // ---------- Check Setup State and Launch ----------
  if (isSetupComplete()) {
    fileLog("[Main] Setup complete — launching app");
    launchApp();
  } else {
    fileLog("[Main] Setup not complete — showing wizard");
    windowManager.createWizardWindow();
  }
});

// Keep app alive when all windows are closed (tray stays active)
app.on("window-all-closed", () => {
  // Do nothing — app stays alive via tray
});

// macOS: recreate main window when dock icon is clicked
app.on("activate", () => {
  if (isSetupComplete()) {
    windowManager.createMainWindow();
  } else {
    windowManager.createWizardWindow();
  }
});

// Ordered cleanup before quit
app.on("before-quit", () => {
  fileLog("[Main] App quitting — cleaning up");
  setQuitting(true);
});
