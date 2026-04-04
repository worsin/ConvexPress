import { ipcMain } from "electron";
import {
  AppUpdater,
  type UpdateCheckResult,
  type UpdateProgress,
} from "../app-updater.js";
import { windowManager } from "../window-manager.js";

let updater: AppUpdater | null = null;

export function initAppUpdater(installPath: string): void {
  updater = new AppUpdater(installPath);

  updater.on("update-available", (result: UpdateCheckResult) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:available", result);
    }
  });

  updater.on("update-check-error", (err: Error) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:check-error", err.message);
    }
  });

  updater.on("update-progress", (progress: UpdateProgress) => {
    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update:progress", progress);
    }
  });

  updater.startPeriodicCheck();
}

export function stopAppUpdater(): void {
  if (updater) {
    updater.stopPeriodicCheck();
    updater = null;
  }
}

export function registerAppUpdaterHandlers(): void {
  ipcMain.handle("app-update:check", async () => {
    if (!updater) return null;
    return updater.checkForUpdate();
  });

  ipcMain.handle("app-update:install", async () => {
    if (!updater) throw new Error("Updater not initialized");
    await updater.performUpdate();
  });
}

export function unregisterAppUpdaterHandlers(): void {
  ipcMain.removeHandler("app-update:check");
  ipcMain.removeHandler("app-update:install");
}
