import { safeError, safeLog } from "../utils/safe-log.js";
import { windowManager } from "../window-manager.js";

const { ipcMain } = require("electron") as typeof import("electron");

// Dynamic import to handle cases where electron-updater is not available
let autoUpdater: any = null;

async function getAutoUpdater() {
  if (!autoUpdater) {
    try {
      const mod = await import("electron-updater");
      autoUpdater = mod.autoUpdater;
    } catch {
      safeError("[Updater] electron-updater not available");
    }
  }
  return autoUpdater;
}

export function registerUpdaterHandlers(): void {
  ipcMain.handle("app:check-for-updates", async () => {
    const updater = await getAutoUpdater();
    if (updater) {
      try {
        await updater.checkForUpdates();
      } catch (error) {
        safeError("[Updater] Check failed:", error);
      }
    }
  });

  ipcMain.handle("app:install-update", async () => {
    const updater = await getAutoUpdater();
    if (updater) {
      updater.quitAndInstall();
    }
  });
}

export function unregisterUpdaterHandlers(): void {
  ipcMain.removeHandler("app:check-for-updates");
  ipcMain.removeHandler("app:install-update");
}

/**
 * Initialize auto-updater event forwarding.
 * Called from main.ts after app is ready.
 */
export async function initUpdaterEvents(): Promise<void> {
  const updater = await getAutoUpdater();
  if (!updater) return;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on("update-available", (info: any) => {
    safeLog("[Updater] Update available:", info.version);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-available", info);
    }
  });

  updater.on("update-downloaded", (info: any) => {
    safeLog("[Updater] Update downloaded:", info.version);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-downloaded", info);
    }
  });

  updater.on("error", (error: Error) => {
    safeError("[Updater] Error:", error.message);
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app:update-error", error.message);
    }
  });
}
