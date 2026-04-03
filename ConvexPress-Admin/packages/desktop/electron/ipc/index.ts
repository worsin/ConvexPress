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
}

export function unregisterAllIpcHandlers(): void {
  unregisterWindowHandlers();
  unregisterConfigHandlers();
  unregisterAuthHandlers();
  unregisterSetupHandlers();

  ipcMain.removeHandler("app:get-version");
  ipcMain.removeHandler("app:get-platform");
  ipcMain.removeHandler("app:quit");
}
