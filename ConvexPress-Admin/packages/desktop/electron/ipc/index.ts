import { ipcMain, app } from "electron";
import { registerWindowHandlers, unregisterWindowHandlers } from "./window.js";
import { registerConfigHandlers, unregisterConfigHandlers } from "./config.js";
import { registerAuthHandlers, unregisterAuthHandlers } from "./auth.js";
import { registerSetupHandlers, unregisterSetupHandlers } from "./setup.js";

export function registerAllIpcHandlers(): void {
  registerWindowHandlers();
  registerConfigHandlers();
  registerAuthHandlers();
  registerSetupHandlers();

  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:get-platform", () => {
    return {
      os: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
    };
  });

  ipcMain.handle("app:quit", () => {
    app.quit();
  });

  // Shell updater: check for updates on demand
  ipcMain.handle("app:check-for-updates", async () => {
    try {
      const { autoUpdater } = await import("electron-updater");
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      console.error("[IPC] Failed to check for updates:", error);
    }
  });

  // Shell updater: install downloaded update and restart
  ipcMain.handle("app:install-update", async () => {
    try {
      const { autoUpdater } = await import("electron-updater");
      autoUpdater.quitAndInstall();
    } catch (error) {
      console.error("[IPC] Failed to install update:", error);
    }
  });
}

export function unregisterAllIpcHandlers(): void {
  unregisterWindowHandlers();
  unregisterConfigHandlers();
  unregisterAuthHandlers();
  unregisterSetupHandlers();

  ipcMain.removeHandler("app:get-version");
  ipcMain.removeHandler("app:get-platform");
  ipcMain.removeHandler("app:quit");
  ipcMain.removeHandler("app:check-for-updates");
  ipcMain.removeHandler("app:install-update");
}
